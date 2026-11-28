/**
 * Site Gateway — widget chat backend for Mess&Anger.
 *
 * Endpoints:
 *   POST   /v1/sites                     — owner creates a site (auth: Bearer owner token from OWNER_TOKENS)
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
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import { Agent } from 'undici';
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
import { x25519, ed25519 } from '@noble/curves/ed25519.js';

dotenv.config();

// ───────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '8081', 10);
// Owner tokens, bound to a single owner user: "token:user_id,token2:user_id2".
// Legacy SITE_OWNER_TOKEN (+ SITE_OWNER_USER_ID) is still supported for dev/CI.
const OWNER_TOKENS = new Map();
for (const entry of (process.env.OWNER_TOKENS || '').split(',')) {
  const pair = entry.trim();
  if (!pair) continue;
  const sep = pair.indexOf(':');
  if (sep <= 0) continue;
  const token = pair.slice(0, sep).trim();
  const userId = pair.slice(sep + 1).trim();
  if (token && userId) OWNER_TOKENS.set(token, userId);
}
const SITE_OWNER_TOKEN = (process.env.SITE_OWNER_TOKEN || '').trim();
if (SITE_OWNER_TOKEN) {
  OWNER_TOKENS.set(SITE_OWNER_TOKEN, (process.env.SITE_OWNER_USER_ID || 'u1').trim() || 'u1');
}
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
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

// A persistent Ed25519 seed keeps previously issued id_tokens verifiable across
// restarts (and across instances behind a load balancer). Without it every
// boot mints a new key, so the JWKS endpoint and every existing id_token go
// stale — acceptable only for local development.
function loadOauthSigningKey() {
  const raw = String(process.env.OAUTH_SIGNING_KEY || '').trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, /^[0-9a-f]{64}$/i.test(raw) ? 'hex' : 'base64url');
  return bytes.length === 32 ? new Uint8Array(bytes) : null;
}

const OAUTH_SIGNING_KEY = loadOauthSigningKey();
if (!OAUTH_SIGNING_KEY) {
  console.warn('[site-gateway] OAUTH_SIGNING_KEY is not set — using an ephemeral signing key; id_tokens will not verify after a restart');
}
const oauthKeyPair = OAUTH_SIGNING_KEY || ed25519.utils.randomSecretKey();
const oauthPublicKey = ed25519.getPublicKey(oauthKeyPair);

function base64UrlUInt8(bytes) {
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwtEdDSA(payloadObj) {
  const header = base64UrlUInt8(new TextEncoder().encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })));
  const payload = base64UrlUInt8(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = ed25519.sign(signingInput, oauthKeyPair);
  const signature = base64UrlUInt8(sig);
  return `${header}.${payload}.${signature}`;
}

if (OWNER_TOKENS.size === 0) {
  // Fail closed: no tokens means no owner access at all.
  const msg = '[site-gateway] No owner tokens configured — owner endpoints disabled. Set OWNER_TOKENS=token:user_id';
  if (IS_PRODUCTION) console.error(msg); else console.warn(msg + ' (dev)');
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
const oauthConsentLimiter = createRateLimiter({ max: 10, windowMs: 10 * 60_000 });
// Guest WebSocket has no HTTP layer to rate-limit it, yet every guest message
// writes to the store, notifies the owner and fires an outbound bot webhook.
// Cap both the number of chat messages and the total frames per guest session.
const guestMsgLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });
const guestFrameLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ───────────────────────────────────────────────────────────────────────────
// CORS
// ───────────────────────────────────────────────────────────────────────────

const app = express();
// Behind nginx/Caddy every request arrives from the proxy address, so without
// this all rate-limit buckets collapse into one shared key and a single abusive
// client can 429 everyone. Opt in only when a trusted proxy really is in front.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
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
// The OAuth consent form is a plain HTML POST, not JSON.
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

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

// Notification links are rendered by the messenger client, so only plain web
// URLs may cross this boundary: `javascript:`/`data:` here would become a
// stored XSS primitive in every client that displays the notification.
function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

// Only non-secret, client-facing settings may leave the server via the public config.
const PUBLIC_SETTING_KEYS = [
  'color', 'greeting', 'language', 'position', 'title', 'subtitle',
  'logo_url', 'avatar_url', 'theme', 'show_branding', 'handoff_enabled',
  'placeholder', 'welcome_message',
];

function publicSiteSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== 'object') return out;
  for (const key of PUBLIC_SETTING_KEYS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
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

function ownerTokenFromRequest(req) {
  const auth = req.headers.authorization || req.headers['sec-websocket-protocol'] || '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function ownerUserIdForToken(token) {
  if (!token) return null;
  return OWNER_TOKENS.get(token) || null;
}

function ownerUserIdFromRequest(req) {
  return ownerUserIdForToken(ownerTokenFromRequest(req));
}

function requireOwner(req) {
  return ownerUserIdFromRequest(req) !== null;
}

// Resolved owner user id for the presented token (null when unauthenticated).
function requireOwnerUser(req) {
  return ownerUserIdFromRequest(req);
}

function ownsSite(req, siteRec) {
  const userId = ownerUserIdFromRequest(req);
  return Boolean(siteRec && userId && siteRec.owner_user_id === userId);
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

  const { name, domains, settings } = req.body || {};
  if (!name || typeof name !== 'string') return json(res, 400, { ok: false, reason: 'NAME_REQUIRED' });
  if (!Array.isArray(domains) || domains.length === 0) return json(res, 400, { ok: false, reason: 'DOMAINS_REQUIRED' });
  // Bind the site to the authenticated owner, never to a client-supplied id.
  const owner_user_id = requireOwnerUser(req);
  if (!owner_user_id) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });

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
  if (!apiLimiter(`config:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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
    settings: publicSiteSettings(siteRec.settings),
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
  if (!apiLimiter(`history:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });

  // History is private: require the guest session token issued by /v1/guest/session.
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const guestToken = bearer || (typeof req.query.token === 'string' ? req.query.token : '');
  const session = guestToken ? guestTokens.get(guestToken) : null;
  if (!session) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });

  const threadId = session.thread_id;
  const after = req.query.after;
  const limit = req.query.limit;
  if (req.query.thread && req.query.thread !== threadId) {
    return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  }
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
  const ownerUserId = requireOwnerUser(req);
  const sitesList = listAllSites().filter((s) => s.owner_user_id === ownerUserId);
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
  if (!ownsSite(req, siteRec)) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const includeClosed = status === 'all';
  const threads = listThreadsBySite(site, { status: 'open', includeClosed });
  return json(res, 200, { ok: true, threads });
});

app.get('/v1/owner/messages', (req, res) => {
  if (!requireOwner(req)) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { thread: threadId, after, limit } = req.query;
  if (!threadId) return json(res, 400, { ok: false, reason: 'THREAD_REQUIRED' });
  const threadRec = getThread(threadId);
  if (!threadRec) return json(res, 404, { ok: false, reason: 'THREAD_NOT_FOUND' });
  if (!ownsSite(req, getSite(threadRec.site_id))) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
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
  if (!ownsSite(req, getSite(threadRec.site_id))) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });

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
  const n = getNotification(id);
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
  if (!apiLimiter(`handoff:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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
  if (!apiLimiter(`handoff-validate:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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
  if (!apiLimiter(`handoff-consume:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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
  // Unauthenticated by design (the widget reports its own counters), so bound
  // both the request rate and the origins allowed to inflate a site's stats.
  if (!apiLimiter(`stats:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  const { site, event } = req.body || {};
  if (!site || !event) return json(res, 400, { ok: false, reason: 'SITE_AND_EVENT_REQUIRED' });
  const siteRec = getSite(site);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });
  if (req.headers.origin && !isOriginAllowed(siteRec, req.headers.origin)) {
    return json(res, 403, { ok: false, reason: 'ORIGIN_NOT_ALLOWED' });
  }
  // Whitelist: only known counter names may be incremented (prevents arbitrary-field growth).
  const STAT_EVENTS = new Set([
    'loaded', 'opened', 'first_message', 'owner_replied',
    'handoff_shown', 'handoff_clicked', 'handoff_completed',
  ]);
  if (!STAT_EVENTS.has(event)) return json(res, 400, { ok: false, reason: 'STAT_EVENT_UNKNOWN' });
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

// OAuth access tokens (in-memory, hashed nowhere yet — opaque random tokens).
const userAccessTokens = new Map(); // token → { user_id, site_id, scope, expiresAt }
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

function issueUserAccessToken(siteId, userId, scope) {
  const token = randomToken(24);
  userAccessTokens.set(token, {
    user_id: userId, site_id: siteId, scope: scope || '', expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  });
  return token;
}

function requireUserToken(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const entry = userAccessTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { userAccessTokens.delete(token); return null; }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of userAccessTokens) if (now > entry.expiresAt) userAccessTokens.delete(token);
}, 10 * 60 * 1000).unref?.();

function validatePkceChallenge(challenge) {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(challenge);
}

function sha256Base64Url(str) {
  const hash = crypto.createHash('sha256').update(str).digest();
  return base64UrlUInt8(hash);
}

// Scopes this gateway can actually grant. Requesting anything else is refused
// instead of being silently consented to.
const OAUTH_ALLOWED_SCOPES = new Set([SCOPE_NOTIFY]);

// Pending authorization requests: the consent page carries only an opaque id,
// so the request parameters cannot be tampered with between GET and POST.
const pendingAuthorizations = new Map(); // id → { client_id, redirect_uri, state, code_challenge, scope, expiresAt }
const PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingAuthorizations) if (now > entry.expiresAt) pendingAuthorizations.delete(id);
}, 60 * 1000).unref?.();

function parseScope(raw) {
  const scopes = String(raw || '').split(/\s+/).filter(Boolean);
  if (scopes.some((s) => !OAUTH_ALLOWED_SCOPES.has(s))) return null;
  return [...new Set(scopes)].join(' ');
}

function oauthPage(res, status, title, bodyHtml) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return res.status(status).type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f5f5f7; color: #1d1d1f; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
main { width: min(420px, 90vw); background: #fff; border-radius: 14px; padding: 28px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
h1 { font-size: 19px; margin: 0 0 12px; }
p { margin: 0 0 12px; color: #424245; }
code { background: #f2f2f4; border-radius: 5px; padding: 1px 5px; }
label { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 600; }
input[type=password] { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #c9c9cf; border-radius: 9px; font-size: 15px; }
.actions { display: flex; gap: 10px; margin-top: 20px; }
button { flex: 1; padding: 11px; border-radius: 10px; border: 0; font-size: 15px; font-weight: 600; cursor: pointer; }
button.allow { background: #0071e3; color: #fff; }
button.deny { background: #e8e8ed; color: #1d1d1f; }
</style>
</head>
<body><main>${bodyHtml}</main></body>
</html>`);
}

// GET /oauth/authorize — show a consent screen; no code is issued here.
app.get('/oauth/authorize', (req, res) => {
  if (!apiLimiter(`oauth-authorize:${clientKey(req)}`)) {
    return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  }

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

  const grantedScope = parseScope(scope);
  if (grantedScope === null) return json(res, 400, { ok: false, reason: 'INVALID_SCOPE' });

  const siteRec = getSite(client_id);
  if (!siteRec) return json(res, 404, { ok: false, reason: 'SITE_NOT_FOUND' });

  // redirect_uri must exactly match a site domain
  const allowed = (siteRec.domains || []).some((d) => {
    try { return new URL(redirect_uri).origin === new URL(d).origin; } catch { return false; }
  });
  if (!allowed) {
    return json(res, 400, { ok: false, reason: 'INVALID_REDIRECT_URI' });
  }

  const requestId = randomToken(24);
  pendingAuthorizations.set(requestId, {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    scope: grantedScope,
    expiresAt: Date.now() + PENDING_AUTHORIZATION_TTL_MS,
  });

  const scopeHtml = grantedScope ? `<p>Permissions: <code>${escapeHtml(grantedScope)}</code></p>` : '';
  return oauthPage(res, 200, 'Sign in to Mess', `
<h1>Sign in to Mess</h1>
<p><strong>${escapeHtml(siteRec.name)}</strong> wants to sign you in.</p>
${scopeHtml}
<form method="post" action="/oauth/authorize">
  <input type="hidden" name="request_id" value="${escapeHtml(requestId)}">
  <label for="owner_token">Gateway account token</label>
  <input id="owner_token" type="password" name="owner_token" required autocomplete="off">
  <div class="actions">
    <button class="deny" type="submit" name="decision" value="deny" formnovalidate>Deny</button>
    <button class="allow" type="submit" name="decision" value="allow">Allow</button>
  </div>
</form>`);
});

// POST /oauth/authorize — verify the user, then deny or issue a code.
app.post('/oauth/authorize', (req, res) => {
  if (!oauthConsentLimiter(`oauth-consent:${clientKey(req)}`)) {
    return oauthPage(res, 429, 'Too many attempts', '<h1>Too many attempts</h1><p>Wait a few minutes, then start signing in again from the site.</p>');
  }

  const { request_id: requestId, decision, owner_token: ownerToken } = req.body || {};
  const pending = pendingAuthorizations.get(String(requestId || ''));
  if (!pending || pending.expiresAt < Date.now()) {
    if (pending) pendingAuthorizations.delete(String(requestId));
    return oauthPage(res, 400, 'Sign-in expired', '<h1>Sign-in expired</h1><p>This sign-in request is no longer valid. Start again from the site.</p>');
  }

  const redirectUrl = new URL(pending.redirect_uri);
  redirectUrl.searchParams.set('state', pending.state);

  if (decision !== 'allow') {
    pendingAuthorizations.delete(String(requestId));
    redirectUrl.searchParams.set('error', 'access_denied');
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(redirectUrl.toString());
  }

  // Real user check: the consent is bound to the gateway account behind the
  // token, never to a freshly invented pseudonymous id.
  const userId = ownerUserIdForToken(String(ownerToken || '').trim());
  if (!userId) {
    // Keep the pending request so the user can retry with the right token.
    return oauthPage(res, 401, 'Sign-in failed', '<h1>Sign-in failed</h1><p>That account token is not valid. Go back and try again.</p>');
  }

  pendingAuthorizations.delete(String(requestId));
  grantUserConsent(pending.client_id, userId, pending.scope);
  const code = createOAuthCode(pending.client_id, userId, pending.redirect_uri, pending.code_challenge, pending.scope);

  redirectUrl.searchParams.set('code', code);
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(redirectUrl.toString());
});

// POST /oauth/token — exchange code for access_token + id_token
app.post('/oauth/token', (req, res) => {
  if (!apiLimiter(`oauth-token:${clientKey(req)}`)) {
    return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
  }
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

  const accessToken = issueUserAccessToken(client_id, entry.user_id, entry.scope);
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
  if (typeof title !== 'string' || title.length > 200) {
    return json(res, 400, { ok: false, reason: 'TITLE_INVALID' });
  }
  if (text.length > 500) return json(res, 400, { ok: false, reason: 'TEXT_TOO_LONG' });
  if (url !== undefined && url !== null && url !== '' && !isSafeHttpUrl(url)) {
    return json(res, 400, { ok: false, reason: 'URL_INVALID' });
  }

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
  const auth = requireUserToken(req);
  if (!auth) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const siteId = typeof req.query.site_id === 'string' ? req.query.site_id : undefined;
  if (siteId && siteId !== auth.site_id) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  const notes = getUserNotifications(auth.user_id, siteId || undefined);
  return json(res, 200, { ok: true, notifications: notes });
});

app.patch('/v1/user/notifications/:id/read', (req, res) => {
  const auth = requireUserToken(req);
  if (!auth) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const { id } = req.params;
  const n = markUserNotificationRead(auth.user_id, id);
  if (!n) return json(res, 404, { ok: false, reason: 'NOTIFICATION_NOT_FOUND' });
  return json(res, 200, { ok: true });
});

app.post('/v1/user/sites/:site_id/mute', (req, res) => {
  const { site_id: siteId } = req.params;
  const auth = requireUserToken(req);
  if (!auth) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  if (auth.site_id !== siteId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  muteSite(siteId, auth.user_id);
  return json(res, 200, { ok: true });
});

app.delete('/v1/user/sites/:site_id/mute', (req, res) => {
  const { site_id: siteId } = req.params;
  const auth = requireUserToken(req);
  if (!auth) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  if (auth.site_id !== siteId) return json(res, 403, { ok: false, reason: 'FORBIDDEN' });
  unmuteSite(siteId, auth.user_id);
  return json(res, 200, { ok: true });
});

app.get('/v1/user/muted-sites', (req, res) => {
  const auth = requireUserToken(req);
  if (!auth) return json(res, 401, { ok: false, reason: 'UNAUTHORIZED' });
  const sites = listMutedSites(auth.user_id);
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
  if (!apiLimiter(`push:register:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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
  if (!apiLimiter(`push-hint:${clientKey(req)}`)) return json(res, 429, { ok: false, reason: 'RATE_LIMITED' });
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

/* ───── Outbound webhook guard (SSRF) ───── */

const WEBHOOK_TIMEOUT_MS = 5000;

function isLoopbackHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** True for loopback, private, link-local, CGNAT and other non-public IPs. */
function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase().split('%')[0];
    if (lower === '::' || lower === '::1') return true;
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower)) return true;
    if (/^2001:0?db8:/.test(lower) || /^3fff:/.test(lower) || /^100:/.test(lower)) return true;
    if (/^2001:0(?::|$)/.test(lower) || /^2001:0000:/.test(lower) || /^2002:/.test(lower)) return true;
    if (/^64:ff9b:/.test(lower)) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hexMapped = lower.match(/^(?:::ffff|0:0:0:0:0:ffff):([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const compatHex = lower.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const hexIpv4 = hexMapped ?? compatHex;
    if (hexIpv4) {
      const high = parseInt(hexIpv4[1], 16);
      const low = parseInt(hexIpv4[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    const compatDotted = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (compatDotted) return isPrivateAddress(compatDotted[1]);
    return false;
  }
  // Not an IP literal: treat unknown input as unsafe.
  return true;
}

/**
 * Rejects webhook URLs that could turn owner-controlled settings into a
 * server-side request forgery primitive: only HTTPS, no embedded credentials,
 * no private/loopback destinations (loopback HTTP is allowed in development).
 * Returns a reason string, or null when the URL is acceptable.
 */
function webhookUrlError(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return 'INVALID_URL';
  }
  if (url.username || url.password) return 'CREDENTIALS_NOT_ALLOWED';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const devLoopback = !IS_PRODUCTION && isLoopbackHost(host);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && devLoopback)) return 'HTTPS_REQUIRED';
  if (isIP(host)) return isPrivateAddress(host) && !devLoopback ? 'PRIVATE_ADDRESS' : null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return devLoopback ? null : 'PRIVATE_ADDRESS';
  }
  return null;
}

/**
 * Resolves a validated webhook URL to the single address the POST must be sent
 * to. Returns null when the destination is not acceptable. Checking the answer
 * is not enough on its own: the hostname is resolved again by the socket layer
 * at connect time, so a DNS record could be repointed at an internal address
 * in between (TOCTOU). The caller pins this address in the connect lookup.
 */
async function resolveWebhookAddresses(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const devLoopback = !IS_PRODUCTION && isLoopbackHost(host);
  if (isIP(host)) {
    if (isPrivateAddress(host) && !devLoopback) return [];
    return [{ address: host, family: isIP(host) }];
  }
  const rows = await lookup(host, { all: true, verbatim: true });
  if (rows.length === 0) return [];
  if (!devLoopback && rows.some((row) => isPrivateAddress(row.address))) return [];
  return rows.map((row) => ({ address: row.address, family: row.family }));
}

/**
 * Dispatcher whose DNS lookup only ever answers with addresses that already
 * passed the SSRF guard, so the socket cannot be steered elsewhere by a record
 * that changed after the check (TOCTOU). All validated answers are offered so
 * undici can still fall back to a second address when the first is down; SNI
 * still comes from the URL hostname, so certificate validation is unaffected.
 */
function pinnedDispatcher(targets) {
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options && options.all) callback(null, targets);
        else callback(null, targets[0].address, targets[0].family);
      },
    },
  });
}

/** Release the response body so undici can close the connection. */
async function drainResponse(response) {
  if (response && typeof response.arrayBuffer === 'function') await response.arrayBuffer();
}

/**
 * Fire-and-forget webhook delivery. The URL is re-validated and its hostname
 * resolved right before every POST; the resulting address is pinned in the
 * connection lookup so DNS cannot change between the check and the connect.
 * Redirects are never followed and the request is bounded by a timeout.
 */
async function deliverBotWebhook(webhookUrl, headers, payload) {
  if (webhookUrlError(webhookUrl)) return;
  let dispatcher;
  try {
    const url = new URL(webhookUrl);
    const targets = await resolveWebhookAddresses(url);
    if (targets.length === 0) return;
    dispatcher = pinnedDispatcher(targets);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      dispatcher,
    });
    await drainResponse(response);
  } catch {
    /* delivery is best-effort */
  } finally {
    if (dispatcher) await dispatcher.close().catch(() => {});
  }
}

function sendBotWebhook(siteId, event, data) {
  const siteRec = getSite(siteId);
  if (!siteRec) return;
  const settings = siteRec.settings || {};
  const webhookUrl = settings.bot_webhook_url;
  const secret = settings.bot_secret;
  if (typeof webhookUrl !== 'string' || !webhookUrl) return;
  if (typeof secret !== 'string' || !secret) return;

  let payload;
  let signature;
  try {
    payload = JSON.stringify({ event, ...data, ts: new Date().toISOString() });
    signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  } catch {
    return;
  }

  void deliverBotWebhook(webhookUrl, {
    'Content-Type': 'application/json',
    'X-Mess-Signature': signature,
    'X-Mess-Timestamp': new Date().toISOString(),
  }, payload);
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
    if (!guestMsgLimiter(`guest-msg:${session.guest_id}`)) return;
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
      // A guest may only acknowledge messages in its own thread, and only a
      // bounded batch per frame.
      for (const id of message_ids.slice(0, 200)) {
        if (typeof id !== 'string') continue;
        const m = getMessage(id);
        if (m && m.thread_id === session.thread_id && !m.delivered_at) {
          updateMessage(id, { delivered_at: new Date().toISOString() });
        }
      }
    }
  } else if (type === 'typing') {
    broadcastToThreadClients(session.thread_id, { type: 'typing', thread_id: session.thread_id, guest_id: session.guest_id });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// WebSocket server
// ───────────────────────────────────────────────────────────────────────────

// `ws` defaults to a 100 MiB frame limit; a single oversized frame would be
// buffered in memory before any handler sees it. Chat/typing frames are tiny.
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

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
      if (!guestFrameLimiter(`ws-guest:${session.guest_id}`)) {
        ws.close(1008, 'RATE_LIMITED');
        return;
      }
      try { handleGuestMessage(ws, session, JSON.parse(raw.toString())); } catch { /* ignore malformed */ }
    });
    ws.on('close', () => guestClients.delete(ws));
    ws.on('error', () => guestClients.delete(ws));

  } else if (path === '/v1/owner/ws') {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const ownerUserId = ownerUserIdForToken(token);
    if (!ownerUserId) { ws.close(1008, 'UNAUTHORIZED'); return; }
    ownerClients.set(ws, { site_ids: [], user_id: ownerUserId });
    sendWs(ws, { type: 'connected' });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === 'subscribe' && Array.isArray(parsed.site_ids)) {
          const session = ownerClients.get(ws);
          if (session) {
            // Only allow subscribing to sites this owner actually owns.
            session.site_ids = parsed.site_ids.filter((id) => {
              if (typeof id !== 'string') return false;
              const siteRec = getSite(id);
              return Boolean(siteRec && siteRec.owner_user_id === session.user_id);
            });
            deliverPendingNotifications(ws, session.site_ids);
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
