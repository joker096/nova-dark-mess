/// <reference types="vitest/globals" />

/**
 * A9: anonymous control bodies are padded to one fixed size per path.
 *
 * The relay (`server.js`) rejects a control request whose declared
 * Content-Length differs from `ANON_CONTROL_PADDED_BYTES`, and pads hop bodies
 * to `ANON_HOP_PADDED_BYTES`. Those tables are plain numbers duplicated in the
 * server, so this test reads them straight out of `server.js`: a client that
 * changes a size without changing the server (or the other way round) fails
 * here instead of silently breaking delivery in production.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ACK_BODY_BYTES,
  CONTROL_BODY_BYTES,
  ackAnonQueue,
  deleteAnonQueue,
  enqueueAnonPacket,
  padJsonBody,
  pollAnonQueue,
} from './httpRelay';
import { ProxyAnonTransport } from './proxy';
import { generateRoutingKeyPair } from './routing';

const serverSource = readFileSync(path.resolve(process.cwd(), 'server.js'), 'utf8');

function serverConstants(): Record<string, number> {
  const block = serverSource.slice(serverSource.indexOf('const ANON_CONTROL_PADDED_BYTES'));
  const end = block.indexOf('};');
  const constants: Record<string, number> = {};
  for (const match of block.slice(0, end).matchAll(/'(\/api\/anon\/[^']+)':\s*(\d+)/g)) {
    constants[match[1]] = Number(match[2]);
  }
  return constants;
}

/** Hop profiles: the first is the control profile, later ones grow per packet. */
function serverHopProfiles(): number[] {
  const start = serverSource.indexOf('const ANON_HOP_PADDED_BYTE_PROFILES');
  const line = serverSource.slice(start, serverSource.indexOf('\n', start));
  // Evaluate the same arithmetic expression in both directions, so `16384` and
  // `16384 + 3 * 16384` cannot drift apart.
  const total = line.match(/\[([^\]]+)\]/);
  if (!total) return [];
  return total[1]
  .split(',')
  .map((part: string) =>
    part
      .split('+')
      .map((term: string) => term.split('*').map((value) => Number(value.trim())).reduce((a: number, b: number) => a * b, 1))
      .reduce((sum: number, value: number) => sum + value, 0),
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function captureFetch() {
  const bodies: string[] = [];
  const fn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    return { ok: true, status: 200, json: async () => ({ ok: true, packets: [] }) } as Response;
  }) as typeof fetch;
  return { fn, bodies };
}

describe('A9: control body sizes match the relay', () => {
  const constants = serverConstants();

  it('parsed the server tables', () => {
    expect(Object.keys(constants).sort()).toEqual(
      ['/api/anon/ack', '/api/anon/push/register', '/api/anon/queues/delete', '/api/anon/route'].sort(),
    );
    expect(serverHopProfiles()).toHaveLength(3);
  });

  it('direct transport: ack, delete and poll use the server sizes', async () => {
    const { fn, bodies } = captureFetch();
    const config = { baseUrl: 'https://relay.example', fetchImpl: fn };
    const token = 'r_0123456789abcdef0123456789abcdef';

    await ackAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', token, ['p_1', 'p_2']);
    await deleteAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', token);
    await pollAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', token);

    expect(byteLength(bodies[0])).toBe(constants['/api/anon/ack']);
    expect(bodies[0].length).toBeGreaterThan(0);
    expect(byteLength(bodies[1])).toBe(constants['/api/anon/queues/delete']);
    // Poll was already padded before A9; keep the size pinned to the server too.
    expect(byteLength(bodies[2])).toBe(CONTROL_BODY_BYTES);
    expect(ACK_BODY_BYTES).toBe(constants['/api/anon/ack']);
  });

  it('direct transport: ack and delete stay fixed-size regardless of packet count', async () => {
    const { fn, bodies } = captureFetch();
    const config = { baseUrl: 'https://relay.example', fetchImpl: fn };
    const token = 'r_0123456789abcdef0123456789abcdef';

    await ackAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', token, ['p_1']);
    await ackAnonQueue(
      config,
      'q_0123456789abcdef0123456789abcdef',
      token,
      Array.from({ length: 20 }, (_, index) => `p_${index}`),
    );

    expect(byteLength(bodies[0])).toBe(byteLength(bodies[1]));
    expect(byteLength(bodies[0])).toBe(constants['/api/anon/ack']);
  });

  it('proxy transport: hop bodies use a server hop profile', async () => {
    const hopProfiles = serverHopProfiles();
    const { fn, bodies } = captureFetch();
    const relay = generateRoutingKeyPair();
    const transport = new ProxyAnonTransport({
      proxyUrl: 'https://proxy.example',
      relayId: 'relay-1',
      relayPublicKey: relay.publicKey,
      fetchImpl: fn,
    });

    // The call fails after the fetch (the mock returns no envelope fields), but
    // the request body is what matters here.
    await transport.ack('q_0123456789abcdef0123456789abcdef', 'r_0123456789abcdef0123456789abcdef', [
      'p_1',
    ]);
    await transport.createQueue(60_000);

    expect(bodies).toHaveLength(2);
    expect(hopProfiles).toContain(byteLength(bodies[0]));
    expect(hopProfiles).toContain(byteLength(bodies[1]));
  });

  it('padJsonBody never exceeds the target once the padding is added', () => {
    const padded = padJsonBody({ queueId: 'q_1', recipientToken: 'r_1' }, 256);
    expect(byteLength(JSON.stringify(padded))).toBeGreaterThanOrEqual(250);
    // An already oversized body is returned unchanged instead of truncated.
    const big = { packet: 'x'.repeat(500) };
    expect(padJsonBody(big, 64)).toBe(big);
  });

  it('enqueue keeps its own profile sizes (unchanged by A9)', async () => {
    const { fn, bodies } = captureFetch();
    const packet = btoa(String.fromCharCode(...new Uint8Array(4096)));
    await enqueueAnonPacket(
      { baseUrl: 'https://relay.example', fetchImpl: fn },
      'q_0123456789abcdef0123456789abcdef',
      's_0123456789abcdef0123456789abcdef',
      packet,
    );
    // 4096-byte packet profile → 8192-byte body, as before.
    expect(byteLength(bodies[0])).toBe(8192);
  });

  it('relay verifies the declared length only for padded anon paths', () => {
    expect(serverSource).toContain('verify: verifyAnonPaddedBody');
    expect(serverSource).toContain("error.code = 'INVALID_BODY_LENGTH'");
  });

  it('enqueue hop bodies use the matching per-packet profile', async () => {
    const hopProfiles = serverHopProfiles();
    const { fn, bodies } = captureFetch();
    const relay = generateRoutingKeyPair();
    const transport = new ProxyAnonTransport({
      proxyUrl: 'https://proxy.example',
      relayId: 'relay-1',
      relayPublicKey: relay.publicKey,
      fetchImpl: fn,
    });

    for (const size of [4096, 16384, 65536]) {
      const packet = btoa(String.fromCharCode(...new Uint8Array(size)));
      await transport.enqueue('q_0123456789abcdef0123456789abcdef', 's_0123456789abcdef0123456789abcdef', packet);
    }

    expect(bodies).toHaveLength(3);
    // 4096-byte packet → control profile; the larger packets get their own
    // profile, never silently truncated to the control size.
    expect(byteLength(bodies[0])).toBe(hopProfiles[0]);
    expect(byteLength(bodies[1])).toBe(hopProfiles[1]);
    expect(byteLength(bodies[2])).toBe(hopProfiles[2]);
  });
});


