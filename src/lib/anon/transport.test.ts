import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAnonTransport } from './transport';
import { getRelayLatency, clearRelayLatency } from './relayLatency';
import { generateQueueSigningKeyPair } from './signing';

const RELAY = 'https://relay.example';

function mockJson(value: unknown): typeof fetch {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  return mock as unknown as typeof fetch;
}

beforeEach(() => {
  clearRelayLatency();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transport latency measurement', () => {
  it('records round-trip latency for every relay call', async () => {
    const created = {
      ok: true,
      queueId: 'q_00000000000000000000000000000001',
      senderToken: 'sender-token',
      recipientToken: 'recipient-token',
      inviteToken: 'invite-token',
      expiresAt: 1_800_000_000_000,
    };
    const fetchImpl = mockJson(created);
    const transport = createAnonTransport({ relayUrl: RELAY, fetchImpl, jitter: false });

    const queue = await transport.createQueue();
    expect(queue?.queueId).toBe(created.queueId);
    expect(getRelayLatency(RELAY)).toBeGreaterThanOrEqual(0);

    const signing = generateQueueSigningKeyPair();
    (fetchImpl as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, packetId: 'p_1', expiresAt: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const enqueued = await transport.enqueue(
      created.queueId,
      created.senderToken,
      'QUJD',
      signing.privateKey,
    );
    expect(enqueued?.packetId).toBe('p_1');
    expect(getRelayLatency(RELAY)).toBeGreaterThanOrEqual(0);

    (fetchImpl as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, packets: [], nextCursor: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const polled = await transport.poll(created.queueId, created.recipientToken, undefined, signing.privateKey);
    expect(polled.packets).toEqual([]);
    expect(getRelayLatency(RELAY)).toBeGreaterThanOrEqual(0);

    (fetchImpl as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    expect(await transport.ack(created.queueId, created.recipientToken, ['p_1'], signing.privateKey)).toBe(true);

    expect(getRelayLatency(RELAY)).toBeGreaterThanOrEqual(0);
  });

  it('exposes relay queue deletion through the mounted transport', async () => {
    const fetchImpl = mockJson({ ok: true });
    const transport = createAnonTransport({ relayUrl: RELAY, fetchImpl, jitter: false });
    const signing = generateQueueSigningKeyPair();

    await expect(
      transport.deleteQueue?.('q_00000000000000000000000000000001', 'recipient-token', signing.privateKey),
    ).resolves.toBe(true);
    expect(getRelayLatency(RELAY)).toBeGreaterThanOrEqual(0);
    expect((fetchImpl as any).mock.calls.at(-1)[0]).toBe(`${RELAY}/api/anon/queues/delete`);
  });
});
