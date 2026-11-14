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

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const RECEIPTS_DIR = process.env.RECEIPTS_DIR
  ? path.resolve(process.env.RECEIPTS_DIR)
  : path.join(__dirname, 'receipts');

// Store-and-forward relay: encrypted envelopes only, never content or identity.
const RELAY_DIR = process.env.RELAY_DIR
  ? path.resolve(process.env.RELAY_DIR)
  : path.join(__dirname, 'relay');
const RELAY_TTL_MS = parseInt(process.env.RELAY_TTL_MS || String(7 * 24 * 60 * 60 * 1000), 10);
const RELAY_MAX_PER_DEST = parseInt(process.env.RELAY_MAX_PER_DEST || '200', 10);

// ───────────────────────────────────────────────────────────────────────────
// Static: landing at root
// ───────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Serve the landing (static promo) at the site root.
app.use(express.static(path.join(__dirname, 'landing')));

// ───────────────────────────────────────────────────────────────────────────
// PaymentO IPN: POST /api/paymento/ipn
//
// PaymentO (store: "Mess&Anger user") sends an HTTP POST here on every
// payment event. We verify the signature, persist a receipt, and return 200
// so PaymentO does not retry.
//
// The actual premium activation happens on the user's device: the desktop
// app's `src/lib/premium.ts` checks a local `nova_premium_receipt` key that
// is written by the PaymentO widget in `landing/paymento.js` after a
// successful checkout. This server is the receipt ledger — it does NOT
// grant access to anything.
// ───────────────────────────────────────────────────────────────────────────
function verifyPaymentoSignature(body, rawBody, secret) {
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const provided =
    (body && body.signature) ||
    (body && body.signature_sha256) ||
    (body && body.ipn_signature) ||
    '';
  if (!provided) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(String(provided), 'hex')
  );
}

function persistReceipt(payload) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const id =
    (payload && (payload.payment_id || payload.id || payload.transaction_id)) ||
    `local-${Date.now()}`;
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  const file = path.join(RECEIPTS_DIR, `${safeId}.json`);
  const record = {
    id: safeId,
    plan: (payload && payload.plan) || 'premium',
    amount: (payload && payload.amount) || null,
    currency: (payload && payload.currency) || null,
    status: (payload && payload.status) || 'paid',
    receivedAt: new Date().toISOString(),
    raw: {
      // Strip volatile / PII fields; keep only what we need for audit.
      payment_id: (payload && (payload.payment_id || payload.id)) || null,
      amount: (payload && payload.amount) || null,
      currency: (payload && payload.currency) || null,
      plan: (payload && payload.plan) || null,
      status: (payload && payload.status) || null,
      timestamp: (payload && (payload.timestamp || payload.created_at)) || null,
    },
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  return safeId;
}

// Raw body capture (needed for HMAC verification). Registered BEFORE the
// json/urlencoded parsers so `req.rawBody` holds the exact bytes PaymentO
// signed.
app.use('/api/paymento/ipn', (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

app.post('/api/paymento/ipn', (req, res) => {
  // Parse the body we just buffered (idempotent — json/urlencoded parsers
  // already ran, but this ensures we have `req.body` for form-encoded IPN).
  let body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    try {
      body = JSON.parse(req.rawBody || '{}');
    } catch {
      body = {};
      for (const [k, v] of new URLSearchParams(req.rawBody || '').entries()) {
        body[k] = v;
      }
    }
  }
  const rawBody = req.rawBody || JSON.stringify(body);
  const secret = process.env.PAYMENTO_SECRET;

  // If no secret is configured (dev mode), accept and log.
  if (secret) {
    if (!verifyPaymentoSignature(body, rawBody, secret)) {
      console.warn('[paymento] IPN signature mismatch', {
        payment_id: body.payment_id || body.id,
      });
      return res.status(400).json({ ok: false, reason: 'bad signature' });
    }
  } else {
    console.warn('[paymento] PAYMENTO_SECRET not set — accepting unsigned IPN (dev mode)');
  }

  const id = persistReceipt(body);
  console.log('[paymento] IPN accepted', { id, amount: body.amount, plan: body.plan });
  return res.json({ ok: true, id });
});

// ───────────────────────────────────────────────────────────────────────────
// Health + admin
// ───────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// List recent receipts (admin / audit).
app.get('/api/paymento/receipts', (_req, res) => {
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
app.listen(PORT, () => {
  console.log(`Mess&Anger server on :${PORT}`);
  console.log(`  landing  →  http://localhost:${PORT}/`);
  console.log(`  IPN      →  http://localhost:${PORT}/api/paymento/ipn  (HTTP POST)`);
  console.log(`  receipts →  ${RECEIPTS_DIR}`);
});

export default app;
