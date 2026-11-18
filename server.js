/**
 * Mess&Anger — site root + PaymentO IPN server.
 *
 * Serves the static promo landing (./landing) at the site root
 * (https://mess.cvr.name/) and exposes the PaymentO IPN endpoint
 * (https://mess.cvr.name/api/paymento/ipn) required by the PaymentO store
 * settings ("Mess&Anger user" → IPN URL HTTP POST).
 *
 * Design constraints (see ROADMAP.md "Guiding constraints"):
 *   - No PII collection: the IPN handler stores only a signed, hash-chained
 *     receipt (payment id + timestamp + plan + amount). No email, no name.
 *   - No extra servers for core functionality: this endpoint is the only
 *     server the promo site needs; messaging/calls/etc. stay P2P.
 *   - Stateful by design for receipts: a small `receipts/` directory on disk
 *     (one JSON file per payment id) is the only persistent state.
 *
 * Env vars (see .env.example):
 *   PORT                    — listen port (default 8080)
 *   PAYMENTO_SECRET         — shared secret from PaymentO store settings
 *   PAYMENTO_VERIFY_URL     — (optional) override PaymentO verify endpoint
 *   RECEIPTS_DIR            — where to persist IPN receipts (default ./receipts)
 *
 * Run:
 *   node server.js
 */
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  generateRoutingKeyPair,
  openRoutingEnvelope,
  routingPublicKey,
  sealRoutingEnvelope,
} from './src/lib/anon/routing.js';
import { isQueuePublicKey, verifyQueueCommand } from './src/lib/anon/signing.js';
import {
  isInviteToken,
  isPowChallenge,
  isPowSolution,
  verifyPow,
} from './src/lib/anon/spam.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const RECEIPTS_DIR = process.env.RECEIPTS_DIR
  ? path.resolve(process.env.RECEIPTS_DIR)
  : path.join(__dirname, 'receipts');

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Browser clients (Tauri webview, local dev server, landing) call these APIs
// from a different origin. Receipts additionally require the admin token.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Store-and-forward relay: encrypted envelopes only, never content or identity.
const RELAY_DIR = process.env.RELAY_DIR
  ? path.resolve(process.env.RELAY_DIR)
  : path.join(__dirname, 'relay');
const RELAY_TTL_MS = parseInt(process.env.RELAY_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10);
const RELAY_MAX_PER_DEST = parseInt(process.env.RELAY_MAX_PER_DEST || '200', 10);

// ───────────────────────────────────────────────────────────────────────────
// PaymentO (crypto) premium config
// ───────────────────────────────────────────────────────────────────────────
const PAYMENTO_API_URL = (process.env.PAYMENTO_API_URL || 'https://api.paymento.io').replace(/\/+$/, '');
const PAYMENTO_API_KEY = (process.env.PAYMENTO_API_KEY || '').trim();
// PaymentO signs IPN callbacks with the store secret. Accept a comma-separated
// list so a rotated/extra secret can be added without a code change.
const PAYMENTO_SECRETS = (process.env.PAYMENTO_SECRET_KEYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PAYMENTO_SECRET = (PAYMENTO_SECRETS[0] || process.env.PAYMENTO_SECRET_KEY || process.env.PAYMENTO_SECRET || '').trim();
if (PAYMENTO_SECRET && !PAYMENTO_SECRETS.includes(PAYMENTO_SECRET)) PAYMENTO_SECRETS.unshift(PAYMENTO_SECRET);
const PAYMENTO_RETURN_URL = (process.env.PAYMENTO_RETURN_URL || '').trim();
const PAYMENTO_VERIFY_URL = (process.env.PAYMENTO_VERIFY_URL || `${PAYMENTO_API_URL}/v1/payment/verify`).trim();
const PAYMENTO_GATEWAY_URL = (process.env.PAYMENTO_GATEWAY_URL || 'https://app.paymento.io/gateway').trim();
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

// The license key signs temporary premium grants. Derive a separate key from
// the PaymentO secret when PREMIUM_LICENSE_SECRET is not set instead of reusing
// the IPN secret directly.
const PREMIUM_LICENSE_SECRET = (
  process.env.PREMIUM_LICENSE_SECRET ||
  (PAYMENTO_SECRET
    ? crypto.createHash('sha256').update(`nova-premium-license:${PAYMENTO_SECRET}`).digest('hex')
    : '')
).trim();
const PREMIUM_PLANS = {
  premium: { id: 'premium', days: 30, price: 3.9, currency: 'USD' },
};
const ORDERS_DIR = process.env.ORDERS_DIR ? path.resolve(process.env.ORDERS_DIR) : path.join(__dirname, 'orders');
const LICENSES_DIR = process.env.LICENSES_DIR ? path.resolve(process.env.LICENSES_DIR) : path.join(__dirname, 'licenses');
const GIFTS_DIR = process.env.GIFTS_DIR ? path.resolve(process.env.GIFTS_DIR) : path.join(__dirname, 'gifts');
const PAID_STATUSES = new Set([7, 8]);
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// ───────────────────────────────────────────────────────────────────────────
// Small in-memory rate limiter (per process; enough for one IPN host)
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

const ipnLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });
const checkoutLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const orderLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });
const statusLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    if (IS_PRODUCTION) return res.status(404).json({ ok: false, error: 'not found' });
    return next();
  }
  const provided = String(req.headers['x-admin-token'] || '');
  const expected = Buffer.from(ADMIN_TOKEN);
  const given = Buffer.from(provided);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
}

// ───────────────────────────────────────────────────────────────────────────
// Static: landing at root
// ───────────────────────────────────────────────────────────────────────────
// Digital Asset Links for Android App Links. express.static() ignores dotfiles
// by default, so this file needs an explicit route.
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.type('application/json');
  res.sendFile(path.join(__dirname, 'landing', '.well-known', 'assetlinks.json'));
});

// Serve the landing (static promo) at the site root.
app.use(express.static(path.join(__dirname, 'landing')));

// ───────────────────────────────────────────────────────────────────────────
// PaymentO IPN: POST /api/paymento/ipn
//
// PaymentO (store: "Mess&Anger user") sends an HTTP POST here on every
// payment event. We verify the signature, persist a receipt, and return 200
// so PaymentO does not retry.
//
// The actual premium activation happens on the user's device: after a paid
// (and provider-verified) PaymentO payment this server issues a device-bound,
// HMAC-signed license (`MA1.<payload>.<sig>`); the app stores it locally and
// re-verifies it against this server on startup. The server itself never
// exposes entitlement state beyond the issued license.
// ───────────────────────────────────────────────────────────────────────────
function verifyPaymentoSignature(rawBody, provided, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  const providedHex = String(provided || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(providedHex, 'hex');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Returns the secret that matched the signature, or null. */
function verifyPaymentoSignatureAny(rawBody, provided) {
  const matched = PAYMENTO_SECRETS.find((secret) => verifyPaymentoSignature(rawBody, provided, secret));
  return matched || null;
}

function parseIpnBody(rawBody) {
  const text = rawBody.toString('utf8').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  try {
    const body = {};
    for (const [key, value] of new URLSearchParams(text).entries()) body[key] = value;
    return Object.keys(body).length ? body : null;
  } catch {
    return null;
  }
}

/** PaymentO sends PascalCase fields; older payloads used camelCase. */
function normalizeIpn(input) {
  const body = input || {};
  const additional = body.AdditionalData ?? body.additionalData ?? body.additional_data;
  return {
    token: String(body.Token ?? body.token ?? ''),
    paymentId: String(body.PaymentId ?? body.paymentId ?? body.payment_id ?? body.id ?? ''),
    orderId: String(body.OrderId ?? body.orderId ?? body.order_id ?? ''),
    status: Number(body.OrderStatus ?? body.orderStatus ?? body.status ?? 0),
    amount: Number(body.Amount ?? body.amount ?? 0) || null,
    currency: String(body.Currency ?? body.currency ?? '').toUpperCase() || null,
    plan: String(body.Plan ?? body.plan ?? (Array.isArray(additional) ? '' : '') ?? ''),
  };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function receiptFile(paymentId) {
  const safeId = String(paymentId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  return { safeId, file: path.join(RECEIPTS_DIR, `${safeId}.json`) };
}

function persistReceipt(ipn) {
  const { safeId, file } = receiptFile(ipn.paymentId || `local-${Date.now()}`);
  const record = {
    id: safeId,
    paymentId: ipn.paymentId || null,
    orderId: ipn.orderId || null,
    plan: ipn.plan || null,
    amount: ipn.amount,
    currency: ipn.currency,
    status: ipn.status,
    verified: false,
    licenseIssued: false,
    receivedAt: new Date().toISOString(),
  };
  writeAtomic(file, JSON.stringify(record, null, 2));
  return safeId;
}

function updateReceipt(paymentId, patch) {
  const { safeId, file } = receiptFile(paymentId);
  let current = {};
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { current = { id: safeId }; }
  writeAtomic(file, JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }, null, 2));
}


// ───────────────────────────────────────────────────────────────────────────
// Premium license helpers
// ───────────────────────────────────────────────────────────────────────────
function safeFileId(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function paymentoCreate({ amount, currency, orderId, returnUrl }) {
  return (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const payload = {
        fiatAmount: String(amount),
        fiatCurrency: currency,
        orderId,
        Speed: 0,
      };
      if (returnUrl) payload.ReturnUrl = returnUrl;
      const resp = await fetch(`${PAYMENTO_API_URL}/v1/payment/request`, {
        method: 'POST',
        headers: {
          'Api-key': PAYMENTO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'text/plain',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const text = await resp.text();
      if (!resp.ok) throw new Error(text || `Paymento create failed (${resp.status})`);
      let parsed;
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { body: text }; }
      const token = parsed && (parsed.body ?? parsed.token) || (typeof parsed === 'string' ? parsed : null);
      if (!token || typeof token !== 'string') throw new Error('Paymento did not return a token');
      return { token, paymentUrl: `${PAYMENTO_GATEWAY_URL}?token=${encodeURIComponent(token)}` };
    } finally {
      clearTimeout(t);
    }
  })();
}

async function paymentoVerify(token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(PAYMENTO_VERIFY_URL, {
      method: 'POST',
      headers: { 'Api-key': PAYMENTO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || `Verify failed (${resp.status})`);
    const parsed = text ? JSON.parse(text) : {};
    const body = parsed.body || parsed;
    const settlement = body.settlement || {};
    return {
      status: Number(body.orderStatus ?? body.OrderStatus ?? body.status ?? 0),
      orderId: String(body.orderId ?? body.order_id ?? body.OrderId ?? ''),
      amount: Number(settlement.requestedFiatAmount ?? body.amount ?? 0),
      currency: String(settlement.currency ?? body.currency ?? ''),
    };
  } finally {
    clearTimeout(t);
  }
}

function issueLicense({ device, plan, orderId, expiresAt }) {
  if (!PREMIUM_LICENSE_SECRET) {
    throw new Error('PREMIUM_LICENSE_SECRET is not configured');
  }
  const p = PREMIUM_PLANS[plan];
  if (!p) throw new Error('unknown plan');
  if (!device) throw new Error('device required');
  const exp = Number.isFinite(expiresAt)
    ? Number(expiresAt)
    : Date.now() + p.days * 24 * 60 * 60 * 1000;
  const payload = { v: 1, d: String(device), p: plan, o: orderId, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', PREMIUM_LICENSE_SECRET).update(body).digest('base64url');
  const key = `MA1.${body}.${sig}`;
  const keyId = crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  writeAtomic(
    path.join(LICENSES_DIR, `${keyId}.json`),
    JSON.stringify({ key, device: String(device), plan, orderId, exp, issuedAt: new Date().toISOString() }, null, 2)
  );
  return { license: key, expiresAt: exp };
}

function verifyLicense(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'MA1') return null;
  const [, body, sig] = parts;
  const calc = crypto.createHmac('sha256', PREMIUM_LICENSE_SECRET).update(body).digest('base64url');
  const expected = Buffer.from(calc);
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (!Number.isFinite(Number(payload.exp))) return null;
    return { payload, expired: Date.now() > Number(payload.exp) + CLOCK_SKEW_MS };
  } catch {
    return null;
  }
}

function loadOrder(orderId) {
  const file = path.join(ORDERS_DIR, `${safeFileId(orderId)}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function saveOrder(order) {
  writeAtomic(path.join(ORDERS_DIR, `${safeFileId(order.orderId)}.json`), JSON.stringify(order, null, 2));
}

function giftCodeHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function giftEncryptionKey() {
  if (!PREMIUM_LICENSE_SECRET) throw new Error('PREMIUM_LICENSE_SECRET is not configured');
  return crypto.createHash('sha256').update(`nova-premium-gift:v1:${PREMIUM_LICENSE_SECRET}`).digest();
}

function encryptGiftCode(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', giftEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decryptGiftCode(encrypted) {
  const payload = Buffer.from(String(encrypted || ''), 'base64url');
  if (payload.length <= 28) throw new Error('invalid encrypted gift code');
  const decipher = crypto.createDecipheriv('aes-256-gcm', giftEncryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}

function saveGift(gift) {
  writeAtomic(
    path.join(GIFTS_DIR, `${gift.codeHash}.json`),
    JSON.stringify(gift, null, 2),
  );
}

function loadGift(codeHash) {
  const file = path.join(GIFTS_DIR, `${codeHash}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureGiftEntitlement(order) {
  if (!order.giftCodeHash || !order.giftCodeEncrypted) {
    const code = `NOVA-GIFT-${crypto.randomBytes(24).toString('base64url')}`;
    order.giftCodeHash = giftCodeHash(code);
    order.giftCodeEncrypted = encryptGiftCode(code);
    saveOrder(order);
  }
  const code = decryptGiftCode(order.giftCodeEncrypted);
  if (giftCodeHash(code) !== order.giftCodeHash) throw new Error('gift code hash mismatch');
  const existing = loadGift(order.giftCodeHash);
  if (!existing) {
    saveGift({
      codeHash: order.giftCodeHash,
      orderId: order.orderId,
      plan: order.plan,
      status: 'available',
      createdAt: new Date().toISOString(),
    });
  } else if (existing.orderId !== order.orderId || existing.codeHash !== order.giftCodeHash) {
    throw new Error('gift entitlement does not match order');
  }
  return code;
}

const GIFT_CODE_PATTERN = /^NOVA-GIFT-[A-Za-z0-9_-]{32}$/;
const redeemingGifts = new Set();

function amountsMatch(order, verified) {
  if (!verified || !Number.isFinite(Number(verified.amount)) || Number(verified.amount) <= 0) return false;
  const expected = Number(order.amount);
  const actual = Number(verified.amount);
  if (!Number.isFinite(expected) || Math.abs(expected - actual) > 0.01) return false;
  const currency = String(verified.currency || '').toUpperCase();
  return !currency || currency === String(order.currency || '').toUpperCase();
}

const fulfillingOrders = new Set();
async function fulfillOrder(orderId) {
  if (!orderId) return null;
  if (fulfillingOrders.has(orderId)) return loadOrder(orderId);
  fulfillingOrders.add(orderId);
  try {
    const order = loadOrder(orderId);
    if (
      !order ||
      order.license ||
      (order.kind === 'gift' && order.status === 'paid' && order.giftCodeHash)
    ) return order || null;
    if (!order.token || !PAYMENTO_API_KEY) return order;
    let verified;
    try {
      verified = await paymentoVerify(order.token);
    } catch (err) {
      console.warn('[paymento] verify failed', { orderId, error: String(err && err.message ? err.message : err) });
      return order;
    }
    if (!PAID_STATUSES.has(verified.status) || !amountsMatch(order, verified)) {
      order.status = 'pending';
      order.providerStatus = verified.status;
      order.updatedAt = new Date().toISOString();
      saveOrder(order);
      return order;
    }
    const fresh = loadOrder(orderId) || order;
    if (
      fresh.license ||
      (fresh.kind === 'gift' && fresh.status === 'paid' && fresh.giftCodeHash)
    ) return fresh;
    if (fresh.kind === 'gift') {
      ensureGiftEntitlement(fresh);
    } else {
      const { license, expiresAt } = issueLicense({ device: fresh.device, plan: fresh.plan, orderId: fresh.orderId });
      fresh.license = license;
      fresh.expiresAt = expiresAt;
    }
    fresh.status = 'paid';
    fresh.paidAt = new Date().toISOString();
    saveOrder(fresh);
    console.log(fresh.kind === 'gift' ? '[paymento] premium gift issued' : '[paymento] license issued', { orderId: fresh.orderId });
    return fresh;
  } finally {
    fulfillingOrders.delete(orderId);
  }
}

// Raw body capture + IPN route. The raw capture MUST be registered before the
// JSON/urlencoded parsers so the HMAC signature is computed over exact bytes.
app.post('/api/paymento/ipn', express.raw({ type: '*/*', limit: '128kb' }), async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!ipnLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const body = parseIpnBody(rawBody);
  if (!body) return res.status(400).json({ ok: false, reason: 'bad body' });
  const provided = String(req.headers['x-hmac-sha256-signature'] || body.signature || body.signature_sha256 || body.ipn_signature || '');

  // HMAC is computed over the raw bytes PaymentO signed.
  let sigError = null;
  let signatureOk = false;
  if (PAYMENTO_SECRETS.length === 0) {
    sigError = 'secret not configured';
  } else if (!/^[0-9a-f]{64}$/i.test(String(provided).trim())) {
    sigError = 'malformed signature';
  } else {
    const matched = verifyPaymentoSignatureAny(rawBody, provided);
    if (matched) {
      signatureOk = true;
      console.log('[paymento] IPN signature matched secret:', String(matched).slice(0, 6) + '…' + String(matched).slice(-4));
    } else {
      sigError = 'bad signature';
    }
  }

  const ipn = normalizeIpn(body);

  if (!signatureOk) {
    // Log enough to diagnose a secret mismatch from the host without leaking it.
    console.warn('[paymento] IPN rejected', {
      paymentId: ipn.paymentId,
      reason: sigError,
      method: req.method,
      contentType: req.headers['content-type'],
      secretsConfigured: PAYMENTO_SECRETS.length,
      providedSignature: String(provided).slice(0, 16),
      rawBody: rawBody.toString('utf8').slice(0, 600),
    });

    return res.status(400).json({ ok: false, reason: 'bad signature' });
  }

  const id = persistReceipt(ipn);
  console.log('[paymento] IPN accepted', { id, amount: ipn.amount, plan: ipn.plan, orderId: ipn.orderId });

  res.json({ ok: true, id });

  // Async fulfillment: only confirm license when the provider really settled.
  if (ipn.orderId) void fulfillOrder(ipn.orderId).catch((err) => {
    console.error('[paymento] fulfillment error', { orderId: ipn.orderId, error: String(err && err.message ? err.message : err) });
  });
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// ───────────────────────────────────────────────────────────────────────────
// Premium (PaymentO) endpoints
// ───────────────────────────────────────────────────────────────────────────
const DEVICE_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

app.post('/api/premium/checkout', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    if (!checkoutLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
    const plan = (req.body && req.body.plan) || 'premium';
    const device = String((req.body && req.body.device) || '');
    const p = PREMIUM_PLANS[plan];
    if (!p) return res.status(400).json({ ok: false, error: 'unknown plan' });
    if (!DEVICE_PATTERN.test(device)) return res.status(400).json({ ok: false, error: 'invalid device' });
    if (!PAYMENTO_API_KEY) return res.status(503).json({ ok: false, error: 'payments disabled' });
    const orderId = `ord_${crypto.randomBytes(8).toString('hex')}`;
    const order = { orderId, plan, device, amount: p.price, currency: p.currency, status: 'pending', createdAt: new Date().toISOString() };
    saveOrder(order);
    const returnUrl = PAYMENTO_RETURN_URL || (req.headers.origin ? `${req.headers.origin}/premium.html` : '');
    const { token, paymentUrl } = await paymentoCreate({ amount: p.price, currency: p.currency, orderId, returnUrl });
    order.token = token;
    saveOrder(order);
    res.json({ ok: true, orderId, token, url: paymentUrl });
  } catch (err) {
    console.error('[paymento] checkout failed', { error: String(err && err.message ? err.message : err) });
    res.status(502).json({ ok: false, error: 'payment provider error' });
  }
});

app.post('/api/premium/gift/checkout', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    if (!checkoutLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
    const device = String((req.body && req.body.device) || '');
    const plan = PREMIUM_PLANS.premium;
    if (!DEVICE_PATTERN.test(device)) return res.status(400).json({ ok: false, error: 'invalid device' });
    if (!PAYMENTO_API_KEY) return res.status(503).json({ ok: false, error: 'payments disabled' });
    if (!PREMIUM_LICENSE_SECRET) return res.status(503).json({ ok: false, error: 'gift service unavailable' });
    const orderId = `ord_${crypto.randomBytes(8).toString('hex')}`;
    const order = {
      orderId,
      kind: 'gift',
      plan: plan.id,
      device,
      amount: plan.price,
      currency: plan.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    saveOrder(order);
    const returnUrl = PAYMENTO_RETURN_URL || (req.headers.origin ? `${req.headers.origin}/premium.html` : '');
    const { token, paymentUrl } = await paymentoCreate({
      amount: plan.price,
      currency: plan.currency,
      orderId,
      returnUrl,
    });
    order.token = token;
    saveOrder(order);
    res.json({ ok: true, orderId, url: paymentUrl });
  } catch (err) {
    console.error('[paymento] gift checkout failed', { error: String(err && err.message ? err.message : err) });
    res.status(502).json({ ok: false, error: 'payment provider error' });
  }
});

app.get('/api/premium/order/:orderId', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!orderLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
  const order = loadOrder(req.params.orderId);
  if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
  const device = String(req.query.device || '');
  if (!DEVICE_PATTERN.test(device) || String(order.device) !== device) {
    return res.status(403).json({ ok: false, error: 'device mismatch' });
  }
  if (order.license) {
    return res.json({ ok: true, status: 'paid', license: order.license, expiresAt: order.expiresAt });
  }
  if (order.kind === 'gift' && order.status === 'paid' && order.giftCodeEncrypted) {
    try {
      return res.json({ ok: true, status: 'paid', giftCode: decryptGiftCode(order.giftCodeEncrypted) });
    } catch (err) {
      console.error('[paymento] gift code decrypt failed', { orderId: order.orderId, error: String(err && err.message ? err.message : err) });
      return res.status(500).json({ ok: false, error: 'gift code unavailable' });
    }
  }
  if (order.token && PAYMENTO_API_KEY) {
    try {
      const fresh = await fulfillOrder(order.orderId);
      if (!fresh) return res.status(404).json({ ok: false, error: 'order not found' });
      if (fresh.kind === 'gift' && fresh.status === 'paid' && fresh.giftCodeEncrypted) {
        return res.json({ ok: true, status: 'paid', giftCode: decryptGiftCode(fresh.giftCodeEncrypted) });
      }
      if (fresh.license) {
        return res.json({ ok: true, status: 'paid', license: fresh.license, expiresAt: fresh.expiresAt });
      }
      return res.json({ ok: true, status: fresh.status, paymentStatus: fresh.providerStatus });
    } catch (err) {
      console.error('[paymento] order fulfillment failed', { orderId: order.orderId, error: String(err && err.message ? err.message : err) });
      return res.status(502).json({ ok: false, error: 'payment verification failed' });
    }
  }
  return res.json({ ok: true, status: order.status });
});

app.post('/api/premium/gift/redeem', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!statusLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
  const code = String((req.body && req.body.code) || '').trim();
  const device = String((req.body && req.body.device) || '');
  if (!GIFT_CODE_PATTERN.test(code)) {
    return res.status(400).json({ ok: false, error: 'invalid gift code' });
  }
  if (!DEVICE_PATTERN.test(device)) {
    return res.status(400).json({ ok: false, error: 'invalid device' });
  }

  const codeHash = giftCodeHash(code);
  try {
    let gift = loadGift(codeHash);
    if (!gift || gift.codeHash !== codeHash) {
      return res.status(400).json({ ok: false, error: 'invalid gift code' });
    }
    if (gift.status === 'redeemed') {
      if (gift.device !== device || typeof gift.license !== 'string') {
        return res.status(409).json({ ok: false, error: 'gift code already redeemed' });
      }
      const verified = verifyLicense(gift.license);
      if (!verified || verified.expired) {
        return res.status(400).json({ ok: false, error: 'gift code expired' });
      }
      return res.json({ ok: true, license: gift.license, expiresAt: verified.payload.exp });
    }
    if (gift.status !== 'available') {
      return res.status(409).json({ ok: false, error: 'gift code unavailable' });
    }
    if (redeemingGifts.has(codeHash)) {
      return res.status(409).json({ ok: false, error: 'gift code redemption in progress' });
    }

    redeemingGifts.add(codeHash);
    gift = loadGift(codeHash);
    if (!gift || gift.status !== 'available') {
      return res.status(409).json({ ok: false, error: 'gift code unavailable' });
    }
    const current = verifyLicense(String((req.body && req.body.currentLicense) || ''));
    const currentExpiry =
      current && !current.expired && current.payload.d === device && current.payload.p === gift.plan
        ? Number(current.payload.exp)
        : 0;
    const newExpiry =
      Math.max(Date.now(), currentExpiry) + PREMIUM_PLANS[gift.plan].days * 24 * 60 * 60 * 1000;
    const { license, expiresAt } = issueLicense({
      device,
      plan: gift.plan,
      orderId: `gift_${gift.orderId}`,
      expiresAt: newExpiry,
    });
    gift.status = 'redeemed';
    gift.device = device;
    gift.license = license;
    gift.expiresAt = expiresAt;
    gift.redeemedAt = new Date().toISOString();
    saveGift(gift);
    return res.json({ ok: true, license, expiresAt });
  } catch (err) {
    console.error('[premium] gift redemption failed', { codeHash, error: String(err && err.message ? err.message : err) });
    return res.status(500).json({ ok: false, error: 'gift redemption failed' });
  } finally {
    redeemingGifts.delete(codeHash);
  }
});

app.post('/api/premium/activate', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!statusLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
  const license = String((req.body && req.body.license) || '');
  const device = String((req.body && req.body.device) || '');
  const v = verifyLicense(license);
  if (!v) return res.status(400).json({ ok: false, error: 'invalid license' });
  if (v.expired) return res.status(400).json({ ok: false, error: 'license expired' });
  if (!DEVICE_PATTERN.test(device) || String(v.payload.d) !== device) {
    return res.status(403).json({ ok: false, error: 'device mismatch' });
  }
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
  writeAtomic(path.join(LICENSES_DIR, `activation-${safeFileId(license)}.json`), JSON.stringify({ license, device, activatedAt: new Date().toISOString() }, null, 2));
  res.json({ ok: true, expiresAt: v.payload.exp, plan: v.payload.p });
});

app.get('/api/premium/status', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!statusLimiter(ip)) return res.status(429).json({ ok: false, reason: 'rate limited' });
  const license = String((req.query && req.query.license) || '');
  const device = String((req.query && req.query.device) || '');
  const v = verifyLicense(license);
  if (!v) return res.status(400).json({ ok: false, error: 'invalid license' });
  if (v.expired) return res.status(400).json({ ok: false, error: 'expired', expiresAt: v.payload.exp });
  if (!DEVICE_PATTERN.test(device) || String(v.payload.d) !== device) {
    return res.status(403).json({ ok: false, error: 'device mismatch' });
  }
  res.json({ ok: true, expiresAt: v.payload.exp, plan: v.payload.p });
});

// ───────────────────────────────────────────────────────────────────────────
// Health + admin
// ───────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ───────────────────────────────────────────────────────────────────────────
// Presence: who is online right now (in-memory, short TTL). Carries only an
// opaque identifier — with client-side presence hashing on, that identifier is
// a truncated SHA-256 (`ph1.<hex>`), not the raw fingerprint. Clients may ask
// for a per-heartbeat TTL (45 s – 5 min, clamped); nothing else is stored.
// ───────────────────────────────────────────────────────────────────────────
const PRESENCE_TTL_MS = 2 * 60 * 1000;
const PRESENCE_MIN_TTL_MS = 45 * 1000;
const PRESENCE_MAX_TTL_MS = 5 * 60 * 1000;
const presenceMap = new Map();
function sweepPresence() {
  const now = Date.now();
  for (const [id, entry] of presenceMap) {
    if (now - entry.lastSeen > entry.ttlMs) presenceMap.delete(id);
  }
}
app.post('/api/presence', (req, res) => {
  const raw = req && req.body && req.body.fingerprint;
  // Allow dots so hashed ids (`ph1.<hex>`) pass the sanitizer.
  const safe = typeof raw === 'string' ? raw.replace(/[^a-zA-Z0-9_.-]/g, '') : '';
  if (!safe) return res.status(400).json({ ok: false, reason: 'missing fingerprint' });
  const requested = Number(req && req.body && req.body.ttlMs);
  const ttlMs = Number.isFinite(requested)
    ? Math.min(PRESENCE_MAX_TTL_MS, Math.max(PRESENCE_MIN_TTL_MS, requested))
    : PRESENCE_TTL_MS;
  sweepPresence();
  presenceMap.set(safe, { lastSeen: Date.now(), ttlMs });
  res.json({ ok: true });
});
app.get('/api/presence', (_req, res) => {
  sweepPresence();
  res.json({ fingerprints: [...presenceMap.keys()] });
});

// List recent receipts (admin / audit).
app.get('/api/paymento/receipts', requireAdmin, (_req, res) => {
  try {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    const files = fs.readdirSync(RECEIPTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50);
    const out = files.map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RECEIPTS_DIR, f), 'utf8'));
      } catch {
        return { file: f, error: 'unreadable' };
      }
    });
    res.json({ receipts: out });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Relay: store-and-forward for encrypted envelopes (thin, stateless transport)
//
// The relay never sees plaintext: envelopes carry an encrypted payload and a
// destination fingerprint (a public key fingerprint, not PII). It stores them
// on disk with a TTL and returns them to the destination on fetch, deleting
// them afterwards (store-and-forward). No identity or message content is kept.
// ───────────────────────────────────────────────────────────────────────────
function relayDestDir(destination) {
  const safe = String(destination).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(RELAY_DIR, safe);
}

function sweepRelayExpired() {
  try {
    fs.mkdirSync(RELAY_DIR, { recursive: true });
    const dests = fs.readdirSync(RELAY_DIR);
    for (const dest of dests) {
      const dir = path.join(RELAY_DIR, dest);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (Date.now() > (rec.expiresAt || 0)) {
            fs.unlinkSync(path.join(dir, f));
          }
        } catch {
          // drop unreadable files
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      } catch {}
    }
  } catch {}
}

app.post('/api/relay', (req, res) => {
  const envelope = req && req.body && req.body.envelope;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return res.status(400).json({ ok: false, reason: 'missing envelope' });
  }
  const destination = envelope.destination;
  const id = envelope.id;
  if (!destination || !id) {
    return res.status(400).json({ ok: false, reason: 'missing destination or id' });
  }
  sweepRelayExpired();
  const dir = relayDestDir(destination);
  fs.mkdirSync(dir, { recursive: true });
  // Enforce per-destination cap.
  const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (existing.length >= RELAY_MAX_PER_DEST) {
    return res.status(429).json({ ok: false, reason: 'destination queue full' });
  }
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  const file = path.join(dir, `${safeId}.json`);
  const record = {
    envelope,
    expiresAt: Date.now() + RELAY_TTL_MS,
    storedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(record));
  return res.status(202).json({ ok: true, id: safeId });
});

app.get('/api/relay/:destination', (req, res) => {
  const destination = req.params.destination;
  sweepRelayExpired();
  const dir = relayDestDir(destination);
  let envelopes = [];
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (Date.now() <= (rec.expiresAt || 0) && rec.envelope) {
            envelopes.push(rec.envelope);
          }
          fs.unlinkSync(path.join(dir, f));
        } catch {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
      try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {}
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
  return res.json({ envelopes });
});

// ───────────────────────────────────────────────────────────────────────────
// Anonymous queue relay (v1): one-way, fixed-size packets, TTL, no identity.
// In-memory for v1; suitable for development and small deployments. For
// production persistence, back this with the same disk pattern as /api/relay.
// ───────────────────────────────────────────────────────────────────────────
const ANON_QUEUE_TTL_DEFAULT_MS = 14 * 24 * 60 * 60 * 1000;
const ANON_QUEUE_TTL_MAX_MS = 21 * 24 * 60 * 60 * 1000;
const ANON_PACKET_TTL_DEFAULT_MS = 24 * 60 * 60 * 1000;
const ANON_MAX_PACKETS_PER_QUEUE = 200;
const ANON_REPORT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ANON_MAX_REPORTS = 10000;
// Reports are hash-only, but they drive creation blocks, so they have to
// survive a restart — otherwise every deploy hands spammers a clean slate.
const ANON_REPORTS_DIR = process.env.ANON_REPORTS_DIR
  ? path.resolve(process.env.ANON_REPORTS_DIR)
  : path.join(__dirname, 'anon-reports');
// Creation budget per signing key: one invite holder cannot mint queues in bulk
// just by changing proxy client key or IP.
const ANON_CREATE_PER_SIGNING_KEY = 10; // queues per signing key per hour
const ANON_CREATE_WINDOW_MS = 60 * 60 * 1000;
// Live spam reports needed before a signing key loses queue creation. Reports
// are hash-only and unauthenticated, so this is a speed bump, not a ban.
const ANON_SPAM_BLOCK_REPORTS = 3;
const ANON_PACKET_PROFILES = new Set([4096, 16384, 65536]);
const ANON_ROUTING_MAX_AGE_MS = 5 * 60 * 1000;
const ANON_ROUTING_FUTURE_SKEW_MS = 60 * 1000;
const ANON_COMMAND_MAX_AGE_MS = 5 * 60 * 1000;
const ANON_COMMAND_FUTURE_SKEW_MS = 60 * 1000;
const anonQueues = new Map();
const anonAbuseReports = new Map();
const anonCreateBySigningKey = new Map();
// signingKeyHash -> live spam report ids, so a block lifts when its reports
// expire instead of lingering for the process lifetime.
const anonSpamReportsByKey = new Map();
const anonRoutingNonces = new Map();
const anonCommandNonces = new Map();

// Routing key: clients seal proxy-hop commands to this X25519 key, so the
// proxy only forwards opaque envelopes. Pin the public key on clients.
let ANON_ROUTING_PRIVATE_KEY = (process.env.ANON_ROUTING_PRIVATE_KEY || '').trim();
let ANON_ROUTING_PUBLIC_KEY = '';
let ANON_ROUTING_ENABLED = false;
if (ANON_ROUTING_PRIVATE_KEY) {
  try {
    ANON_ROUTING_PUBLIC_KEY = routingPublicKey(ANON_ROUTING_PRIVATE_KEY);
    ANON_ROUTING_ENABLED = true;
  } catch (err) {
    console.error('[anon] invalid ANON_ROUTING_PRIVATE_KEY', {
      error: String(err && err.message ? err.message : err),
    });
  }
} else {
  const generated = generateRoutingKeyPair();
  ANON_ROUTING_PRIVATE_KEY = generated.privateKey;
  ANON_ROUTING_PUBLIC_KEY = generated.publicKey;
  ANON_ROUTING_ENABLED = true;
  console.warn(
    '[anon] ANON_ROUTING_PRIVATE_KEY not set; generated an ephemeral routing key. Set it for stable proxy mode.',
  );
  console.log(`[anon] routing public key: ${ANON_ROUTING_PUBLIC_KEY}`);
}

const anonRateBuckets = new Map();
function anonRateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = anonRateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    anonRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}
function anonClientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Per-signing-key creation budget. Keyed on the hash so the bucket map never
// holds a reusable public key, and separate from the per-IP/proxy-client limit
// so clients sharing one proxy do not spend each other's budget.
function anonCreateRateLimitForKey(signingPublicKey) {
  const key = anonHash(signingPublicKey);
  const now = Date.now();
  const bucket = anonCreateBySigningKey.get(key);
  if (!bucket || now > bucket.resetAt) {
    anonCreateBySigningKey.set(key, { count: 1, resetAt: now + ANON_CREATE_WINDOW_MS });
    if (anonCreateBySigningKey.size > 50000) {
      for (const [k, v] of anonCreateBySigningKey) if (now > v.resetAt) anonCreateBySigningKey.delete(k);
    }
    return true;
  }
  if (bucket.count >= ANON_CREATE_PER_SIGNING_KEY) return false;
  bucket.count += 1;
  return true;
}

function anonSpamReportCount(signingKeyHash) {
  const ids = anonSpamReportsByKey.get(signingKeyHash);
  return ids ? ids.size : 0;
}

function anonSpamIndexReport(reportId, signingKeyHash) {
  let ids = anonSpamReportsByKey.get(signingKeyHash);
  if (!ids) {
    ids = new Set();
    anonSpamReportsByKey.set(signingKeyHash, ids);
  }
  ids.add(reportId);
}

function anonSpamUnindexReport(reportId, signingKeyHash) {
  const ids = anonSpamReportsByKey.get(signingKeyHash);
  if (!ids) return;
  ids.delete(reportId);
  if (ids.size === 0) anonSpamReportsByKey.delete(signingKeyHash);
}

function anonReportFile(reportId) {
  return path.join(ANON_REPORTS_DIR, `${reportId}.json`);
}

function anonPersistReport(record) {
  try {
    writeAtomic(anonReportFile(record.reportId), JSON.stringify(record));
    return true;
  } catch (err) {
    // Memory-only mode keeps the relay serving if the disk is read-only.
    console.warn('[anon] could not persist report', {
      error: String(err && err.message ? err.message : err),
    });
    return false;
  }
}

function anonForgetReportFile(reportId) {
  try {
    fs.unlinkSync(anonReportFile(reportId));
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('[anon] could not delete report file', {
        error: String(err && err.message ? err.message : err),
      });
    }
  }
}

function anonStoreReport(record) {
  anonAbuseReports.set(record.reportId, record);
  if (record.category === 'spam') anonSpamIndexReport(record.reportId, record.signingKeyHash);
}

function anonIsStoredReport(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.reportId === 'string' &&
      /^[0-9a-f]{32}$/.test(value.reportId) &&
      typeof value.queueIdHash === 'string' &&
      /^[0-9a-f]{64}$/.test(value.queueIdHash) &&
      typeof value.signingKeyHash === 'string' &&
      /^[0-9a-f]{64}$/.test(value.signingKeyHash) &&
      ['spam', 'harassment', 'illegal'].includes(value.category) &&
      Number.isFinite(value.expiresAt),
  );
}

// Reload reports written by earlier runs so the spam block survives restarts.
// Files are named by report id, so a retry after a restart is still a duplicate.
function anonLoadReports() {
  let files;
  try {
    if (!fs.existsSync(ANON_REPORTS_DIR)) return 0;
    files = fs.readdirSync(ANON_REPORTS_DIR).filter((name) => /^[0-9a-f]{32}\.json$/.test(name));
  } catch (err) {
    console.warn('[anon] could not read reports directory', {
      error: String(err && err.message ? err.message : err),
    });
    return 0;
  }
  const now = Date.now();
  let loaded = 0;
  for (const name of files) {
    let record = null;
    try {
      record = JSON.parse(fs.readFileSync(path.join(ANON_REPORTS_DIR, name), 'utf8'));
    } catch {
      record = null;
    }
    if (!anonIsStoredReport(record)) {
      anonForgetReportFile(name.slice(0, -'.json'.length));
      continue;
    }
    if (now > record.expiresAt) {
      anonForgetReportFile(record.reportId);
      continue;
    }
    if (anonAbuseReports.size >= ANON_MAX_REPORTS) break;
    anonStoreReport(record);
    loaded += 1;
  }
  return loaded;
}

function anonHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function anonRandomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function anonRandomId(prefix, bytes) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;
}

function anonDecodeBase64(value) {
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
}

function anonCleanup() {
  const now = Date.now();
  for (const [queueId, queue] of anonQueues) {
    if (now > queue.expiresAt) {
      anonQueues.delete(queueId);
      continue;
    }
    for (const [packetId, packet] of queue.packets) {
      if (now > packet.expiresAt) queue.packets.delete(packetId);
    }
  }
  for (const [nonce, expiresAt] of anonRoutingNonces) {
    if (now > expiresAt) anonRoutingNonces.delete(nonce);
  }
  for (const [nonce, expiresAt] of anonCommandNonces) {
    if (now > expiresAt) anonCommandNonces.delete(nonce);
  }
  for (const [reportId, report] of anonAbuseReports) {
    if (now > report.expiresAt) {
      anonAbuseReports.delete(reportId);
      anonForgetReportFile(reportId);
      if (report.category === 'spam') anonSpamUnindexReport(reportId, report.signingKeyHash);
    }
  }
}

setInterval(anonCleanup, 60 * 1000).unref?.();
const anonReportsLoaded = anonLoadReports();

function anonVerifyCommand(queue, action, fields, auth) {
  if (!queue.signingPublicKey) return null;
  if (
    !auth ||
    typeof auth.signature !== 'string' ||
    typeof auth.signedAt !== 'number' ||
    typeof auth.commandNonce !== 'string'
  ) {
    return { status: 400, body: { ok: false, reason: 'MISSING_SIGNATURE' } };
  }
  const now = Date.now();
  if (
    auth.signedAt < now - ANON_COMMAND_MAX_AGE_MS ||
    auth.signedAt > now + ANON_COMMAND_FUTURE_SKEW_MS
  ) {
    return { status: 400, body: { ok: false, reason: 'STALE_COMMAND' } };
  }
  if (anonCommandNonces.has(auth.commandNonce)) {
    return { status: 409, body: { ok: false, reason: 'REPLAYED_COMMAND' } };
  }
  const valid = verifyQueueCommand(
    queue.signingPublicKey,
    {
      action,
      ...fields,
      signedAt: auth.signedAt,
      commandNonce: auth.commandNonce,
    },
    auth.signature,
  );
  if (!valid) {
    return { status: 403, body: { ok: false, reason: 'INVALID_SIGNATURE' } };
  }
  anonCommandNonces.set(auth.commandNonce, now + ANON_COMMAND_MAX_AGE_MS);
  return null;
}

function anonCreateQueue(ttlMs, signingPublicKey, pow) {
  const requestedTtl = Number(ttlMs);
  const ttl = Number.isFinite(requestedTtl)
    ? Math.min(ANON_QUEUE_TTL_MAX_MS, Math.max(60 * 1000, requestedTtl))
    : ANON_QUEUE_TTL_DEFAULT_MS;
  const effectiveSigningPublicKey =
    typeof signingPublicKey === 'string' && isQueuePublicKey(signingPublicKey)
      ? signingPublicKey
      : signingPublicKey === undefined
        ? undefined
        : null;
  if (signingPublicKey !== undefined && !effectiveSigningPublicKey) {
    return { status: 400, body: { ok: false, reason: 'INVALID_SIGNING_KEY' } };
  }
  if (pow !== undefined && !isPowChallenge(pow)) {
    return { status: 400, body: { ok: false, reason: 'INVALID_POW_CHALLENGE' } };
  }
  // Spam reports about a signing key stop it from creating new queues until
  // enough of those reports expire. Enqueueing on existing queues is untouched:
  // this withdraws the cheap "make a fresh queue per message" path only.
  if (effectiveSigningPublicKey) {
    if (anonSpamReportCount(anonHash(effectiveSigningPublicKey)) >= ANON_SPAM_BLOCK_REPORTS) {
      return { status: 403, body: { ok: false, reason: 'SIGNING_KEY_BLOCKED' } };
    }
    if (!anonCreateRateLimitForKey(effectiveSigningPublicKey)) {
      return { status: 429, body: { ok: false, reason: 'RATE_LIMITED' } };
    }
  }
  const queueId = anonRandomId('q', 16);
  const senderToken = anonRandomToken();
  const recipientToken = anonRandomToken();
  const inviteToken = anonRandomToken();
  const now = Date.now();
  anonQueues.set(queueId, {
    queueId,
    senderTokenHash: anonHash(senderToken),
    recipientTokenHash: anonHash(recipientToken),
    signingPublicKey: effectiveSigningPublicKey || null,
    pow: pow || null,
    powUsed: false,
    inviteTokenHash: anonHash(inviteToken),
    createdAt: now,
    expiresAt: now + ttl,
    packets: new Map(),
  });
  return {
    status: 201,
    body: { ok: true, queueId, senderToken, recipientToken, inviteToken, expiresAt: now + ttl },
  };
}

function anonEnqueue(queueId, senderToken, packet, auth, pow, inviteToken) {
  if (typeof queueId !== 'string' || typeof senderToken !== 'string' || typeof packet !== 'string') {
    return { status: 400, body: { ok: false, reason: 'missing fields' } };
  }
  const queue = anonQueues.get(queueId);
  if (!queue) return { status: 404, body: { ok: false, reason: 'QUEUE_NOT_FOUND' } };
  const now = Date.now();
  if (now > queue.expiresAt) {
    anonQueues.delete(queueId);
    return { status: 410, body: { ok: false, reason: 'QUEUE_EXPIRED' } };
  }
  if (anonHash(senderToken) !== queue.senderTokenHash) {
    return { status: 403, body: { ok: false, reason: 'INVALID_SENDER_TOKEN' } };
  }
  // One-time invite: the first enqueue must present the invite token and the
  // relay burns it, so a leaked invite cannot establish a second contact.
  if (queue.inviteTokenHash !== null) {
    if (!isInviteToken(inviteToken)) {
      return { status: 400, body: { ok: false, reason: 'INVITE_TOKEN_REQUIRED' } };
    }
    if (anonHash(inviteToken) !== queue.inviteTokenHash) {
      return { status: 403, body: { ok: false, reason: 'INVALID_INVITE_TOKEN' } };
    }
    queue.inviteTokenHash = null;
  }
  const authError = anonVerifyCommand(
    queue,
    'enqueue',
    { queueId, token: senderToken, packet, pow },
    auth,
  );
  if (authError) return authError;
  if (queue.pow && !queue.powUsed) {
    if (!isPowSolution(pow)) {
      return { status: 400, body: { ok: false, reason: 'POW_REQUIRED' } };
    }
    if (!verifyPow(queue.pow, pow)) {
      return { status: 403, body: { ok: false, reason: 'INVALID_POW' } };
    }
    queue.powUsed = true;
  }
  const bytes = anonDecodeBase64(packet);
  if (!bytes) return { status: 400, body: { ok: false, reason: 'INVALID_PACKET' } };
  if (!ANON_PACKET_PROFILES.has(bytes.length)) {
    return { status: 400, body: { ok: false, reason: 'PACKET_TOO_LARGE' } };
  }
  if (queue.packets.size >= ANON_MAX_PACKETS_PER_QUEUE) {
    return { status: 429, body: { ok: false, reason: 'QUEUE_FULL' } };
  }
  const packetId = anonRandomId('p', 12);
  const expiresAt = now + ANON_PACKET_TTL_DEFAULT_MS;
  queue.packets.set(packetId, {
    packetId,
    payload: packet,
    createdAt: now,
    expiresAt,
  });
  return { status: 202, body: { ok: true, packetId, expiresAt } };
}

function anonPoll(queueId, recipientToken, limit, auth) {
  if (typeof queueId !== 'string' || typeof recipientToken !== 'string') {
    return { status: 400, body: { ok: false, reason: 'missing fields' } };
  }
  const queue = anonQueues.get(queueId);
  if (!queue) return { status: 404, body: { ok: false, reason: 'QUEUE_NOT_FOUND' } };
  const now = Date.now();
  if (now > queue.expiresAt) {
    anonQueues.delete(queueId);
    return { status: 410, body: { ok: false, reason: 'QUEUE_EXPIRED' } };
  }
  if (anonHash(recipientToken) !== queue.recipientTokenHash) {
    return { status: 403, body: { ok: false, reason: 'INVALID_RECIPIENT_TOKEN' } };
  }
  const authError = anonVerifyCommand(queue, 'poll', { queueId, token: recipientToken, limit }, auth);
  if (authError) return authError;
  const max = Math.min(100, Math.max(1, Number(limit) || 32));
  const packets = [];
  for (const packet of queue.packets.values()) {
    if (now > packet.expiresAt) continue;
    packets.push({
      packetId: packet.packetId,
      payload: packet.payload,
      createdAt: packet.createdAt,
      expiresAt: packet.expiresAt,
    });
    if (packets.length >= max) break;
  }
  return { status: 200, body: { ok: true, packets, nextCursor: null } };
}

function anonAck(queueId, recipientToken, packetIds, auth) {
  if (typeof queueId !== 'string' || typeof recipientToken !== 'string' || !Array.isArray(packetIds)) {
    return { status: 400, body: { ok: false, reason: 'missing fields' } };
  }
  const queue = anonQueues.get(queueId);
  if (!queue) return { status: 404, body: { ok: false, reason: 'QUEUE_NOT_FOUND' } };
  if (anonHash(recipientToken) !== queue.recipientTokenHash) {
    return { status: 403, body: { ok: false, reason: 'INVALID_RECIPIENT_TOKEN' } };
  }
  const authError = anonVerifyCommand(queue, 'ack', { queueId, token: recipientToken, packetIds }, auth);
  if (authError) return authError;
  for (const id of packetIds) {
    if (typeof id === 'string') queue.packets.delete(id);
  }
  return { status: 200, body: { ok: true } };
}

function anonDeleteQueue(queueId, recipientToken, auth) {
  if (typeof queueId !== 'string' || typeof recipientToken !== 'string') {
    return { status: 400, body: { ok: false, reason: 'missing fields' } };
  }
  const queue = anonQueues.get(queueId);
  if (!queue) return { status: 404, body: { ok: false, reason: 'QUEUE_NOT_FOUND' } };
  if (anonHash(recipientToken) !== queue.recipientTokenHash) {
    return { status: 403, body: { ok: false, reason: 'INVALID_RECIPIENT_TOKEN' } };
  }
  const authError = anonVerifyCommand(queue, 'delete_queue', { queueId, token: recipientToken }, auth);
  if (authError) return authError;
  anonQueues.delete(queueId);
  return { status: 200, body: { ok: true } };
}

app.post('/api/anon/queues', (req, res) => {
  anonCleanup();
  if (!anonRateLimit(`create:${anonClientKey(req)}`, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
  }
  const result = anonCreateQueue(req.body?.ttlMs, req.body?.signingPublicKey, req.body?.pow);
  return res.status(result.status).json(result.body);
});

app.post('/api/anon/enqueue', (req, res) => {
  anonCleanup();
  if (!anonRateLimit(`enqueue:${anonClientKey(req)}`, 100, 60 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
  }
  const { queueId, senderToken, packet, pow, inviteToken, signature, signedAt, commandNonce } = req.body || {};
  const result = anonEnqueue(queueId, senderToken, packet, {
    signature,
    signedAt,
    commandNonce,
  }, pow, inviteToken);
  return res.status(result.status).json(result.body);
});

app.post('/api/anon/poll', (req, res) => {
  anonCleanup();
  if (!anonRateLimit(`poll:${anonClientKey(req)}`, 100, 60 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
  }
  const { queueId, recipientToken, limit, signature, signedAt, commandNonce } = req.body || {};
  const result = anonPoll(queueId, recipientToken, limit, {
    signature,
    signedAt,
    commandNonce,
  });
  return res.status(result.status).json(result.body);
});

app.post('/api/anon/ack', (req, res) => {
  anonCleanup();
  const { queueId, recipientToken, packetIds, signature, signedAt, commandNonce } = req.body || {};
  const result = anonAck(queueId, recipientToken, packetIds, {
    signature,
    signedAt,
    commandNonce,
  });
  return res.status(result.status).json(result.body);
});

app.post('/api/anon/queues/delete', (req, res) => {
  anonCleanup();
  const { queueId, recipientToken, signature, signedAt, commandNonce } = req.body || {};
  const result = anonDeleteQueue(queueId, recipientToken, {
    signature,
    signedAt,
    commandNonce,
  });
  return res.status(result.status).json(result.body);
});

app.get('/api/anon/routing-key', (req, res) => {
  if (!ANON_ROUTING_ENABLED) {
    return res.status(503).json({ ok: false, reason: 'ROUTING_NOT_CONFIGURED' });
  }
  return res.json({
    ok: true,
    version: 1,
    algorithm: 'x25519-hkdf-sha256-aes-256-gcm',
    publicKey: ANON_ROUTING_PUBLIC_KEY,
  });
});

// Sealed routing endpoint. The relay decrypts the envelope locally; the proxy
// never sees queue IDs or bearer tokens.
app.post('/api/anon/route', async (req, res) => {
  anonCleanup();
  if (!ANON_ROUTING_ENABLED) {
    return res.status(503).json({ ok: false, reason: 'ROUTING_NOT_CONFIGURED' });
  }
  if (!anonRateLimit(`route:${anonClientKey(req)}`, 240, 60 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
  }

  let route;
  try {
    route = await openRoutingEnvelope(ANON_ROUTING_PRIVATE_KEY, req.body?.envelope);
  } catch {
    return res.status(400).json({ ok: false, reason: 'INVALID_ENVELOPE' });
  }

  const now = Date.now();
  if (
    typeof route.iat !== 'number' ||
    !Number.isFinite(route.iat) ||
    typeof route.nonce !== 'string' ||
    route.nonce.length < 16 ||
    route.nonce.length > 128
  ) {
    return res.status(400).json({ ok: false, reason: 'INVALID_ENVELOPE' });
  }
  if (
    route.iat < now - ANON_ROUTING_MAX_AGE_MS ||
    route.iat > now + ANON_ROUTING_FUTURE_SKEW_MS
  ) {
    return res.status(400).json({ ok: false, reason: 'STALE_ENVELOPE' });
  }
  if (anonRoutingNonces.has(route.nonce)) {
    return res.status(409).json({ ok: false, reason: 'REPLAYED_ENVELOPE' });
  }
  anonRoutingNonces.set(route.nonce, now + ANON_ROUTING_MAX_AGE_MS);

  if (route.action === 'report') {
    if (!anonRateLimit(`route-report:${anonClientKey(req)}`, 60, 60 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
    }
    const report = route.report;
    if (
      !report ||
      typeof report !== 'object' ||
      report.v !== 1 ||
      typeof report.reportId !== 'string' ||
      !/^[0-9a-f]{32}$/.test(report.reportId) ||
      typeof report.queueIdHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(report.queueIdHash) ||
      typeof report.signingKeyHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(report.signingKeyHash) ||
      !['spam', 'harassment', 'illegal'].includes(report.category)
    ) {
      return res.status(400).json({ ok: false, reason: 'INVALID_REPORT' });
    }
    const existing = anonAbuseReports.get(report.reportId);
    if (existing) {
      const matches =
        existing.queueIdHash === report.queueIdHash &&
        existing.signingKeyHash === report.signingKeyHash &&
        existing.category === report.category;
      return matches
        ? res.json({ ok: true, duplicate: true })
        : res.status(409).json({ ok: false, reason: 'REPORT_ID_CONFLICT' });
    }
    if (anonAbuseReports.size >= ANON_MAX_REPORTS) {
      return res.status(503).json({ ok: false, reason: 'REPORT_STORE_FULL' });
    }
    const record = {
      reportId: report.reportId,
      queueIdHash: report.queueIdHash,
      signingKeyHash: report.signingKeyHash,
      category: report.category,
      receivedAt: now,
      expiresAt: now + ANON_REPORT_TTL_MS,
    };
    anonPersistReport(record);
    anonStoreReport(record);
    return res.status(201).json({ ok: true });
  }

  if (route.action === 'create') {
    if (!anonRateLimit(`route-create:${anonClientKey(req)}`, 20, 60 * 60 * 1000)) {
      return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
    }
    if (typeof route.replyPublicKey !== 'string') {
      return res.status(400).json({ ok: false, reason: 'INVALID_REPLY_KEY' });
    }
    const created = anonCreateQueue(route.ttlMs, route.signingPublicKey, route.pow);
    if (created.status !== 201) {
      return res.status(created.status).json(created.body);
    }
    try {
      const envelope = await sealRoutingEnvelope(route.replyPublicKey, {
        action: 'create',
        queueId: created.body.queueId,
        senderToken: created.body.senderToken,
        recipientToken: created.body.recipientToken,
        inviteToken: created.body.inviteToken,
        expiresAt: created.body.expiresAt,
      });
      return res.status(created.status).json({ ok: true, envelope });
    } catch {
      return res.status(400).json({ ok: false, reason: 'INVALID_REPLY_KEY' });
    }
  }

  if (typeof route.queueId !== 'string' || typeof route.token !== 'string') {
    return res.status(400).json({ ok: false, reason: 'INVALID_ENVELOPE' });
  }

  let result;
  switch (route.action) {
    case 'enqueue':
      if (!anonRateLimit(`route-enqueue:${route.queueId}`, 100, 60 * 1000)) {
        return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
      }
      result = anonEnqueue(route.queueId, route.token, route.packet, {
        signature: route.signature,
        signedAt: route.signedAt,
        commandNonce: route.commandNonce,
      }, route.pow, route.inviteToken);
      break;
    case 'poll':
      if (!anonRateLimit(`route-poll:${route.queueId}`, 100, 60 * 1000)) {
        return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
      }
      result = anonPoll(route.queueId, route.token, route.limit, {
        signature: route.signature,
        signedAt: route.signedAt,
        commandNonce: route.commandNonce,
      });
      break;
    case 'ack':
      if (!anonRateLimit(`route-ack:${route.queueId}`, 120, 60 * 1000)) {
        return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
      }
      result = anonAck(route.queueId, route.token, route.packetIds, {
        signature: route.signature,
        signedAt: route.signedAt,
        commandNonce: route.commandNonce,
      });
      break;
    default:
      return res.status(400).json({ ok: false, reason: 'UNKNOWN_ACTION' });
  }

  return res.status(result.status).json(result.body);
});


// ───────────────────────────────────────────────────────────────────────────
// Proxy hop (phase C): the proxy knows the caller's IP and an opaque relay id
// from a server-side allowlist. It forwards a sealed routing envelope it cannot
// decrypt, so it never sees queue IDs, bearer tokens, or packet contents.
// Configure with ANON_PROXY_TARGETS="relay1=https://r1.example,relay2=..."
// ───────────────────────────────────────────────────────────────────────────
const ANON_PROXY_TARGETS = new Map(
  (process.env.ANON_PROXY_TARGETS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf('=');
      return idx > 0 ? [entry.slice(0, idx).trim(), entry.slice(idx + 1).trim()] : null;
    })
    .filter(Boolean),
);
const ANON_PROXY_ENABLED = ANON_PROXY_TARGETS.size > 0;

function anonProxyTarget(rawId) {
  if (typeof rawId !== 'string') return null;
  return ANON_PROXY_TARGETS.get(rawId) || null;
}

async function anonForward(targetBase, pathSuffix, body) {
  const url = `${targetBase.replace(/\/+$/, '')}${pathSuffix}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  let result = null;
  try {
    result = await res.json();
  } catch {
    result = null;
  }
  return { status: res.status, body: result || { ok: false, reason: 'UPSTREAM_ERROR' } };
}

app.post('/api/anon/hop', async (req, res) => {
  if (!ANON_PROXY_ENABLED) {
    return res.status(503).json({ ok: false, reason: 'PROXY_NOT_CONFIGURED' });
  }
  if (!anonRateLimit(`hop:${anonClientKey(req)}`, 240, 60 * 1000)) {
    return res.status(429).json({ ok: false, reason: 'RATE_LIMITED' });
  }
  const target = anonProxyTarget(req.body?.relay);
  if (!target) return res.status(400).json({ ok: false, reason: 'UNKNOWN_RELAY' });
  const envelope = req.body?.envelope;
  if (!envelope || typeof envelope !== 'object') {
    return res.status(400).json({ ok: false, reason: 'INVALID_ENVELOPE' });
  }

  // The proxy cannot decrypt this envelope; only the destination relay can.
  try {
    const result = await anonForward(target, '/api/anon/route', { envelope });
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(502).json({ ok: false, reason: 'UPSTREAM_UNREACHABLE' });
  }
});


// ───────────────────────────────────────────────────────────────────────────
// Boot
// ───────────────────────────────────────────────────────────────────────────
const isMainModule =
  typeof process.argv[1] === 'string' &&
  process.argv[1].startsWith('/') &&
  path.resolve(process.argv[1]) === __filename;

app.listen(PORT, () => {
  console.log(`Mess&Anger server on :${PORT}`);
  console.log(`  landing  →  http://localhost:${PORT}/`);
  console.log(`  IPN      →  http://localhost:${PORT}/api/paymento/ipn  (HTTP POST)`);
  console.log(`  receipts →  ${RECEIPTS_DIR}`);
  console.log(`  reports  →  ${ANON_REPORTS_DIR} (${anonReportsLoaded} loaded)`);
});

export default app;
