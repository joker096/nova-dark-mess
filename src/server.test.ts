/**
 * HTTP tests for the relay server (`server.js`) — the endpoints that had no
 * coverage at all during the 2026-11-18 audit (F4.1).
 *
 * The app is imported and bound to an ephemeral port instead of the configured
 * one, and every on-disk directory is redirected into a temp folder, so the
 * suite never touches the repository or a production port.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { generateQueueSigningKeyPair, signQueueCommand } from './lib/anon/signing';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-server-test-'));
process.env.RELAY_DIR = path.join(TMP_ROOT, 'relay');
process.env.RECEIPTS_DIR = path.join(TMP_ROOT, 'receipts');
process.env.ORDERS_DIR = path.join(TMP_ROOT, 'orders');
process.env.LICENSES_DIR = path.join(TMP_ROOT, 'licenses');
process.env.GIFTS_DIR = path.join(TMP_ROOT, 'gifts');
process.env.ANON_REPORTS_DIR = path.join(TMP_ROOT, 'anon-reports');
process.env.PAYMENTO_SECRET = '';
process.env.ADMIN_TOKEN = '';

let server: http.Server;
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

beforeAll(async () => {
  const { default: app } = await import('../server.js');
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
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
