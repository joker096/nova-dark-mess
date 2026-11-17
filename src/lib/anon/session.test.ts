import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { InMemoryAnonRelay } from './relay';
import { encodeInvite, decodeInvite, sendAnonMessage, receiveAnonMessages } from './session';

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('anon session', () => {
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
});
