import { beforeEach, describe, it, expect } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import {
  contactIdentity,
  createInvitation,
  inviteFromInbox,
  isBlockedContact,
  rotateInbox,
} from './pairing';
import { blockSender, clearBlockList } from './blocks';
import {
  generateQueueSigningKeyPair,
  queueSigningPublicKey,
  signIdentityBinding,
  verifyIdentityBinding,
} from './signing';
import type { AnonInvite } from './session';

beforeEach(() => {
  clearBlockList();
});

describe('identity binding (phase H)', () => {
  it('signs the first queue key with the identity key', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example');
    expect(alice).not.toBeNull();

    const queueKey = queueSigningPublicKey(alice!.invite.signingKey);
    expect(alice!.invite.identityKey).toBe(queueKey);
    expect(alice!.invite.identitySignature).toBeTruthy();
    expect(
      verifyIdentityBinding(alice!.invite.identityKey!, queueKey, alice!.invite.identitySignature!),
    ).toBe(true);
    expect(contactIdentity(alice!.invite)).toBe(alice!.invite.identityKey);
  });

  it('re-signs the new queue key on rotation while keeping the identity', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example');
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };

    const rotated = await rotateInbox(
      async (url) => (url === 'https://r2.example' ? r2 : r1),
      inbox,
      Date.now(),
      { force: true },
    );
    expect(rotated).not.toBeNull();

    const moved = inviteFromInbox(rotated!);
    const oldQueueKey = queueSigningPublicKey(alice!.invite.signingKey);
    const newQueueKey = queueSigningPublicKey(moved.signingKey);
    expect(newQueueKey).not.toBe(oldQueueKey);
    expect(moved.identityKey).toBe(alice!.invite.identityKey);
    expect(moved.identitySignature).toBeTruthy();
    expect(verifyIdentityBinding(moved.identityKey!, newQueueKey, moved.identitySignature!)).toBe(true);
    expect(contactIdentity(moved)).toBe(alice!.invite.identityKey);
  });

  it('does not honour a claimed identity with a forged signature', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example');
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    const rotated = await rotateInbox(
      async (url) => (url === 'https://r2.example' ? r2 : r1),
      inbox,
      Date.now(),
      { force: true },
    );
    const moved = inviteFromInbox(rotated!);
    const queueKey = queueSigningPublicKey(moved.signingKey);

    const forged: AnonInvite = { ...moved, identitySignature: 'A'.repeat(86) };
    expect(contactIdentity(forged)).toBe(queueKey);
    expect(verifyIdentityBinding(forged.identityKey!, queueKey, forged.identitySignature!)).toBe(false);

    // The fallback queue key is still blockable, so the offer cannot slip past
    // a block that was placed on the key it actually uses.
    blockSender(queueKey);
    expect(isBlockedContact(forged)).toBe(true);
  });

  it('ignores an unsigned identity claim from a rotated queue', async () => {
    const r1 = new InMemoryAnonRelay();
    const r2 = new InMemoryAnonRelay();
    const alice = await createInvitation(r1, 'https://r1.example');
    const inbox = {
      ...alice!.inbox,
      relays: [
        { id: 'r1', url: 'https://r1.example' },
        { id: 'r2', url: 'https://r2.example' },
      ],
    };
    const rotated = await rotateInbox(
      async (url) => (url === 'https://r2.example' ? r2 : r1),
      inbox,
      Date.now(),
      { force: true },
    );
    const moved = inviteFromInbox(rotated!);
    const unsigned: AnonInvite = { ...moved };
    delete unsigned.identitySignature;

    expect(contactIdentity(unsigned)).toBe(queueSigningPublicKey(unsigned.signingKey));
    expect(contactIdentity(unsigned)).not.toBe(unsigned.identityKey);
  });

  it('keeps trusting a first invite whose identity is its own queue key', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = await createInvitation(relay, 'https://r1.example');
    const legacy: AnonInvite = { ...alice!.invite };
    delete legacy.identitySignature;

    expect(contactIdentity(legacy)).toBe(legacy.identityKey);
    expect(contactIdentity(legacy)).toBe(queueSigningPublicKey(legacy.signingKey));
  });

  it('rejects a binding signed by a different identity key', () => {
    const other = generateQueueSigningKeyPair();
    const alice = generateQueueSigningKeyPair();
    const signature = signIdentityBinding(other.privateKey, other.publicKey, alice.publicKey);
    expect(verifyIdentityBinding(other.publicKey, alice.publicKey, signature)).toBe(true);
    expect(verifyIdentityBinding(alice.publicKey, alice.publicKey, signature)).toBe(false);
  });
});
