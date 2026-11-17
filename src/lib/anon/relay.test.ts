import { describe, it, expect } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { encodeFixedPacket } from './packet';
import { createPowChallenge, solvePow } from './spam';

describe('anon relay', () => {
  it('creates a queue with separate sender and recipient tokens', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingPublicKey } = relay.createQueue();
    expect(queueId.startsWith('q_')).toBe(true);
    expect(tokens.senderToken).not.toBe(tokens.recipientToken);
    expect(signingPublicKey).toBeTruthy();
  });

  it('enqueues and polls a fixed-size packet', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const packet = encodeFixedPacket(new TextEncoder().encode('secret'), 'standard');
    const b64 = btoa(String.fromCharCode(...packet));
    const enqueued = relay.enqueue(queueId, tokens.senderToken, b64, signingKey, undefined, inviteToken);
    expect(enqueued.packetId).toBeTruthy();

    const polled = relay.poll(queueId, tokens.recipientToken, 32, signingKey);
    expect(polled.packets).toHaveLength(1);
    expect(polled.packets[0].payload).toBe(b64);
  });

  it('rejects invalid sender token', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId } = relay.createQueue();
    const b64 = btoa('x');
    expect(() => relay.enqueue(queueId, 'bad-token', b64)).toThrow();
  });

  it('rejects invalid recipient token on poll', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId } = relay.createQueue();
    expect(() => relay.poll(queueId, 'bad-token')).toThrow();
  });

  it('removes packets after ack', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const b64 = btoa('x');
    const { packetId } = relay.enqueue(queueId, tokens.senderToken, b64, signingKey, undefined, inviteToken);
    relay.ack(queueId, tokens.recipientToken, [packetId], signingKey);
    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(0);
  });

  it('deletes a queue with recipient token', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey } = relay.createQueue();
    relay.deleteQueue(queueId, tokens.recipientToken, signingKey);
    expect(() => relay.poll(queueId, tokens.recipientToken, 32, signingKey)).toThrow();
  });

  it('rejects a command signed with the wrong key', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, inviteToken } = relay.createQueue();
    const other = relay.createQueue();
    expect(() =>
      relay.enqueue(queueId, tokens.senderToken, btoa('x'), other.signingKey, undefined, inviteToken),
    ).toThrow('Invalid command signature');
  });

  it('rejects an unsigned command on a signed queue', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, inviteToken } = relay.createQueue();
    expect(() =>
      relay.enqueue(queueId, tokens.senderToken, btoa('x'), undefined, undefined, inviteToken),
    ).toThrow('Missing command signature');
  });

  it('requires the one-time invite token on the first enqueue and burns it', () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const other = relay.createQueue();
    const packet = btoa('x');
    expect(() => relay.enqueue(queueId, tokens.senderToken, packet, signingKey)).toThrow(
      'Invite token required',
    );
    // A structurally valid token that belongs to another queue is rejected.
    expect(() =>
      relay.enqueue(queueId, tokens.senderToken, packet, signingKey, undefined, other.inviteToken),
    ).toThrow('Invalid invite token');
    const first = relay.enqueue(queueId, tokens.senderToken, packet, signingKey, undefined, inviteToken);
    expect(first.packetId).toBeTruthy();
    // After the first use the token is burned; the invite cannot start a second contact.
    const second = relay.enqueue(queueId, tokens.senderToken, packet, signingKey, undefined, inviteToken);
    expect(second.packetId).toBeTruthy();
  });

  it('requires proof of work once when the queue has a challenge', async () => {
    const relay = new InMemoryAnonRelay();
    const pow = createPowChallenge(8);
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue(undefined, pow);
    const packet = btoa('x');
    expect(() =>
      relay.enqueue(queueId, tokens.senderToken, packet, signingKey, undefined, inviteToken),
    ).toThrow('Invalid proof of work');

    const solution = await solvePow(pow);
    const first = relay.enqueue(queueId, tokens.senderToken, packet, signingKey, solution, inviteToken);
    expect(first.packetId).toBeTruthy();

    const second = relay.enqueue(queueId, tokens.senderToken, packet, signingKey, solution);
    expect(second.packetId).toBeTruthy();
  });

  it('rejects an invalid proof of work', () => {
    const relay = new InMemoryAnonRelay();
    const pow = createPowChallenge(8);
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue(undefined, pow);
    expect(() =>
      relay.enqueue(
        queueId,
        tokens.senderToken,
        btoa('x'),
        signingKey,
        {
          nonce: 0,
          digest: 'A'.repeat(43),
        },
        inviteToken,
      ),
    ).toThrow('Invalid proof of work');
  });
});
