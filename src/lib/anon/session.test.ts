import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { InMemoryAnonRelay } from './relay';
import {
  encodeInvite,
  decodeInvite,
  sendAnonMessage,
  receiveAnonMessages,
  receiveAnonPackets,
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
