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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env', override: true });

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
const PAYMENTO_SECRET = (PAYMENTO_SECRETS[0] || process.env.PAYMENTO_SECRET || process.env.PAYMENTO_SECRET_KEY || '').trim();
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
});

export default app;
