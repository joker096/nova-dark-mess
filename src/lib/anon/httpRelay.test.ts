import { describe, it, expect } from 'vitest';
import {
  ackAnonQueue,
  createAnonQueue,
  deleteAnonQueue,
  enqueueAnonPacket,
  pollAnonQueue,
  relayRateLimitRemainingMs,
  resetRelayRateLimitForTests,
} from './httpRelay';
import { encodeFixedPacket, uint8ToBase64 } from './packet';

interface Captured {
  url: string;
  body: string;
}

function mockRelay(response: unknown = { ok: true }) {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? '') });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, config: { baseUrl: 'https://relay.example', fetchImpl } };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

describe('relay rate-limit cooldown', () => {
  it('remembers a 429 and reports the remaining cooldown', async () => {
    resetRelayRateLimitForTests();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, reason: 'RATE_LIMITED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const result = await pollAnonQueue(
      { baseUrl: 'https://relay.example', fetchImpl },
      'q_0123456789abcdef0123456789abcdef',
      'b'.repeat(43),
    );

    expect(result.packets).toEqual([]);
    expect(relayRateLimitRemainingMs()).toBeGreaterThan(0);
    resetRelayRateLimitForTests();
    expect(relayRateLimitRemainingMs()).toBe(0);
  });
});

describe('fixed-size relay command bodies', () => {
  it('pads queue creation, poll, ack and delete to control sizes', async () => {
    const { calls, config } = mockRelay({
      ok: true,
      queueId: 'q_0123456789abcdef0123456789abcdef',
      senderToken: 'a'.repeat(43),
      recipientToken: 'b'.repeat(43),
      inviteToken: 'c'.repeat(43),
      expiresAt: Date.now() + 60_000,
      packets: [],
    });

    await createAnonQueue(config);
    await pollAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', 'b'.repeat(43));
    await ackAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', 'b'.repeat(43), ['p_1']);
    await deleteAnonQueue(config, 'q_0123456789abcdef0123456789abcdef', 'b'.repeat(43));

    expect(calls.map((call) => byteLength(call.body))).toEqual([4096, 4096, 8192, 4096]);
    for (const call of calls) {
      const body = JSON.parse(call.body) as Record<string, unknown>;
      expect(typeof body.pad).toBe('string');
    }
  });

  it('pads enqueue bodies by packet profile', async () => {
    const packet = uint8ToBase64(encodeFixedPacket(new TextEncoder().encode('hello'), 'standard'));
    const { calls, config } = mockRelay({
      ok: true,
      packetId: 'p_1',
      expiresAt: Date.now() + 60_000,
    });

    await enqueueAnonPacket(config, 'q_0123456789abcdef0123456789abcdef', 'a'.repeat(43), packet);
    expect(byteLength(calls[0].body)).toBe(24576);
    const body = JSON.parse(calls[0].body) as Record<string, unknown>;
    expect(body.packet).toBe(packet);
    expect(typeof body.pad).toBe('string');
  });
});
