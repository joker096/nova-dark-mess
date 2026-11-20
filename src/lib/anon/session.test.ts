import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { InMemoryAnonRelay } from './relay';
import {
  encodeInvite,
  decodeInvite,
  sendAnonMessage,
  receiveAnonMessages,
  receiveAnonPackets,
  receiveAnonPacketsDetailed,
  isAllowedRelayUrl,
} from './session';
import { assembleFile, createFileEnvelopes, parseFileEnvelope } from './fileTransfer';

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('anon session', () => {
  it('allows onion relays alongside https and loopback', () => {
    const onion = 'http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz234567.onion';
    expect(isAllowedRelayUrl(onion)).toBe(true);
    expect(isAllowedRelayUrl('https://relay.example')).toBe(true);
    expect(isAllowedRelayUrl('http://localhost:8787')).toBe(true);
    expect(isAllowedRelayUrl('http://relay.example')).toBe(false);
    expect(isAllowedRelayUrl('http://.onion')).toBe(false);
  });

  it('sends and receives a sealed fixed-size message', async () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();

    const recipientSecret = x25519.utils.randomSecretKey();
    const recipientPublic = x25519.getPublicKey(recipientSecret);
    const recipientPrivateKeyB64 = b64(recipientSecret);
    const recipientPublicKeyB64 = b64(recipientPublic);

    const invite = {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: recipientPublicKeyB64,
      inviteToken,
      expiresAt: Date.now() + 10000,
    };

    const code = encodeInvite(invite);
    const decoded = decodeInvite(code);
    expect(decoded?.queueId).toBe(queueId);

    const result = await sendAnonMessage(relay, decoded!, 'hello anonymous');
    expect(result?.packetId).toBeTruthy();

    const messages = await receiveAnonMessages(
      relay,
      queueId,
      tokens.recipientToken,
      recipientPrivateKeyB64,
      32,
      signingKey,
    );
    expect(messages).toEqual(['hello anonymous']);

    // Ack removes the packet.
    const again = await receiveAnonMessages(
      relay,
      queueId,
      tokens.recipientToken,
      recipientPrivateKeyB64,
      32,
      signingKey,
    );
    expect(again).toEqual([]);
  });

  it('receives packets framed with a non-default profile (file chunks)', async () => {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();

    const recipientSecret = x25519.utils.randomSecretKey();
    const recipientPrivateKeyB64 = b64(recipientSecret);
    const invite = {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: b64(x25519.getPublicKey(recipientSecret)),
      inviteToken,
      expiresAt: Date.now() + 10000,
    };

    const chunk = JSON.stringify({ transferId: 't1', index: 0, total: 1 });
    const sent = await sendAnonMessage(relay, invite, chunk, 'large');
    expect(sent?.packetId).toBeTruthy();

    const packets = await receiveAnonPackets(
      relay,
      queueId,
      tokens.recipientToken,
      recipientPrivateKeyB64,
      32,
      signingKey,
    );
    expect(packets).toHaveLength(1);
    expect(packets[0].profile).toBe('large');
    expect(packets[0].body).toBe(chunk);
  });

  function setupQueue() {
    const relay = new InMemoryAnonRelay();
    const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
    const recipientSecret = x25519.utils.randomSecretKey();
    const invite = {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: b64(x25519.getPublicKey(recipientSecret)),
      inviteToken,
      expiresAt: Date.now() + 10000,
    };
    return { relay, queueId, tokens, signingKey, recipientSecret, invite };
  }

  it('drops a packet that is not a Nova packet and ACKs it on request (F1.2)', async () => {
    const { relay, queueId, tokens, signingKey, recipientSecret, invite } = setupQueue();

    // Garbage that is not even framed as a fixed-size packet.
    relay.enqueue(queueId, tokens.senderToken, btoa('not-a-packet'), signingKey, undefined, invite.inviteToken);
    const good = await sendAnonMessage(relay, invite, 'still deliverable');
    expect(good?.packetId).toBeTruthy();

    const result = await receiveAnonPacketsDetailed(
      relay,
      queueId,
      tokens.recipientToken,
      b64(recipientSecret),
      32,
      signingKey,
      { ackUndecodable: true },
    );

    expect(result.packets.map((packet) => packet.body)).toEqual(['still deliverable']);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('undecodable');

    // The garbage packet is gone from the queue, the valid one was returned
    // and can still be acknowledged normally.
    await receiveAnonMessages(relay, queueId, tokens.recipientToken, b64(recipientSecret), 32, signingKey);
    const left = relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets;
    expect(left.map((packet) => packet.packetId)).not.toContain(result.dropped[0].packetId);
  });

  it('keeps a well-formed packet it cannot decrypt until the TTL (F1.2)', async () => {
    const { relay, queueId, tokens, signingKey, recipientSecret, invite } = setupQueue();

    // Sealed to somebody else: valid framing, wrong key.
    const stranger = x25519.utils.randomSecretKey();
    const forStranger = {
      ...invite,
      recipientPublicKey: b64(x25519.getPublicKey(stranger)),
    };
    const sent = await sendAnonMessage(relay, forStranger, 'not for you');
    expect(sent?.packetId).toBeTruthy();

    const result = await receiveAnonPacketsDetailed(
      relay,
      queueId,
      tokens.recipientToken,
      b64(recipientSecret),
      32,
      signingKey,
      { ackUndecodable: true },
    );

    expect(result.packets).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('unreadable');
    expect(result.dropped[0].profile).toBe('standard');

    // Acknowledging is what deletes a packet, so it must still be queued: the
    // relay redelivers it and the packet survives for its TTL.
    const again = relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets;
    expect(again.map((packet) => packet.packetId)).toContain(sent!.packetId);
  });

  it('never acknowledges dropped packets by default', async () => {
    const { relay, queueId, tokens, signingKey, recipientSecret, invite } = setupQueue();
    relay.enqueue(queueId, tokens.senderToken, btoa('garbage'), signingKey, undefined, invite.inviteToken);

    const result = await receiveAnonPacketsDetailed(
      relay,
      queueId,
      tokens.recipientToken,
      b64(recipientSecret),
      32,
      signingKey,
    );

    expect(result.packets).toHaveLength(0);
    expect(result.dropped[0].reason).toBe('undecodable');
    // Opt-in only: the packet is still there for the caller to decide.
    expect(relay.poll(queueId, tokens.recipientToken, 32, signingKey).packets).toHaveLength(1);
  });

  it.each(['small', 'standard', 'large'] as const)(
    'reassembles a file whose envelopes are framed as %s',
    async (profile) => {
      const relay = new InMemoryAnonRelay();
      const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
      const recipientSecret = x25519.utils.randomSecretKey();
      const invite = {
        v: 1 as const,
        relayUrl: 'http://localhost',
        queueId,
        senderToken: tokens.senderToken,
        signingKey,
        recipientPublicKey: b64(x25519.getPublicKey(recipientSecret)),
        inviteToken,
        expiresAt: Date.now() + 10000,
      };
      const file = Uint8Array.from({ length: 900 }, (_, index) => index % 251);
      const envelopes = await createFileEnvelopes(file, 'photo.png', 'image/png');

      for (const envelope of envelopes) {
        const sent = await sendAnonMessage(relay, invite, JSON.stringify(envelope), profile);
        expect(sent?.packetId).toBeTruthy();
      }

      const packets = await receiveAnonPackets(
        relay,
        queueId,
        tokens.recipientToken,
        b64(recipientSecret),
        32,
        signingKey,
      );
      expect(packets).toHaveLength(envelopes.length);
      expect(packets.every((packet) => packet.profile === profile)).toBe(true);

      const parsed = packets.map((packet) => parseFileEnvelope(packet.body));
      expect(parsed.every((envelope) => envelope !== null)).toBe(true);
      const assembled = await assembleFile(parsed as NonNullable<(typeof parsed)[number]>[]);
      expect(assembled?.name).toBe('photo.png');
      expect(assembled?.bytes).toEqual(file);
    },
  );
});
