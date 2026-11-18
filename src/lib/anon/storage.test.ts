import { afterEach, describe, it, expect, vi } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { generateQueueSigningKeyPair, signQueueCommand, verifyQueueCommand } from './signing';

/**
 * Phase J storage audit: the relay may keep ciphertext and routing metadata
 * only. These tests pin the stored packet shape, TTL/ACK deletion, queue
 * expiry, and the timestamp/nonce binding of signed commands.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('anon relay storage audit', () => {
  it('stores only ciphertext and routing metadata, never tokens or keys', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, signingPublicKey, inviteToken } = relay.createQueue();
    const ciphertext = btoa('opaque-ciphertext');
    relay.enqueue(queueId, tokens.senderToken, ciphertext, signingKey, undefined, inviteToken);

    const { packets } = relay.poll(queueId, tokens.recipientToken, 32, signingKey);
    expect(packets).toHaveLength(1);
    expect(Object.keys(packets[0]).sort()).toEqual(
      ['createdAt', 'packetId', 'payload', 'queueId', 'ttlMs', 'version'].sort(),
    );
    expect(packets[0].payload).toBe(ciphertext);

    const stored = JSON.stringify(packets[0]);
    expect(stored).not.toContain(tokens.senderToken);
    expect(stored).not.toContain(tokens.recipientToken);
    expect(stored).not.toContain(signingKey);
    expect(stored).not.toContain(signingPublicKey);
    expect(stored).not.toContain(inviteToken);
  });

  it('drops packets once their TTL elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    relay.enqueue(queueId, tokens.senderToken, btoa('x'), signingKey, undefined, inviteToken, 1_000);

    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(1);
    vi.advanceTimersByTime(1_001);
    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(0);

    relay.cleanup();
    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(0);
  });

  it('deletes ciphertext on ACK and ignores unknown packet ids', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const { packetId } = relay.enqueue(
      queueId,
      tokens.senderToken,
      btoa('x'),
      signingKey,
      undefined,
      inviteToken,
    );

    expect(relay.ack(queueId, tokens.recipientToken, [packetId, 'p_missing'], signingKey)).toBe(true);
    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(0);
  });

  it('expires the whole queue and forgets its packets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue(1_000);
    relay.enqueue(queueId, tokens.senderToken, btoa('x'), signingKey, undefined, inviteToken);

    vi.advanceTimersByTime(1_001);
    expect(() => relay.enqueue(queueId, tokens.senderToken, btoa('y'), signingKey)).toThrow(
      'Queue expired',
    );

    relay.cleanup();
    expect(() => relay.poll(queueId, tokens.recipientToken, 32, signingKey)).toThrow('Queue not found');
  });

  it('binds the command timestamp and nonce into the signature', () => {
    const { publicKey, privateKey } = generateQueueSigningKeyPair();
    const auth = signQueueCommand(privateKey, {
      action: 'ack',
      queueId: 'q_storage',
      token: 'tok_storage',
      packetIds: ['p_1'],
    });
    const base = {
      action: 'ack' as const,
      queueId: 'q_storage',
      token: 'tok_storage',
      packetIds: ['p_1'],
      signedAt: auth.signedAt,
      commandNonce: auth.commandNonce,
    };

    expect(verifyQueueCommand(publicKey, base, auth.signature)).toBe(true);
    expect(verifyQueueCommand(publicKey, { ...base, signedAt: auth.signedAt - 1 }, auth.signature)).toBe(
      false,
    );
    expect(
      verifyQueueCommand(publicKey, { ...base, commandNonce: `${auth.commandNonce}x` }, auth.signature),
    ).toBe(false);
    expect(
      verifyQueueCommand(
        publicKey,
        { ...base, queueId: 'q_other' },
        auth.signature,
      ),
    ).toBe(false);
  });
});
