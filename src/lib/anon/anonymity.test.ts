import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { InMemoryAnonRelay } from './relay';
import { sendGroupMessage } from './groups';
import { receiveAnonMessages } from './session';
import { createPowChallenge, solvePow, verifyPow } from './spam';
import { selectRelaysForContact, nextRelay, shouldRotateQueue } from './relays';

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function memberFor(relay: InMemoryAnonRelay) {
  const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  return {
    queueId,
    tokens,
    signingKey,
    privateKey: b64(secret),
    invite: {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: b64(publicKey),
      inviteToken,
      expiresAt: Date.now() + 60_000,
    },
  };
}

describe('group fan-out', () => {
  it('delivers one sealed copy per member queue', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = memberFor(relay);
    const bob = memberFor(relay);
    const result = await sendGroupMessage(
      relay,
      [
        { memberId: 'alice', invite: alice.invite },
        { memberId: 'bob', invite: bob.invite },
      ],
      'group hello',
    );
    expect(result.delivered.sort()).toEqual(['alice', 'bob']);
    expect(result.failed).toEqual([]);

    const forAlice = await receiveAnonMessages(
      relay,
      alice.queueId,
      alice.tokens.recipientToken,
      alice.privateKey,
      32,
      alice.signingKey,
    );
    const forBob = await receiveAnonMessages(
      relay,
      bob.queueId,
      bob.tokens.recipientToken,
      bob.privateKey,
      32,
      bob.signingKey,
    );
    expect(forAlice).toEqual(['group hello']);
    expect(forBob).toEqual(['group hello']);
  });
});

describe('proof-of-work', () => {
  it('accepts a valid solution', async () => {
    const challenge = createPowChallenge(8);
    const solution = await solvePow(challenge);
    expect(verifyPow(challenge, solution)).toBe(true);
  });

  it('rejects a wrong nonce', async () => {
    const challenge = createPowChallenge(8);
    const solution = await solvePow(challenge);
    expect(verifyPow(challenge, { ...solution, nonce: solution.nonce + 1 })).toBe(false);
  });

  it('rejects a solution below the required difficulty', async () => {
    const easy = createPowChallenge(2);
    const solution = await solvePow(easy);
    const harder = { ...easy, difficulty: 32 };
    expect(verifyPow(harder, solution)).toBe(false);
  });

  it('rejects malformed challenges and solutions', () => {
    expect(() => createPowChallenge(0)).toThrow();
    expect(() => createPowChallenge(25)).toThrow();
    expect(verifyPow({ challenge: 'short', difficulty: 8 }, { nonce: 0, digest: 'x' })).toBe(false);
  });
});

describe('multi-relay', () => {
  const relays = [
    { id: 'r1', url: 'https://r1.example', operator: 'eu' },
    { id: 'r2', url: 'https://r2.example', operator: 'us' },
    { id: 'r3', url: 'https://r3.example', operator: 'asia' },
  ];

  it('picks two different relays for a contact', () => {
    const selection = selectRelaysForContact(relays, 'contact-seed');
    expect(selection).not.toBeNull();
    expect(selection!.primary.id).not.toBe(selection!.secondary?.id);
  });

  it('is deterministic for the same contact seed', () => {
    const a = selectRelaysForContact(relays, 'seed-x');
    const b = selectRelaysForContact(relays, 'seed-x');
    expect(a?.primary.id).toBe(b?.primary.id);
    expect(a?.secondary?.id).toBe(b?.secondary?.id);
  });

  it('returns null when no relays are configured', () => {
    expect(selectRelaysForContact([], 'seed')).toBeNull();
  });

  it('rotates to the next relay', () => {
    expect(nextRelay(relays[0], relays)?.id).toBe('r2');
    expect(nextRelay(relays[2], relays)?.id).toBe('r1');
  });

  it('flags a queue past its rotation window', () => {
    const now = Date.now();
    expect(shouldRotateQueue(now - 1000, now)).toBe(false);
    expect(shouldRotateQueue(now - 8 * 24 * 60 * 60 * 1000, now)).toBe(true);
  });
});
