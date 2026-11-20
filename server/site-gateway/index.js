/**
 * Site Gateway — widget chat backend for Mess&Anger.
 *
 * Endpoints:
 *   POST   /v1/sites                     — owner creates a site (auth: Bearer SITE_OWNER_TOKEN)
 *   GET    /v1/widget/config?site=ID     — public widget config (site_pubkey, settings)
 *   GET    /v1/guest/pow-challenge       — proof-of-work challenge
 *   POST   /v1/guest/session             — guest session: site_id, guest_pubkey, PoW → guest_token, thread_id
 *   GET    /v1/guest/history?after=      — thread history for a guest
 *   WS     /v1/guest/ws?token=TOKEN      — guest send/receive messages, typing, acks
 *   WS     /v1/owner/ws?token=TOKEN      — owner receives thread.new, message.new, thread.closed
 *
 * Env: see .env.example
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';
import dotenv from 'dotenv';

import {
  createSite, getSite, updateSite, listSitesByOwner, findSiteByDomain, listAllSites,
  createGuest, getGuest, updateGuest, listGuestsBySite,
  createThread, getThread, updateThread, listThreadsBySite, findThreadByGuestAndSite,
  createMessage, getMessage, updateMessage, listMessagesByThread, listUndeliveredBefore, purgeExpiredMessages,
  createNotification, getNotification, listNotifications, markNotificationRead, listUnreadNotifications,
  createHandoffToken, getHandoffToken, consumeHandoffToken, listHandoffTokens,
  recordStat, getStats, getStatsAll, HANDOFF_TTL_MS, getSiteByUsername,
  createBotToken, getBotToken, deleteBotToken, listBotTokens,
  createOAuthCode, getOAuthCode, consumeOAuthCode,
  hasUserConsent, grantUserConsent, revokeUserConsent, listUserConsents,
  createUserNotification, getUserNotifications, markUserNotificationRead,
  isNotifyRateLimited, incrementNotifyRateLimit,
  isSiteMuted, muteSite, unmuteSite, listMutedSites, getNotifyRateLimit,
  registerPushToken, getPushQueueId, listPushRegistrations,
} from './store.js';
import {
  generateX25519KeyPair, sharedSecret, deriveAesKey,
  encryptAes256Gcm, decryptAes256Gcm, randomToken, safeEqual,
} from './crypto.js';
import { x25519 } from '@noble/curves/ed25519.js';

dotenv.config();

// ───────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '8081', 10);
const SITE_OWNER_TOKEN = (process.env.SITE_OWNER_TOKEN || '').trim();
const CORS_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:1420')
    .split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
);
const POW_DIFFICULTY = parseInt(process.env.POW_DIFFICULTY || '16', 10);
const MESSAGE_RETENTION_MS = parseInt(process.env.MESSAGE_RETENTION_DAYS || '30', 10) * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_BYTES = parseInt(process.env.MAX_MESSAGE_BYTES || '4096', 10);

// ───────────────────────────────────────────────────────────────────────────
// OAuth 2.0 signing key (Ed25519) for ID tokens
// ───────────────────────────────────────────────────────────────────────────

const OAUTH_ISSUER = 'https://mess.cvr.name';
const oauthKeyPair = x25519.utils.randomSecretKey();
const oauthPublicKey = x25519.getPublicKey(oauthKeyPair);

function base64UrlUInt8(bytes) {
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwtEdDSA(payloadObj) {
  const header = base64UrlUInt8(new TextEncoder().encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })));
  const payload = base64UrlUInt8(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = x25519.sign(oauthKeyPair, signingInput);
  const signature = base64UrlUInt8(sig);
  return `${header}.${payload}.${signature}`;
}

if (!SITE_OWNER_TOKEN) {
  console.warn('[site-gateway] SITE_OWNER_TOKEN not set — owner endpoints are open (dev only)');
}

// ───────────────────────────────────────────────────────────────────────────
// Rate limiter (in-memory, per process — matches server.js style)
// ───────────────────────────────────────────────────────────────────────────

function createRateLimiter({ max, windowMs }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
      }
      return true;
    }
    if (bucket.count >= max) return false;
    bucket.count += 1;
    return true;
  };
}

const apiLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });
const sessionLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const powLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ───────────────────────────────────────────────────────────────────────────
// CORS
// ───────────────────────────────────────────────────────────────────────────

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    if (origin && !CORS_ORIGINS.has(origin)) {
      return json(res, 403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }
  if (origin && CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  next();
});

app.use(express.json({ limit: '64kb' }));

/* ───── static widget files (same-origin, no external deps) ───── */
import { join as pathJoin } from 'path';

const WIDGET_DIR = pathResolve(__dirname, '../../packages/widget');
const CURVES_FILE = pathResolve(__dirname, '../../node_modules/@noble/curves/ed25519.js');

app.get('/widget/loader.js', (_req, res) => {
  securityHeaders(res);
  res.type('application/javascript').sendFile(pathJoin(WIDGET_DIR, 'loader.js'));
});
app.get('/widget/chat.html', (_req, res) => {
  securityHeaders(res);
  res.type('text/html').sendFile(pathJoin(WIDGET_DIR, 'chat.html'));
});
app.get('/widget/chat.js', (_req, res) => {
  securityHeaders(res);
  res.type('application/javascript').sendFile(pathJoin(WIDGET_DIR, 'chat.js'));
});
app.get('/widget/chat.css', (_req, res) => {
  securityHeaders(res);
  res.type('text/css').sendFile(pathJoin(WIDGET_DIR, 'chat.css'));
});
app.get('/widget/curves.js', (_req, res) => {
  securityHeaders(res);
  res.type('application/javascript').sendFile(CURVES_FILE);
});

function json(res, status, body) {
  res.status(status).json(body);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // X-Frame-Options intentionally omitted: widget is embedded cross-origin in site iframes.
  // frame-ancestors should be configured per-site at the reverse proxy (see SECURITY.md).
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'self'; frame-ancestors 'self';");
}

// ───────────────────────────────────────────────────────────────────────────
// Auth: bearer token for owner endpoints
// ───────────────────────────────────────────────────────────────────────────

function requireOwner(req) {
  const auth = req.headers.authorization || req.headers['sec-websocket-protocol'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!SITE_OWNER_TOKEN || !token || token !== SITE_OWNER_TOKEN) return false;
  return true;
}

function requireOwnerUser(req) {
  return process.env.SITE_OWNER_USER_ID || 'u1';
}

// ───────────────────────────────────────────────────────────────────────────
// Proof-of-work challenges (in-memory, short TTL)
// ───────────────────────────────────────────────────────────────────────────

const powChallenges = new Map(); // challengeId → { challenge, difficulty, siteId, guestPubkey, createdAt, used }
const POW_TTL_MS = 10 * 60 * 1000;

function createPowChallenge(siteId, guestPubkey) {
  const challengeId = randomToken(16);
  const challenge = {
    challenge: crypto.randomBytes(16).toString('base64url'),
    difficulty: POW_DIFFICULTY,
  };
  powChallenges.set(challengeId, {
    challenge,
    difficulty: POW_DIFFICULTY,
    siteId,
    guestPubkey,
    createdAt: Date.now(),
    used: false,
  });
  return { challengeId, challenge, difficulty: POW_DIFFICULTY };
}

function getAndConsumePowChallenge(challengeId) {
  const entry = powChallenges.get(challengeId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > POW_TTL_MS) {
    powChallenges.delete(challengeId);
    return null;
  }
  if (entry.used) return null;
  entry.used = true;
  return entry;
}

function sweepPowChallenges() {
  const now = Date.now();
  for (const [id, entry] of powChallenges) {
    if (now - entry.createdAt > POW_TTL_MS) powChallenges.delete(id);
  }
}
setInterval(sweepPowChallenges, POW_TTL_MS).unref?.();

// Verify PoW solution (hashcash: sha256(challenge + nonce) must have difficulty leading zero bits)
function verifyPowSolution(challenge, solution) {
  if (!solution || typeof solution.nonce !== 'number' || !solution.digest) return false;
  const prefix = Buffer.from(challenge.challenge, 'base64url');
  const buffer = Buffer.alloc(prefix.length + 8);
  prefix.copy(buffer, 0);
  buffer.writeBigUInt64BE(BigInt(solution.nonce), prefix.length);
  const digest = crypto.createHash('sha256').update(buffer).digest();
  const digestB64 = digest.toString('base64url');
  if (!safeEqual(digestB64, solution.digest)) return false;
  // count leading zero bits
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits >= challenge.difficulty;
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function threadForGuestSite(guestId, siteId) {
  let thread = findThreadByGuestAndSite(guestId, siteId);
  if (!thread) {
    thread = createThread({ site_id: siteId, guest_id: guestId });
  }
  return thread;
}

function isOriginAllowed(site, origin) {
  if (!origin) return false;
  const isLocalhost = /^https?:\/\/localhost(:\d+)?$/i.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin);
  if (isLocalhost && process.env.NODE_ENV !== 'development') return false;
  return site.domains.includes(origin);
}

// ───────────────────────────────────────────────────────────────────────────
// REST: POST /v1/sites — owner creates a site
// ───────────────────────────────────────────────────────────────────────────

app.post('/v1/sites', (req, res) => {
  if (!apiLimiter(`sites:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });

  const { name, domains, owner_user_id, settings } = req.body || {};
  if (!name || typeof name !== 'string') return json(res, 400, { ok: false, reason: 'NAME_REQUIRED' });
  if (!Array.isArray(domains) || domains.length === 0) return json(res, 400, { ok: false, reason: 'DOMAINS_REQUIRED' });
  if (!owner_user_id || typeof owner_user_id !== 'string') return json(res, 400, { ok: false, reason: 'OWNER_REQUIRED' });

  const { publicKey: sitePubkey, privateKey: sitePrivkey } = generateX25519KeyPair();
  const site = createSite({
    owner_user_id,
    name,
    domains,
    site_pubkey: sitePubkey,
    settings: { color: '#007aff', greeting: 'Hello! How can I help?', language: 'en', position: 'bottom-right', ...(settings || {}) },
    created_at: new Date().toISOString(),
  });

  return json(res, 201, {
    ok: true,
    site_id: site.id,
    site_pubkey: sitePubkey,
    site_private_key: sitePrivkey,
    snippet: `<script async src="/widget/loader.js" data-site="${site.id}"></script>`,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REST: GET /v1/widget/config — public widget config
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/widget/config', (req, res) => {
  const { site } = req.query;
  if (!site || typeof site !== 'string') return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });

  // Origin check: only allow config from allowed domains (localhost only in dev)
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(siteRec, origin)) {
    return json(res, 403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
  }
  if (origin && !siteRec.confirmed) {
    updateSite(siteRec.id, { confirmed: true, confirmed_at: new Date().toISOString() });
  }

  trackStat(siteRec.id, 'loaded');

  return json(res, 200, {
    ok: true,
    site_id: siteRec.id,
    site_pubkey: siteRec.site_pubkey,
    settings: siteRec.settings,
    confirmed: siteRec.confirmed,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REST: GET /v1/guest/pow-challenge
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/guest/pow-challenge', (req, res) => {
  if (!powLimiter(`pow:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  const { site, guest_pubkey } = req.query;
  if (!site || !guest_pubkey) return json(res, 400, { ok: false, reason: 'SITE_AND_GUEST_PUBKEY_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const challenge = createPowChallenge(site, guest_pubkey);
  return json(res, 200, { ok: true, ...challenge });
});

// ───────────────────────────────────────────────────────────────────────────
// REST: POST /v1/guest/session — create guest session + thread
// ───────────────────────────────────────────────────────────────────────────

app.post('/v1/guest/session', (req, res) => {
  if (!sessionLimiter(`session:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });

  const origin = req.headers.origin;
  const { site_id, guest_pubkey, challenge_id, pow } = req.body || {};

  if (!site_id || !guest_pubkey || !challenge_id || !pow) {
    return json(res, 400, { ok: false, reason: 'MISSING_FIELDS' });
  }

  const siteRec = getSite(site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });

  if (!isOriginAllowed(siteRec, origin)) {
    return json(res, 403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
  }

  const challengeEntry = getAndConsumePowChallenge(challenge_id);
  if (!challengeEntry) return json(res, 400, { ok: false, reason: 'INVALID_OR_EXPIRED_CHALLENGE' });
  if (challengeEntry.siteId !== site_id || challengeEntry.guestPubkey !== guest_pubkey) {
    return json(res, 400, { ok: false, reason: 'CHALLENGE_BINDING_MISMATCH' });
  }
  if (!verifyPowSolution(challengeEntry.challenge, pow)) {
    return json(res, 403, { ok: false, reason: 'INVALID_POW' });
  }

  let guest = listGuestsBySite(site_id).find((g) => g.guest_pubkey === guest_pubkey);
  if (!guest) {
    guest = createGuest({ site_id, guest_pubkey });
  } else {
    updateGuest(guest.id, {});
  }

  const existingThread = findThreadByGuestAndSite(guest.id, site_id);
  const thread = threadForGuestSite(guest.id, site_id);
  const isNewThread = !existingThread;

  const guest_token = randomToken(24);
  guestTokens.set(guest_token, { guest_id: guest.id, site_id, thread_id: thread.id, createdAt: Date.now() });

  // Notify owner of new thread (or queue if offline)
  if (isNewThread) {
    const delivered = broadcastOwnerEvent(site_id, {
      type: 'thread.new', thread_id: thread.id, guest_id: guest.id, created_at: thread.created_at,
    });
    if (!delivered) {
      queueNotification(site_id, 'thread.new', {
        thread_id: thread.id, guest_id: guest.id, created_at: thread.created_at,
        preview: 'Новый чат от гостя',
      });
    }
    trackStat(site_id, 'opened');
    sendBotWebhook(site_id, 'thread.new', {
      thread_id: thread.id, guest_id: guest.id, created_at: thread.created_at,
    });
  }

  return json(res, 200, {
    ok: true,
    guest_token,
    thread_id: thread.id,
    site_pubkey: siteRec.site_pubkey,
  });
});

// Guest token → session mapping (in-memory, v1)
const guestTokens = new Map(); // token → { guest_id, site_id, thread_id, createdAt }
const GUEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function sweepGuestTokens() {
  const now = Date.now();
  for (const [token, session] of guestTokens) {
    if (now - session.createdAt > GUEST_TOKEN_TTL_MS) guestTokens.delete(token);
  }
}
setInterval(sweepGuestTokens, 60 * 60 * 1000).unref?.();

// ───────────────────────────────────────────────────────────────────────────
// REST: GET /v1/guest/history — thread history for a guest
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/guest/history', (req, res) => {
  const { thread: threadId, after, limit } = req.query;
  if (!threadId) return json(res, 400, { ok: false, reason: 'THREAD_REQUIRED' });
  const threadRec = getThread(threadId);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });
  const messages = listMessagesByThread(threadId, {
    after,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  return json(res, 200, { ok: true, messages, thread: threadRec });
});

// ───────────────────────────────────────────────────────────────────────────
// REST: owner endpoints (auth required)
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/owner/sites', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const sitesList = listAllSites();
  return json(res, 200, { ok: true, sites: sitesList.map((s) => ({ id: s.id, name: s.name, domains: s.domains, kind: s.kind, username: s.username, created_at: s.created_at })) });
});

app.patch('/v1/owner/sites/:id', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const { settings } = req.body || {};
  if (!settings) return json(res, 400, { ok: false, reason: 'SETTINGS_REQUIRED' });
  const siteRec = getSite(id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  updateSite(id, { settings: { ...siteRec.settings, ...settings } });
  return json(res, 200, { ok: true });
});

app.get('/v1/owner/threads', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { site, status } = req.query;
  if (!site) return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const includeClosed = status === 'all';
  const threads = listThreadsBySite(site, { status: 'open', includeClosed });
  return json(res, 200, { ok: true, threads });
});

app.get('/v1/owner/messages', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { thread: threadId, after, limit } = req.query;
  if (!threadId) return json(res, 400, { ok: false, reason: 'THREAD_REQUIRED' });
  const messages = listMessagesByThread(threadId, { after, limit: limit ? parseInt(limit, 10) : undefined });
  return json(res, 200, { ok: true, messages });
});

app.post('/v1/owner/messages', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  if (!apiLimiter(`owner-msg:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });

  const { thread_id, ciphertext, nonce, ephemeral_pubkey } = req.body || {};
  if (!thread_id || !ciphertext || !nonce || !ephemeral_pubkey) {
    return json(res, 400, { ok: false, reason: 'MISSING_FIELDS' });
  }
  const threadRec = getThread(thread_id);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });

  const msgSize = Buffer.byteLength(ciphertext) + Buffer.byteLength(nonce) + Buffer.byteLength(ephemeral_pubkey);
  if (msgSize > MAX_MESSAGE_BYTES) return json(res, 413, { ok: false, reason: 'MESSAGE_TOO_LARGE' });

  const message = createMessage({
    thread_id,
    sender: 'owner',
    ciphertext,
    nonce,
    ephemeral_pubkey,
    created_at: new Date().toISOString(),
  });
  updateThread(thread_id, { last_message_at: new Date().toISOString() });

  // Track owner_replied: first owner message in this thread
  const priorOwnerMsgs = listMessagesByThread(thread_id).filter((m) => m.sender === 'owner' && m.id !== message.id);
  if (priorOwnerMsgs.length === 0) trackStat(threadRec.site_id, 'owner_replied');

  // Notify guests in thread + subscribed owner clients
  broadcastToThreadClients(thread_id, {
    type: 'message.new', message_id: message.id, sender: 'owner', created_at: message.created_at,
    ciphertext, nonce, ephemeral_pubkey,
  });

  sendBotWebhook(threadRec.site_id, 'message.new', {
    thread_id, message_id: message.id, sender: 'owner', created_at: message.created_at,
    ciphertext, nonce, ephemeral_pubkey,
  });

  return json(res, 201, { ok: true, message_id: message.id });
});

// ───────────────────────────────────────────────────────────────────────────
// Notifications (owner)
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/owner/notifications', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { site } = req.query;
  if (!site) return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const notes = listNotifications(site, { limit: 50 });
  return json(res, 200, { ok: true, notifications: notes });
});

app.get('/v1/owner/notifications/unread', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const ownerUserId = requireOwnerUser(req);
  const notes = listUnreadNotifications(ownerUserId);
  return json(res, 200, { ok: true, notifications: notes, count: notes.length });
});

app.patch('/v1/owner/notifications/:id/read', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const n = notificationsGet(id);
  if (!n) return json(res, 404, { ok: false, reason: 'NOTIFICATION_NOT_FOUND' });
  const siteRec = getSite(n.site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  markNotificationRead(id);
  return json(res, 200, { ok: true, notification_id: id, read: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Thread close / guest block (owner actions)
// ───────────────────────────────────────────────────────────────────────────

app.patch('/v1/owner/threads/:id/close', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const threadRec = getThread(id);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });
  const siteRec = getSite(threadRec.site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  updateThread(id, { status: 'closed', closed_at: new Date().toISOString() });
  broadcastOwnerEvent(threadRec.site_id, { type: 'thread.closed', thread_id: id, closed_at: new Date().toISOString() });
  broadcastToThreadClients(id, { type: 'thread.closed', thread_id: id, closed_at: new Date().toISOString() });
  return json(res, 200, { ok: true, thread_id: id, status: 'closed' });
});

app.patch('/v1/owner/guests/:id/block', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const guestRec = getGuest(id);
  if (!guestRec) return json(res, 404, { ok: false, reason: 'GUEST_NOT_FOUND' });
  const siteRec = getSite(guestRec.site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  updateGuest(id, { blocked: true, blocked_at: new Date().toISOString() });
  broadcastOwnerEvent(guestRec.site_id, { type: 'guest.blocked', guest_id: id });
  return json(res, 200, { ok: true, guest_id: id, blocked: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Handoff tokens (guest → messenger transition)
// ───────────────────────────────────────────────────────────────────────────

// Guest requests a handoff token for their thread
app.post('/v1/guest/handoff', (req, res) => {
  const { token: guestToken } = req.body || {};
  if (!guestToken) return json(res, 400, { ok: false, reason: 'GUEST_TOKEN_REQUIRED' });
  const session = guestTokens.get(guestToken);
  if (!session) return json(res, 403, { ok: false, reason: 'INVALID_GUEST_TOKEN' });

  const handoffToken = createHandoffToken(session.thread_id, session.guest_id, session.site_id);
  trackStat(session.site_id, 'handoff_shown');

  return json(res, 200, {
    ok: true,
    handoff_token: handoffToken,
    thread_id: session.thread_id,
    expires_in: HANDOFF_TTL_MS,
  });
});

// Validate a handoff token (public, no auth — used by landing page)
// Returns thread info but NOT the guest key (key is in URL fragment only)
app.get('/v1/guest/handoff/:token/validate', (req, res) => {
  const { token } = req.params;
  const entry = getHandoffToken(token);
  if (!entry) return json(res, 404, { ok: false, reason: 'INVALID_OR_EXPIRED_TOKEN' });
  const threadRec = getThread(entry.thread_id);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });
  const siteRec = getSite(entry.site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  return json(res, 200, {
    ok: true,
    thread_id: entry.thread_id,
    site_id: entry.site_id,
    site_name: siteRec.name,
    guest_id: entry.guest_id,
  });
});

// Consume a handoff token (marks it used, thread handed off to messenger)
app.post('/v1/guest/handoff/:token/consume', (req, res) => {
  const { token } = req.params;
  const entry = consumeHandoffToken(token);
  if (!entry) return json(res, 404, { ok: false, reason: 'INVALID_OR_EXPIRED_TOKEN' });
  trackStat(entry.site_id, 'handoff_completed');

  // Notify guest WS (if connected) that handoff completed
  for (const [ws, session] of guestClients) {
    if (session.guest_id === entry.guest_id && session.site_id === entry.site_id && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'handoff.completed', thread_id: entry.thread_id }));
    }
  }
  // Notify owner WS
  broadcastOwnerEvent(entry.site_id, { type: 'handoff.completed', thread_id: entry.thread_id, guest_id: entry.guest_id });

  return json(res, 200, {
    ok: true,
    thread_id: entry.thread_id,
    site_id: entry.site_id,
    consumed_at: entry.consumed_at,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Stats / metrics (owner)
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/owner/stats', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { site, from, to } = req.query;
  if (!site) return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const dateFrom = from || todayIso();
  const dateTo = to || todayIso();
  const stats = getStats(site, dateFrom, dateTo);
  return json(res, 200, { ok: true, site_id: site, from: dateFrom, to: dateTo, stats });
});

// Client-reported stats tracking (e.g. handoff_clicked from widget)
app.post('/v1/stats/track', (req, res) => {
  const { site, event } = req.body || {};
  if (!site || !event) return json(res, 400, { ok: false, reason: 'SITE_AND_EVENT_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  trackStat(site, event);
  return json(res, 200, { ok: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Bot token management (owner)
// ───────────────────────────────────────────────────────────────────────────

app.post('/v1/bot/tokens', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { site_id } = req.body || {};
  if (!site_id) return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const token = createBotToken(site_id);
  return json(res, 201, { ok: true, token });
});

app.get('/v1/bot/tokens', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { site_id } = req.query;
  if (!site_id) return json(res, 400, { ok: false, reason: 'SITE_REQUIRED' });
  const siteRec = getSite(site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const tokens = listBotTokens(site_id);
  return json(res, 200, { ok: true, tokens });
});

app.delete('/v1/bot/tokens/:token', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { token } = req.params;
  const entry = getBotToken(token);
  if (!entry) return json(res, 404, { ok: false, reason: 'TOKEN_NOT_FOUND' });
  const siteRec = getSite(entry.site_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  deleteBotToken(token);
  return json(res, 200, { ok: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Bot message API (bot token auth)
// ───────────────────────────────────────────────────────────────────────────

app.post('/v1/bot/threads/:thread_id/messages', (req, res) => {
  const siteId = requireBotToken(req);
  if (!siteId) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  if (!apiLimiter(`bot-msg:${siteId}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });

  const { thread_id } = req.params;
  const { ciphertext, nonce, ephemeral_pubkey } = req.body || {};
  if (!thread_id || !ciphertext || !nonce || !ephemeral_pubkey) {
    return json(res, 400, { ok: false, reason: 'MISSING_FIELDS' });
  }

  const threadRec = getThread(thread_id);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });
  if (threadRec.site_id !== siteId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });

  const msgSize = Buffer.byteLength(ciphertext) + Buffer.byteLength(nonce) + Buffer.byteLength(ephemeral_pubkey);
  if (msgSize > MAX_MESSAGE_BYTES) return json(res, 413, { ok: false, reason: 'MESSAGE_TOO_LARGE' });

  const message = createMessage({
    thread_id,
    sender: 'bot',
    ciphertext,
    nonce,
    ephemeral_pubkey,
    created_at: new Date().toISOString(),
  });
  updateThread(thread_id, { last_message_at: new Date().toISOString() });

  broadcastToThreadClients(thread_id, {
    type: 'message.new', message_id: message.id, sender: 'bot', created_at: message.created_at,
    ciphertext, nonce, ephemeral_pubkey,
  });

  return json(res, 201, { ok: true, message_id: message.id });
});

// ───────────────────────────────────────────────────────────────────────────
// OAuth 2.0 — «Войти через Mess» (authorization code + PKCE)
// ───────────────────────────────────────────────────────────────────────────

const SCOPE_NOTIFY = 'notify';

function validatePkceChallenge(challenge) {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
}

function sha256Base64Url(str) {
  const hash = crypto.createHash('sha256').update(str).digest();
  return base64UrlUInt8(hash);
}

// GET /oauth/authorize — consent + issue authorization code
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;

  if (!client_id || !redirect_uri || !state || !code_challenge) {
    return json(res, 400, { ok: false, reason: 'MISSING_PARAMS' });
  }
  if (code_challenge_method !== 'S256') {
    return json(res, 400, { ok: false, reason: 'PKCE_REQUIRED' });
  }
  if (!validatePkceChallenge(code_challenge)) {
    return json(res, 400, { ok: false, reason: 'INVALID_CODE_CHALLENGE' });
  }

  const siteRec = getSite(client_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });

  // redirect_uri must exactly match a site domain
  const allowed = (siteRec.domains || []).some((d) => {
    try { return new URL(redirect_uri).origin === new URL(d).origin; } catch { return false; }
  });
  if (!allowed) {
    return json(res, 400, { ok: false, reason: 'INVALID_REDIRECT_URI' });
  }

  // Simulated consent: auto-approve (in real app, user sees prompt in messenger)
  const userId = 'user_' + randomToken(8); // pseudonymous user id
  grantUserConsent(client_id, userId, scope || '');

  const code = createOAuthCode(client_id, userId, redirect_uri, code_challenge, scope || '');

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', state);
  res.redirect(redirectUrl.toString());
});

// POST /oauth/token — exchange code for access_token + id_token
app.post('/oauth/token', (req, res) => {
  const { grant_type, code, redirect_uri, code_verifier, client_id } = req.body || {};

  if (grant_type !== 'authorization_code') {
    return json(res, 400, { ok: false, reason: 'UNSUPPORTED_GRANT_TYPE' });
  }
  if (!code || !redirect_uri || !code_verifier || !client_id) {
    return json(res, 400, { ok: false, reason: 'MISSING_PARAMS' });
  }

  const siteRec = getSite(client_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });

  const entry = consumeOAuthCode(code);
  if (!entry) return json(res, 400, { ok: false, reason: 'INVALID_OR_EXPIRED_CODE' });
  if (entry.site_id !== client_id || entry.redirect_uri !== redirect_uri) {
    return json(res, 400, { ok: false, reason: 'CODE_MISMATCH' });
  }

  // PKCE: code_challenge = base64url(sha256(code_verifier))
  const verifierChallenge = sha256Base64Url(code_verifier);
  if (!safeEqual(verifierChallenge, entry.code_challenge)) {
    return json(res, 400, { ok: false, reason: 'PKCE_MISMATCH' });
  }

  const accessToken = randomToken(24);
  const now = Math.floor(Date.now() / 1000);
  const idToken = signJwtEdDSA({
    iss: OAUTH_ISSUER,
    sub: `site:${client_id}:user:${entry.user_id}`,
    name: siteRec.name,
    aud: client_id,
    iat: now,
    exp: now + 3600,
    scope: entry.scope,
  });

  return json(res, 200, {
    ok: true,
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: idToken,
  });
});

// GET /.well-known/jwks.json — public key for ID token verification
app.get('/.well-known/jwks.json', (_req, res) => {
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlUInt8(oauthPublicKey),
    alg: 'EdDSA',
    kid: 'mess-oauth-v1',
    use: 'sig',
  };
  res.json({ keys: [jwk] });
});

// ───────────────────────────────────────────────────────────────────────────
// Site → messenger notifications (notify scope)
// ───────────────────────────────────────────────────────────────────────────

app.post('/v1/notify', (req, res) => {
  const siteId = requireBotToken(req);
  if (!siteId) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  if (!apiLimiter(`notify:${siteId}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });

  const { sub, title, text, url } = req.body || {};
  if (!sub || !title || !text) return json(res, 400, { ok: false, reason: 'MISSING_FIELDS' });
  if (text.length > 500) return json(res, 400, { ok: false, reason: 'TEXT_TOO_LONG' });

  // Parse sub: site:{siteId}:user:{userId}
  const subMatch = sub.match(/^site:([^:]+):user:(.+)$/);
  if (!subMatch) return json(res, 400, { ok: false, reason: 'INVALID_SUB' });
  const [, subSiteId, userId] = subMatch;
  if (subSiteId !== siteId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });

  // Check user granted notify scope
  if (!hasUserConsent(siteId, userId, SCOPE_NOTIFY)) {
    return json(res, 403, { ok: false, reason: 'NO_NOTIFY_CONSENT' });
  }

  // Check mute
  if (isSiteMuted(siteId, userId)) {
    return json(res, 200, { ok: true, muted: true });
  }

  // Rate limit: 5 per day per user per site
  if (isNotifyRateLimited(siteId, userId)) {
    return json(res, 429, { ok: false, reason: 'NOTIFY_RATE_LIMITED' });
  }

  const n = createUserNotification(userId, siteId, title, text, url);
  incrementNotifyRateLimit(siteId, userId);

  return json(res, 200, { ok: true, notification_id: n.id });
});

// ───────────────────────────────────────────────────────────────────────────
// User notifications (notify scope) — user endpoints
// ───────────────────────────────────────────────────────────────────────────

app.get('/v1/user/notifications', (req, res) => {
  const { user_id: userId, site_id: siteId } = req.query;
  if (!userId) return json(res, 400, { ok: false, reason: 'USER_ID_REQUIRED' });
  const notes = getUserNotifications(userId, siteId || undefined);
  return json(res, 200, { ok: true, notifications: notes });
});

app.patch('/v1/user/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const { user_id: userId } = req.body || {};
  if (!userId) return json(res, 400, { ok: false, reason: 'USER_ID_REQUIRED' });
  const n = markUserNotificationRead(userId, id);
  if (!n) return json(res, 404, { ok: false, reason: 'NOTIFICATION_NOT_FOUND' });
  return json(res, 200, { ok: true });
});

app.post('/v1/user/sites/:site_id/mute', (req, res) => {
  const { site_id: siteId } = req.params;
  const { user_id: userId } = req.body || {};
  if (!userId) return json(res, 400, { ok: false, reason: 'USER_ID_REQUIRED' });
  muteSite(siteId, userId);
  return json(res, 200, { ok: true });
});

app.delete('/v1/user/sites/:site_id/mute', (req, res) => {
  const { site_id: siteId } = req.params;
  const { user_id: userId } = req.body || {};
  if (!userId) return json(res, 400, { ok: false, reason: 'USER_ID_REQUIRED' });
  unmuteSite(siteId, userId);
  return json(res, 200, { ok: true });
});

app.get('/v1/user/muted-sites', (req, res) => {
  const { user_id: userId } = req.query;
  if (!userId) return json(res, 400, { ok: false, reason: 'USER_ID_REQUIRED' });
  const sites = listMutedSites(userId);
  return json(res, 200, { ok: true, sites });
});

// ───────────────────────────────────────────────────────────────────────────
// Anonymous push (phase F) — notification server endpoints
//
// POST /api/anon/push/register   — store pushToken -> queueId
// GET  /api/anon/push/hint       — return empty hint + queueId for a token
//
// The server stores ONLY pushToken -> queueId. No sender, no content.
// ───────────────────────────────────────────────────────────────────────────

app.post('/api/anon/push/register', (req, res) => {
  if (!apiLimiter('push:register')) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  const { pushToken, queueId } = req.body || {};
  if (!pushToken || typeof pushToken !== 'string' || pushToken.length > 4096) {
    return json(res, 400, { ok: false, reason: 'PUSH_TOKEN_REQUIRED' });
  }
  if (!queueId || typeof queueId !== 'string' || !/^q_[0-9a-f]{32}$/.test(queueId)) {
    return json(res, 400, { ok: false, reason: 'QUEUE_ID_REQUIRED' });
  }
  registerPushToken(pushToken, queueId);
  return json(res, 200, { ok: true });
});

app.get('/api/anon/push/hint', (req, res) => {
  const { pushToken } = req.query;
  if (!pushToken || typeof pushToken !== 'string') {
    return json(res, 400, { ok: false, reason: 'PUSH_TOKEN_REQUIRED' });
  }
  const queueId = getPushQueueId(pushToken);
  if (!queueId) {
    return json(res, 404, { ok: false, reason: 'NOT_REGISTERED' });
  }
  // Empty hint by design: body is always "", client must poll the relay.
  return json(res, 200, { ok: true, queueId, hint: '' });
});

// ───────────────────────────────────────────────────────────────────────────
// Bot webhooks (signed HMAC-SHA256)
// ───────────────────────────────────────────────────────────────────────────

function sendBotWebhook(siteId, event, data) {
  const siteRec = getSite(siteId);
  if (!siteRec) return;
  const settings = siteRec.settings || {};
  const webhookUrl = settings.bot_webhook_url;
  const secret = settings.bot_secret;
  if (!webhookUrl || !secret) return;

  const payload = JSON.stringify({ event, ...data, ts: new Date().toISOString() });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mess-Signature': signature,
        'X-Mess-Timestamp': new Date().toISOString(),
      },
      body: payload,
    }).catch(() => {}); // fire-and-forget
  } catch {}
}

/* ───── Bot token auth ───── */

function requireBotToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const entry = getBotToken(token);
  return entry ? entry.site_id : null;
}

// ───────────────────────────────────────────────────────────────────────────
// Public profile (username) — reuses site + guest + relay
// ───────────────────────────────────────────────────────────────────────────

const RESERVED_USERNAMES = new Set([
  'admin','support','api','docs','login','brand','messanger','messanger',
  'mess','anger','nova','connect','widget','embed','c','u','embed',
]);

app.post('/v1/owner/sites/:id/username', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const { username } = req.body || {};
  if (!username || typeof username !== 'string') return json(res, 400, { ok: false, reason: 'USERNAME_REQUIRED' });
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return json(res, 400, { ok: false, reason: 'USERNAME_INVALID' });
  if (RESERVED_USERNAMES.has(username)) return json(res, 400, { ok: false, reason: 'USERNAME_RESERVED' });

  const siteRec = getSite(id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });

  const existing = getSiteByUsername(username);
  if (existing && existing.id !== id) return json(res, 409, { ok: false, reason: 'USERNAME_TAKEN' });

  updateSite(id, { username, kind: siteRec.kind === 'site' ? 'profile' : siteRec.kind });
  return json(res, 200, { ok: true, username, profile_url: 'https://mess.cvr.name/u/' + encodeURIComponent(username) });
});

app.delete('/v1/owner/sites/:id/username', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const siteRec = getSite(id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  const ownerUserId = requireOwnerUser(req);
  if (siteRec.owner_user_id !== ownerUserId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  updateSite(id, { username: null, kind: 'site' });
  return json(res, 200, { ok: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Public profile page: /u/<username> — server-rendered with Open Graph tags
// ───────────────────────────────────────────────────────────────────────────

app.get('/u/:username', (req, res) => {
  const { username } = req.params;
  const siteRec = getSiteByUsername(username);
  if (!siteRec || siteRec.kind !== 'profile') {
    res.status(404).send('Profile not found');
    return;
  }
  const profileUrl = 'https://mess.cvr.name/u/' + encodeURIComponent(username);
  const siteName = siteRec.name || username;
  const greeting = (siteRec.settings && siteRec.settings.greeting) || 'Напишите мне';
  const desc = siteRec.settings && siteRec.settings.description ? siteRec.settings.description : 'Свяжитесь со мной через защищённый чат Mess&Anger';
  const ogImage = 'https://mess.cvr.name/og-image.png';

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${escapeHtml(siteName)} — Мессенджер Mess&Anger</title>

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(profileUrl)}">
<meta property="og:title" content="${escapeHtml(siteName)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Mess&Anger">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(siteName)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<link rel="icon" href="/favicon.ico">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0b0f; color: #eaeaea; }
  .wrap { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
  .card { background: #151621; border: 1px solid #2a2a2a; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; }
  .avatar { width: 64px; height: 64px; border-radius: 50%; background: #ff4e18; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
  p { font-size: 14px; opacity: .8; margin-bottom: 24px; line-height: 1.5; }
  .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 15px; font-weight: 600; cursor: pointer; margin-bottom: 12px; text-decoration: none; }
  .btn-primary { background: #ff4e18; color: #fff; }
  .btn-primary:hover { background: #e03d12; }
  .btn-outline { background: transparent; color: #eaeaea; border: 1px solid #3a3a3a; }
  .btn-outline:hover { background: #1a1b21; }
  .hint { font-size: 12px; opacity: .6; margin-top: 16px; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="avatar">👤</div>
    <h1>${escapeHtml(siteName)}</h1>
    <p>${escapeHtml(desc)}</p>
    <a href="#" class="btn btn-primary" id="c-btn-chat">Написать</a>
    <a href="https://play.google.com/store/apps/details?id=com.messanger.e2e" class="btn btn-outline" id="c-btn-android">Скачать для Android</a>
    <div class="hint" id="c-hint">Чат откроется в виджете на этой странице</div>
    <div id="mwa-widget-root" style="margin-top:24px"></div>
  </div>
</div>
<script>
  (function(){
    var siteId = '${escapeHtml(siteRec.id)}';
    var btn = document.getElementById('c-btn-chat');
    var root = document.getElementById('mwa-widget-root');
    var hint = document.getElementById('c-hint');

    // Load the widget loader dynamically
    var s = document.createElement('script');
    s.async = true;
    s.src = '/widget/loader.js';
    s.setAttribute('data-site', siteId);
    document.head.appendChild(s);

    btn.onclick = function(e) {
      e.preventDefault();
      // Widget opens on its own via loader; just hint
      hint.textContent = 'Чат загружается ниже…';
    };
  })();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ───────────────────────────────────────────────────────────────────────────
// Health
// ───────────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'site-gateway', ts: new Date().toISOString() });
});

// ───────────────────────────────────────────────────────────────────────────
// WebSocket state
// ───────────────────────────────────────────────────────────────────────────

const guestClients = new Map(); // WebSocket → { guest_token, guest_id, site_id, thread_id }
const ownerClients = new Map(); // WebSocket → { site_ids[], token }

function sendWs(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastToThreadClients(threadId, data) {
  const payload = JSON.stringify(data);
  const threadRec = getThread(threadId);
  const siteId = threadRec ? threadRec.site_id : null;
  for (const [ws, session] of guestClients) {
    if (session.thread_id === threadId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
  if (siteId) {
    for (const [ws, session] of ownerClients) {
      if (session.site_ids.includes(siteId) && ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

function broadcastOwnerEvent(siteId, data) {
  const payload = JSON.stringify(data);
  let delivered = false;
  for (const [ws, session] of ownerClients) {
    if (session.site_ids.includes(siteId) && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      delivered = true;
    }
  }
  return delivered;
}

function isOwnerOnline(siteId) {
  for (const [ws, session] of ownerClients) {
    if (session.site_ids.includes(siteId) && ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

function inDnDWindow(siteRec) {
  const dnd = siteRec.settings && siteRec.settings.dnd;
  if (!dnd || !dnd.enabled) return false;
  const now = new Date();
  const hhmm = now.getHours() * 100 + now.getMinutes();
  const start = parseTime(dnd.start);
  const end = parseTime(dnd.end);
  if (start <= end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

function parseTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 100 + (m || 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function trackStat(siteId, event) {
  try { recordStat(siteId, todayIso(), event, 1); } catch {}
}

function queueNotification(siteId, type, data) {
  const siteRec = getSite(siteId);
  if (!siteRec) return;
  const ownerUserId = siteRec.owner_user_id;
  if (inDnDWindow(siteRec)) {
    // Still store, but mark as dnd-suppressed so it can be delivered later
    data.suppressed_by_dnd = true;
  }
  createNotification({
    site_id: siteId,
    owner_user_id: ownerUserId,
    type,
    ...data,
    created_at: new Date().toISOString(),
  });
}

function deliverPendingNotifications(ws, siteIds) {
  for (const siteId of siteIds) {
    const notes = listNotifications(siteId, { unread: true, limit: 50 });
    for (const n of notes) {
      ws.send(JSON.stringify({ type: 'notification', ...n }));
      markNotificationRead(n.id);
    }
  }
}

function handleGuestMessage(ws, session, parsed) {
  const { type } = parsed;
  if (type === 'message') {
    const { thread_id, ciphertext, nonce, ephemeral_pubkey } = parsed;
    if (!thread_id || !ciphertext || !nonce || !ephemeral_pubkey) return;
    if (thread_id !== session.thread_id) return;
    const threadRec = getThread(thread_id);
    if (!threadRec || threadRec.site_id !== session.site_id) return;

    const msgSize = Buffer.byteLength(ciphertext) + Buffer.byteLength(nonce) + Buffer.byteLength(ephemeral_pubkey);
    if (msgSize > MAX_MESSAGE_BYTES) return;

    const message = createMessage({
      thread_id,
      sender: 'guest',
      ciphertext,
      nonce,
      ephemeral_pubkey,
      created_at: new Date().toISOString(),
    });
    updateThread(thread_id, { last_message_at: new Date().toISOString() });

    // Track first_message metric: count prior guest messages in this thread
    const priorMsgs = listMessagesByThread(thread_id).filter((m) => m.sender === 'guest' && m.id !== message.id);
    if (priorMsgs.length === 0) trackStat(session.site_id, 'first_message');

    const delivered = broadcastOwnerEvent(session.site_id, {
      type: 'message.new', thread_id, message_id: message.id, sender: 'guest',
      guest_id: session.guest_id, created_at: message.created_at,
      ciphertext, nonce, ephemeral_pubkey,
    });
    if (!delivered) {
      queueNotification(session.site_id, 'message.new', {
        thread_id, message_id: message.id, sender: 'guest',
        guest_id: session.guest_id, created_at: message.created_at,
        preview: '[новое сообщение]',
      });
    }

    sendBotWebhook(session.site_id, 'message.new', {
      thread_id, message_id: message.id, guest_id: session.guest_id, created_at: message.created_at,
      ciphertext, nonce, ephemeral_pubkey,
    });

    sendWs(ws, { type: 'message.sent', message_id: message.id, created_at: message.created_at });
    broadcastToThreadClients(thread_id, {
      type: 'message.new', message_id: message.id, sender: 'guest', created_at: message.created_at,
      ciphertext, nonce, ephemeral_pubkey,
    });

  } else if (type === 'ack') {
    const { message_ids } = parsed;
    if (Array.isArray(message_ids)) {
      for (const id of message_ids) {
        const m = getMessage(id);
        if (m && !m.delivered_at) updateMessage(id, { delivered_at: new Date().toISOString() });
      }
    }
  } else if (type === 'typing') {
    broadcastToThreadClients(session.thread_id, { type: 'typing', thread_id: session.thread_id, guest_id: session.guest_id });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// WebSocket server
// ───────────────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === '/v1/guest/ws') {
    const token = url.searchParams.get('token');
    if (!token) { ws.close(1008, 'TOKEN_REQUIRED'); return; }
    const session = guestTokens.get(token);
    if (!session) { ws.close(1008, 'INVALID_TOKEN'); return; }

    guestClients.set(ws, { guest_token: token, guest_id: session.guest_id, site_id: session.site_id, thread_id: session.thread_id });

    // Send undelivered owner messages for this thread
    const messages = listMessagesByThread(session.thread_id);
    for (const m of messages) {
      if (m.sender === 'owner' && !m.delivered_at) {
        sendWs(ws, { type: 'message.new', message_id: m.id, sender: 'owner', created_at: m.created_at, ciphertext: m.ciphertext, nonce: m.nonce, ephemeral_pubkey: m.ephemeral_pubkey });
      }
    }

    sendWs(ws, { type: 'connected', thread_id: session.thread_id });

    ws.on('message', (raw) => {
      try { handleGuestMessage(ws, session, JSON.parse(raw.toString())); } catch { /* ignore malformed */ }
    });
    ws.on('close', () => guestClients.delete(ws));
    ws.on('error', () => guestClients.delete(ws));

  } else if (path === '/v1/owner/ws') {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token || token !== SITE_OWNER_TOKEN) { ws.close(1008, 'UNAUTHORIZED'); return; }
    ownerClients.set(ws, { site_ids: [] });
    sendWs(ws, { type: 'connected' });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === 'subscribe' && Array.isArray(parsed.site_ids)) {
          const session = ownerClients.get(ws);
          if (session) {
            session.site_ids = parsed.site_ids;
            deliverPendingNotifications(ws, parsed.site_ids);
          }
        }
      } catch { /* ignore */ }
    });
    ws.on('close', () => ownerClients.delete(ws));
    ws.on('error', () => ownerClients.delete(ws));

  } else {
    ws.close(1008, 'UNKNOWN_PATH');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// HTTP server: Express + WS on same port
// ───────────────────────────────────────────────────────────────────────────

const server = createServer(app);

setInterval(() => purgeExpiredMessages(MESSAGE_RETENTION_MS), 60 * 60 * 1000).unref?.();

const isMainModule =
  typeof process.argv[1] === 'string' && pathResolve(process.argv[1]) === pathResolve(__filename);

if (isMainModule) {
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  server.listen(PORT, () => {
    console.log(`Site Gateway on :${PORT}`);
    console.log(`  REST   →  http://localhost:${PORT}/v1/...`);
    console.log(`  WS     →  ws://localhost:${PORT}/v1/guest/ws, /v1/owner/ws`);
    console.log(`  health →  http://localhost:${PORT}/api/health`);
  });
}

export { app, server, wss };
