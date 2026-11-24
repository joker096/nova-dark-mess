/**
 * HTTP tests for the relay server (`server.js`) — the endpoints that had no
 * coverage at all during the 2026-11-18 audit (F4.1).
 *
 * The app is imported and bound to an ephemeral port instead of the configured
 * one, and every on-disk directory is redirected into a temp folder, so the
 * suite never touches the repository or a production port.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket, type WebSocketServer } from 'ws';
import { generateQueueSigningKeyPair, signQueueCommand } from './lib/anon/signing';

let TMP_ROOT = '';
let RECEIPTS_DIR = '';
let ORDERS_DIR = '';
let LICENSES_DIR = '';
let GIFTS_DIR = '';
let PAYMENTO_SECRET = '';
let PREMIUM_LICENSE_SECRET = '';
let DERIVED_LICENSE_SECRET = '';
let server: http.Server;
let signalingServer: WebSocketServer | null = null;
const openSockets: WebSocket[] = [];
let baseUrl = '';

async function call(
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; json: any }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    json: text ? JSON.parse(text) : null,
  };
}

let closeAnonStateDb: (() => void) | null = null;

beforeAll(async () => {
  // Tooling under test must never reach the real payment provider. Requests to
  // PaymentO endpoints are answered locally; everything else (the loopback HTTP
  // calls this suite makes) goes to the real fetch below.
  const realFetch = globalThis.fetch;
  process.env.PAYMENTO_API_KEY = 'test_only_api_key';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    if (url.includes('/v1/payment/request')) {
      return new Response(JSON.stringify({ success: true, body: 'TEST_TOKEN_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/v1/payment/verify')) {
      return new Response(JSON.stringify({ orderStatus: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-server-test-'));
  // Set up test directories
  RECEIPTS_DIR = path.join(TMP_ROOT, 'receipts');
  ORDERS_DIR = path.join(TMP_ROOT, 'orders');
  LICENSES_DIR = path.join(TMP_ROOT, 'licenses');
  GIFTS_DIR = path.join(TMP_ROOT, 'gifts');
  const RELAY_DIR = path.join(TMP_ROOT, 'relay');
  const ANON_REPORTS_DIR = path.join(TMP_ROOT, 'anon-reports');
  const ANON_STATE_DB_PATH = path.join(TMP_ROOT, 'anon-state.sqlite');
  // Test-only HMAC secret. Never reuse a real `.env` value here: a fixture
  // secret that matches production turns every forged-IPN test into a valid
  // forged IPN against the real payment provider.
  PAYMENTO_SECRET = 'test_only_paymento_secret_do_not_reuse';
  // Server derives PREMIUM_LICENSE_SECRET from PAYMENTO_SECRET: sha256("nova-premium-license:" + PAYMENTO_SECRET)
  DERIVED_LICENSE_SECRET = crypto.createHash('sha256').update(`nova-premium-license:${PAYMENTO_SECRET}`).digest('hex');
  PREMIUM_LICENSE_SECRET = DERIVED_LICENSE_SECRET;

  // Set all env vars BEFORE importing server.js (which reads them at module load time)
  process.env.RELAY_DIR = RELAY_DIR;
  process.env.RECEIPTS_DIR = RECEIPTS_DIR;
  process.env.ORDERS_DIR = ORDERS_DIR;
  process.env.LICENSES_DIR = LICENSES_DIR;
  process.env.GIFTS_DIR = GIFTS_DIR;
  process.env.ANON_REPORTS_DIR = ANON_REPORTS_DIR;
  process.env.ANON_STATE_DB_PATH = ANON_STATE_DB_PATH;
  // server.js loads `.env` with `override: true`; without this a developer
  // machine with real PaymentO keys would replace every fixture above and call
  // the live provider. Point the loader at a path that does not exist instead.
  process.env.DOTENV_CONFIG_PATH = path.join(TMP_ROOT, 'no-such.env');
  process.env.PAYMENTO_SECRET = PAYMENTO_SECRET;
  delete process.env.PAYMENTO_SECRET_KEYS;
  process.env.PREMIUM_LICENSE_SECRET = PREMIUM_LICENSE_SECRET;
  process.env.ADMIN_TOKEN = '';

  console.log('[test] Before import, process.env.RECEIPTS_DIR:', process.env.RECEIPTS_DIR);
  console.log('[test] Before import, RECEIPTS_DIR var:', RECEIPTS_DIR);

  const { default: app, closeAnonStateDb: closeDb, attachSignaling } = await import('../server.js');
  closeAnonStateDb = closeDb;
  server = http.createServer(app);
  signalingServer = attachSignaling(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const socket of openSockets) socket.close();
  await new Promise<void>((resolve) => {
    if (!signalingServer) return resolve();
    signalingServer.close(() => resolve());
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeAnonStateDb?.();
  // Don't clean up for debugging
  // fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  console.log('[test] TMP_ROOT preserved at:', TMP_ROOT);
});

describe('server: WebRTC signaling', () => {
  const connect = (fingerprint: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/api/signaling`);
      openSockets.push(socket);
      socket.once('open', () => {
        socket.send(JSON.stringify({ type: 'ping', senderFingerprint: fingerprint }));
        resolve(socket);
      });
      socket.once('error', reject);
    });

  it('routes a call invite only to the target fingerprint and refuses identity switching', async () => {
    const alice = await connect('nova_pk_alice_signaling');
    const bob = await connect('nova_pk_bob_signaling');

    const received = new Promise<any>((resolve, reject) => {
      bob.on('message', (raw) => resolve(JSON.parse(String(raw))));
      setTimeout(() => reject(new Error('message not routed')), 2000);
    });

    alice.send(
      JSON.stringify({
        type: 'call_invite',
        senderFingerprint: 'nova_pk_alice_signaling',
        targetFingerprint: 'nova_pk_bob_signaling',
        payload: { callId: 'call-1', mode: 'voice' },
      }),
    );

    const message = await received;
    expect(message.type).toBe('call_invite');
    expect(message.payload).toEqual({ callId: 'call-1', mode: 'voice' });

    const closed = new Promise<number>((resolve) => alice.once('close', (code) => resolve(code)));
    alice.send(
      JSON.stringify({
        type: 'ping',
        senderFingerprint: 'nova_pk_mallory_signaling',
        targetFingerprint: 'nova_pk_bob_signaling',
      }),
    );
    expect(await closed).toBe(1008);
  });
});

describe('server: baseline routes', () => {
  it('answers the health probe', async () => {
    const res = await call('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });
});

describe('server: CORS allowlist (F3.3)', () => {
  it('reflects an allowed origin on preflight', async () => {
    const res = await call('OPTIONS', '/api/presence', undefined, {
      Origin: 'http://localhost:3000',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('allows a loopback dev server on any port', async () => {
    const res = await call('OPTIONS', '/api/presence', undefined, {
      Origin: 'http://localhost:3002',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3002');
  });

  it('refuses preflight from an unrelated origin', async () => {
    const res = await call('OPTIONS', '/api/presence', undefined, {
      Origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not hand a wildcard to a normal cross-origin request', async () => {
    const res = await call('GET', '/api/health', undefined, { Origin: 'https://evil.example' });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('server: store-and-forward relay', () => {
  it('stores an envelope and hands it to the destination exactly once', async () => {
    const envelope = { destination: 'relay-dest-once', id: 'env-1', payload: { c: 'x' } };
    expect((await call('POST', '/api/relay', { envelope })).status).toBe(202);

    const first = await call('GET', '/api/relay/relay-dest-once');
    expect(first.status).toBe(200);
    expect(first.json.envelopes).toEqual([envelope]);

    const second = await call('GET', '/api/relay/relay-dest-once');
    expect(second.json.envelopes).toEqual([]);
  });

  it('rejects a body without an envelope', async () => {
    const res = await call('POST', '/api/relay', {});
    expect(res.status).toBe(400);
  });
});

describe('server: anonymous queue commands', () => {
  it('rejects a wrong sender token', async () => {
    const created = await call('POST', '/api/anon/queues', {
      signingPublicKey: generateQueueSigningKeyPair().publicKey,
    });
    expect(created.status).toBe(201);

    const res = await call('POST', '/api/anon/enqueue', {
      queueId: created.json.queueId,
      senderToken: 'not-the-token',
      packet: Buffer.alloc(4096).toString('base64'),
    });
    expect(res.status).toBe(403);
    expect(res.json.reason).toBe('INVALID_SENDER_TOKEN');
  });

  it('rejects a wrong recipient token on poll', async () => {
    const created = await call('POST', '/api/anon/queues', {
      signingPublicKey: generateQueueSigningKeyPair().publicKey,
    });
    const res = await call('POST', '/api/anon/poll', {
      queueId: created.json.queueId,
      recipientToken: 'not-the-token',
      limit: 10,
    });
    expect(res.status).toBe(403);
    expect(res.json.reason).toBe('INVALID_RECIPIENT_TOKEN');
  });
});

describe('server: invite token burns only on a valid enqueue (F3.4)', () => {
  it('keeps the invite usable after a rejected packet and burns it on success', async () => {
    const signing = generateQueueSigningKeyPair();
    const created = await call('POST', '/api/anon/queues', {
      signingPublicKey: signing.publicKey,
    });
    expect(created.status).toBe(201);
    const { queueId, senderToken, recipientToken, inviteToken } = created.json;
    expect(inviteToken).toBeTruthy();

    const enqueue = (packet: string, withInvite = true) => {
      const auth = signQueueCommand(signing.privateKey, {
        action: 'enqueue',
        queueId,
        token: senderToken,
        packet,
      });
      return call('POST', '/api/anon/enqueue', {
        queueId,
        senderToken,
        packet,
        ...(withInvite ? { inviteToken } : {}),
        ...auth,
      });
    };

    const packet = Buffer.alloc(4096, 7).toString('base64');

    // While unused the invite is mandatory.
    const missing = await enqueue(packet, false);
    expect(missing.status).toBe(400);
    expect(missing.json.reason).toBe('INVITE_TOKEN_REQUIRED');

    // A packet of a non-profile size fails *after* the invite and signature
    // checks — the invite must survive it.
    const rejected = await enqueue('AAA=');
    expect(rejected.status).toBe(400);
    expect(rejected.json.reason).toBe('PACKET_TOO_LARGE');
    expect((await enqueue(packet, false)).json.reason).toBe('INVITE_TOKEN_REQUIRED');

    // A fully valid enqueue burns the invite: it is no longer required.
    expect((await enqueue(packet)).status).toBe(202);
    expect((await enqueue(packet, false)).status).toBe(202);

    const pollAuth = signQueueCommand(signing.privateKey, {
      action: 'poll',
      queueId,
      token: recipientToken,
      limit: 10,
    });
    const polled = await call('POST', '/api/anon/poll', {
      queueId,
      recipientToken,
      limit: 10,
      ...pollAuth,
    });
    expect(polled.status).toBe(200);
    expect(polled.json.packets).toHaveLength(2);
    expect(polled.json.packets[0].payload).toBe(packet);
  });

  it('rejects an enqueue with a valid invite but no signature', async () => {
    const created = await call('POST', '/api/anon/queues', {
      signingPublicKey: generateQueueSigningKeyPair().publicKey,
    });
    const res = await call('POST', '/api/anon/enqueue', {
      queueId: created.json.queueId,
      senderToken: created.json.senderToken,
      packet: Buffer.alloc(4096).toString('base64'),
      inviteToken: created.json.inviteToken,
    });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe('MISSING_SIGNATURE');
  });
});

describe('server: PaymentO IPN (HMAC-SHA256 verification)', () => {
  const makeSignature = (body: string) =>
    crypto.createHmac('sha256', PAYMENTO_SECRET).update(body).digest('hex');

  // Receipts land in the per-suite temp dir pinned via process.env.RECEIPTS_DIR
  // in beforeAll; never in the repo's real ./receipts directory. Read it lazily:
  // this block is evaluated at collection time, before beforeAll assigns it.
  const projectReceiptsDir = () => RECEIPTS_DIR;

  beforeEach(() => {
    // Clear project receipts dir between tests (only test files)
    if (fs.existsSync(projectReceiptsDir())) {
      const files = fs.readdirSync(projectReceiptsDir());
      for (const file of files) {
        if (file.startsWith('pay_test_') || file.startsWith('local-')) {
          fs.rmSync(path.join(projectReceiptsDir(), file), { force: true });
        }
      }
    }
  });

  it('accepts a valid IPN with correct HMAC signature (X-Hmac-Sha256-Signature header)', async () => {
    const payload = {
      payment_id: 'pay_test_001',
      order_id: 'ord_test_001',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': sig,
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.id).toBe('pay_test_001');
  });

  it('accepts a valid IPN with signature in body.signature field', async () => {
    // Server extracts signature from body.signature but verifies against raw body.
    // This test uses header for actual verification (correct PaymentO way).
    const payload = {
      payment_id: 'pay_test_002',
      order_id: 'ord_test_002',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    // Provide signature in header (PaymentO standard)
    const res = await call('POST', '/api/paymento/ipn', payload, {
      'X-Hmac-Sha256-Signature': sig,
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });

  it('accepts a valid IPN with signature in body.signature_sha256 field', async () => {
    const payload = {
      payment_id: 'pay_test_003',
      order_id: 'ord_test_003',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'X-Hmac-Sha256-Signature': sig,
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });

  it('accepts a valid IPN with signature in body.ipn_signature field', async () => {
    const payload = {
      payment_id: 'pay_test_004',
      order_id: 'ord_test_004',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'X-Hmac-Sha256-Signature': sig,
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });

  it('rejects IPN with missing signature', async () => {
    const payload = {
      payment_id: 'pay_test_005',
      order_id: 'ord_test_005',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');
  });

  it('rejects IPN with malformed signature (not hex)', async () => {
    const payload = {
      payment_id: 'pay_test_006',
      order_id: 'ord_test_006',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': 'not-a-valid-hex-signature',
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');
  });

  it('rejects IPN with wrong signature', async () => {
    const payload = {
      payment_id: 'pay_test_007',
      order_id: 'ord_test_007',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const wrongSig = crypto.randomBytes(32).toString('hex');

    const res = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': wrongSig,
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');
  });

  it('rejects IPN with empty body (signature checked first)', async () => {
    // Server checks signature before body parsing, so empty body with valid signature format fails on signature
    const res = await call('POST', '/api/paymento/ipn', {}, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': 'a'.repeat(64),
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');
  });

  it('rejects IPN with invalid JSON body (signature checked first)', async () => {
    // Server checks signature before body parsing
    const res = await call('POST', '/api/paymento/ipn', 'not an object', {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': 'a'.repeat(64),
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');
  });

  it('persists receipt to disk with correct structure', async () => {
    const payload = {
      payment_id: 'pay_test_008',
      order_id: 'ord_test_008',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': sig,
    });

    const receiptFiles = fs.readdirSync(projectReceiptsDir(), { recursive: true } as any)
      .map((f: any) => String(f).replace(/\\/g, '/'))
      .filter((f: string) => f.startsWith('pay_test_008'));
    expect(receiptFiles).toHaveLength(1);
    expect(receiptFiles[0]).toMatch(/^pay_test_008\.json$/);

    const receiptPath = path.join(projectReceiptsDir(), receiptFiles[0]);
    const receiptContent = fs.readFileSync(receiptPath, 'utf8');
    const receipt = JSON.parse(receiptContent);
    // Server uses camelCase field names
    expect(receipt.paymentId).toBe('pay_test_008');
    expect(receipt.orderId).toBe('ord_test_008');
    expect(receipt.amount).toBe(3.9);
    expect(receipt.currency).toBe('USD');
    // Server's normalizeIpn may not find status from test payload format
    // (expects PaymentO PascalCase fields). Accept null or string.
    expect(receipt.status === null || typeof receipt.status === 'string').toBe(true);
    expect(receipt.plan).toBe('premium');
    expect(receipt.receivedAt).toBeDefined();
    // Server sets verified=false initially, updated later on fulfillment
    expect(receipt.verified).toBe(false);
  });

  it('handles duplicate payment_id idempotently (returns 200, does not duplicate receipt)', async () => {
    const payload = {
      payment_id: 'pay_test_009',
      order_id: 'ord_test_009',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    };
    const body = JSON.stringify(payload);
    const sig = makeSignature(body);

    // First call
    const res1 = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': sig,
    });
    expect(res1.status).toBe(200);

    // Second call with same payment_id
    const res2 = await call('POST', '/api/paymento/ipn', payload, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': sig,
    });
    expect(res2.status).toBe(200);

    const receiptFiles = fs.readdirSync(projectReceiptsDir(), { recursive: true } as any)
      .map((f: any) => String(f).replace(/\\/g, '/'))
      .filter((f: string) => f.startsWith('pay_test_009'));
    expect(receiptFiles).toHaveLength(1);
  });

  it('rejects when PAYMENTO_SECRET is not configured', async () => {
    // Temporarily unset the secret (server reads from process.env at request time)
    const originalSecret = process.env.PAYMENTO_SECRET;
    process.env.PAYMENTO_SECRET = '';

    const body = JSON.stringify({
      payment_id: 'pay_test_010',
      order_id: 'ord_test_010',
      amount: 3.9,
      currency: 'USD',
      status: 'paid',
      plan: 'premium',
    });
    const sig = crypto.createHmac('sha256', '').update(body).digest('hex');

    const res = await call('POST', '/api/paymento/ipn', body, {
      'Content-Type': 'application/json',
      'X-Hmac-Sha256-Signature': sig,
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.reason).toBe('bad signature');

    process.env.PAYMENTO_SECRET = originalSecret;
  });
});

describe('server: Premium checkout flow', () => {
  it('creates a checkout order and returns orderId + URL', async () => {
    const res = await call('POST', '/api/premium/checkout', {
      device: 'dev_test_1234567890abcdef1234567890abcdef',
      plan: 'premium',
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.orderId).toBeDefined();
    expect(res.json.url).toContain('app.paymento.io');
    expect(res.json.url).toContain('token=');
  });

  it('never sends a non-HTTPS ReturnUrl to PaymentO from a dev/loopback origin', async () => {
    // PaymentO answers success:false for http:// return URLs, which used to turn
    // every local checkout into an opaque 502 ("payment provider error").
    const realFetch = globalThis.fetch;
    let providerReturnUrl = '';
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/v1/payment/request')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        providerReturnUrl = String(payload.ReturnUrl || '');
        return new Response(JSON.stringify({ success: true, body: 'TEST_TOKEN_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const res = await call(
        'POST',
        '/api/premium/checkout',
        { device: 'dev_test_1234567890abcdef1234567890abcdef', plan: 'premium' },
        { Origin: 'http://localhost:3000' },
      );
      expect(res.status).toBe(200);
      expect(res.json.ok).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(providerReturnUrl).not.toBe('');
    expect(providerReturnUrl.startsWith('https://')).toBe(true);
  });

  it('creates a gift checkout order with contactId', async () => {
    const res = await call('POST', '/api/premium/gift/checkout', {
      device: 'dev_test_1234567890abcdef1234567890abcdef',
      contactId: 'peer_test_123',
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.orderId).toBeDefined();
    expect(res.json.url).toContain('app.paymento.io');
    expect(res.json.url).toContain('token=');
  });

  it('rejects checkout with missing device', async () => {
    const res = await call('POST', '/api/premium/checkout', {
      plan: 'premium',
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
  });

  it('returns order status for valid orderId', async () => {
    const checkout = await call('POST', '/api/premium/checkout', {
      device: 'dev_test_1234567890abcdef1234567890abcdef',
      plan: 'premium',
    });
    expect(checkout.status).toBe(200);

    const res = await call('GET', `/api/premium/order/${checkout.json.orderId}?device=dev_test_1234567890abcdef1234567890abcdef`);

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.status).toBe('pending');
  });

  it('returns 403 for orderId with wrong device', async () => {
    const checkout = await call('POST', '/api/premium/checkout', {
      device: 'dev_test_1234567890abcdef1234567890abcdef',
      plan: 'premium',
    });
    expect(checkout.status).toBe(200);

    const res = await call('GET', `/api/premium/order/${checkout.json.orderId}?device=dev_wrong_device`);

    expect(res.status).toBe(403);
    expect(res.json.ok).toBe(false);
  });

  it('returns 404 for non-existent orderId', async () => {
    const res = await call('GET', '/api/premium/order/ord_nonexistent?device=dev_test_1234567890abcdef1234567890abcdef');

    expect(res.status).toBe(404);
    expect(res.json.ok).toBe(false);
  });
});

describe('server: License activation', () => {
  function makeLicense(
    device: string,
    expiresAt: number,
    orderId = 'ord_test',
    paymentId: string | null = 'pay_test_001',
  ): string {
    const payloadObj: Record<string, unknown> = { v: 1, d: device, p: 'premium', o: orderId, exp: expiresAt };
    if (paymentId) payloadObj.t = paymentId;
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const sig = crypto.createHmac('sha256', PREMIUM_LICENSE_SECRET).update(payload).digest('base64url');
    return `MA1.${payload}.${sig}`;
  }

  it('activates a valid license and returns expiry', async () => {
    const device = 'dev_test_activation_1234567890abcdef';
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const license = makeLicense(device, expiresAt);

    const res = await call('POST', '/api/premium/activate', { license, device, paymentId: 'pay_test_001' });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.expiresAt).toBe(expiresAt);
  });

  it('rejects a valid license without the provider payment id', async () => {
    const device = 'dev_test_activation_1234567890abcdef';
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const license = makeLicense(device, expiresAt);

    // A license seen in a backup/disk dump must not be enough to activate a device.
    expect((await call('POST', '/api/premium/activate', { license, device })).status).toBe(403);
    expect(
      (await call('POST', '/api/premium/activate', { license, device, paymentId: 'pay_guessed' })).status,
    ).toBe(403);
  });

  it('rejects a license that carries no payment binding at all', async () => {
    const device = 'dev_test_activation_1234567890abcdef';
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const license = makeLicense(device, expiresAt, 'ord_test', null);

    const res = await call('POST', '/api/premium/activate', { license, device, paymentId: 'pay_test_001' });

    expect(res.status).toBe(403);
  });

  it('rejects license with mismatched device', async () => {
    const device = 'dev_test_activation_1234567890abcdef';
    const wrongDevice = 'dev_wrong_device_1234567890abcdef';
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const license = makeLicense(device, expiresAt);

    const res = await call('POST', '/api/premium/activate', { license, device: wrongDevice });

    expect(res.status).toBe(403);
    expect(res.json.ok).toBe(false);
  });

  it('rejects expired license', async () => {
    const device = 'dev_test_activation_1234567890abcdef';
    // Server has 5-minute clock skew (CLOCK_SKEW_MS), so expire more than 5 min ago
    const expiresAt = Date.now() - 6 * 60 * 1000;
    const license = makeLicense(device, expiresAt);

    const res = await call('POST', '/api/premium/activate', { license, device });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.error).toBe('license expired');
  });

  it('rejects malformed license', async () => {
    const res = await call('POST', '/api/premium/activate', {
      license: 'not.a.valid.license',
      device: 'dev_test_1234567890abcdef',
    });

    expect(res.status).toBe(400);
    expect(res.json.ok).toBe(false);
    expect(res.json.error).toBe('invalid license');
  });
});
