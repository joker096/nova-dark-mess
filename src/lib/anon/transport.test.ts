import { describe, expect, it } from 'vitest';
import { createAnonTransport } from './transport';

describe('anonymous transport factory', () => {
  it('exposes queue creation while retaining the transport interface', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const transport = createAnonTransport({
      relayUrl: 'https://relay.example',
      jitter: false,
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            ok: true,
            queueId: 'q_00000000000000000000000000000000',
            senderToken: 'sender-token',
            recipientToken: 'recipient-token',
            inviteToken: 'invite-token',
            expiresAt: Date.now() + 60_000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const queue = await transport.createQueue();
    expect(queue?.queueId).toBe('q_00000000000000000000000000000000');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://relay.example/api/anon/queues');
    expect(requests[0].body.signingPublicKey).toBeTruthy();
  });
});
