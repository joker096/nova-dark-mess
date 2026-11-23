import { describe, it, expect } from 'vitest';
import { InMemoryAnonRelay } from './relay';
import { x25519 } from '@noble/curves/ed25519.js';
import {
  createGroupSession,
  rotateGroupSession,
  openGroupMessage,
  parseGroupPayload,
  adoptGroupKey,
  sessionFromGroupKeyDistribution,
  sealGroupMessage,
} from './groupSession';
import {
  MAX_FANOUT_MEMBERS,
  distributeGroupSession,
  sendEncryptedGroupMessage,
} from './groups';
import { sealMessageAsync, unsealMessageAsync } from '../messaging/sealedSender';
import { receiveAnonMessages } from './session';

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

async function memberInbox(
  relay: InMemoryAnonRelay,
  member: ReturnType<typeof memberFor>,
): Promise<string[]> {
  const raw = await receiveAnonMessages(
    relay,
    member.queueId,
    member.tokens.recipientToken,
    member.privateKey,
    32,
    member.signingKey,
  );
  return raw;
}

describe('encrypted group fan-out', () => {
  it('delivers one sealed group message per member queue and every member opens it', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = memberFor(relay);
    const bob = memberFor(relay);
    const carol = memberFor(relay);

    const session = await createGroupSession([alice.queueId, bob.queueId, carol.queueId]);

    const result = await sendEncryptedGroupMessage(
      relay,
      [
        { memberId: 'alice', invite: alice.invite },
        { memberId: 'bob', invite: bob.invite },
        { memberId: 'carol', invite: carol.invite },
      ],
      session,
      'encrypted group hello',
    );
    expect(result.delivered.sort()).toEqual(['alice', 'bob', 'carol']);
    expect(result.failed).toEqual([]);

    for (const member of [alice, bob, carol]) {
      const messages = await memberInbox(relay, member);
      expect(messages).toHaveLength(1);
      const envelope = JSON.parse(messages[0]) as {
        type: 'nova-anon-group'; iv: string; ciphertext: string; groupId: string; version: number;
      };
      const plaintext = await openGroupMessage(session, envelope);
      expect(plaintext).toBe('encrypted group hello');
    }
  });

  it('a removed member cannot open messages sealed after rotation', async () => {    const relay = new InMemoryAnonRelay();
    const alice = memberFor(relay);
    const bob = memberFor(relay);
    const eve = memberFor(relay);

    const session = await createGroupSession([alice.queueId, bob.queueId, eve.queueId]);
    await sendEncryptedGroupMessage(
      relay,
      [
        { memberId: 'alice', invite: alice.invite },
        { memberId: 'bob', invite: bob.invite },
        { memberId: 'eve', invite: eve.invite },
      ],
      session,
      'before removal',
    );

    const rotated = await rotateGroupSession(session, [alice.queueId, bob.queueId]);
    await sendEncryptedGroupMessage(
      relay,
      [
        { memberId: 'alice', invite: alice.invite },
        { memberId: 'bob', invite: bob.invite },
      ],
      rotated,
      'after removal',
    );

    const eveMessages = await memberInbox(relay, eve);
    // Eve was a member before removal, so she can open the old message.
    const canOpenOld = eveMessages.some((body) => {
      const envelope = JSON.parse(body) as { groupId: string; version: number };
      return envelope.groupId === session.id && envelope.version === session.version;
    });
    expect(canOpenOld).toBe(true);

    // But she cannot open any message sealed under the rotated key.
    for (const body of eveMessages) {
      const envelope = JSON.parse(body) as {
        type: 'nova-anon-group'; iv: string; ciphertext: string; groupId: string; version: number;
      };
      if (envelope.version === rotated.version) {
        const opened = await openGroupMessage(session, envelope);
        expect(opened).toBeNull();
      }
    }
  });

  it('distributes a rotated key to remaining members as personal messages', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = memberFor(relay);
    const bob = memberFor(relay);
    const eve = memberFor(relay);

    const session = await createGroupSession([alice.queueId, bob.queueId, eve.queueId]);
    const rotated = await rotateGroupSession(session, [alice.queueId, bob.queueId]);

    const result = await distributeGroupSession(
      () => relay,
      [
        { memberId: 'alice', invite: alice.invite },
        { memberId: 'bob', invite: bob.invite },
      ],
      rotated,
    );
    expect(result.delivered.sort()).toEqual(['alice', 'bob']);
    expect(result.failed).toEqual([]);

    const bobMessages = await memberInbox(relay, bob);
    expect(bobMessages).toHaveLength(1);
    const parsed = parseGroupPayload(bobMessages[0]);
    expect(parsed?.kind).toBe('key');
    if (parsed?.kind !== 'key') return;
    expect(parsed.distribution.version).toBe(rotated.version);
    const adopted = adoptGroupKey(session, parsed.distribution);
    expect(adopted?.version).toBe(rotated.version);

    const envelope = await sealGroupMessage(rotated, 'post rotation group');
    expect(await openGroupMessage(adopted!, envelope)).toBe('post rotation group');

    // Eve did not receive the rotated key.
    const eveMessages = await memberInbox(relay, eve);
    expect(eveMessages.some((body) => parseGroupPayload(body)?.kind === 'key')).toBe(false);

    // A distributed key can also build a fresh receiver-side session.
    const fresh = sessionFromGroupKeyDistribution(parsed.distribution);
    expect(fresh?.id).toBe(session.id);
    expect(fresh?.members).toEqual([]);
  });

  it('refuses fan-out beyond the member cap', async () => {
    const relay = new InMemoryAnonRelay();
    const alice = memberFor(relay);
    const session = await createGroupSession([alice.queueId]);
    const tooMany = Array.from({ length: MAX_FANOUT_MEMBERS + 1 }, (_, index) => ({
      memberId: `m${index}`,
      invite: alice.invite,
    }));
    const result = await sendEncryptedGroupMessage(relay, tooMany, session, 'hello');
    expect(result.delivered).toEqual([]);
    expect(result.failed).toHaveLength(MAX_FANOUT_MEMBERS + 1);
  });

  it('invite privateKey and recipientPublicKey form a working pair', async () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);

    const invite = {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: b64(publicKey),
      inviteToken,
      expiresAt: Date.now() + 60_000,
    };

    // Encrypt to the invite's recipientPublicKey, decrypt with its privateKey.
    const plaintext = 'group invite payload';
    const sealed = await sealMessageAsync(invite.recipientPublicKey, plaintext);
    const opened = await unsealMessageAsync(b64(secret), sealed);
    expect(opened).toBe(plaintext);

    // A mismatched private key must not open it.
    const wrongSecret = x25519.utils.randomSecretKey();
    await expect(unsealMessageAsync(b64(wrongSecret), sealed)).rejects.toThrow();
  });
});
