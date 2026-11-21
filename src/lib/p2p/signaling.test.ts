import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { P2PSignalingClient } from './signaling';
import { createAnonymousIdentity, identityPrivateKeys } from '../crypto/identity';
import { bufferToBase64 } from '../crypto/aes';

describe('P2PSignalingClient signatures', () => {
  let alice: Awaited<ReturnType<typeof createAnonymousIdentity>>;
  let bob: Awaited<ReturnType<typeof createAnonymousIdentity>>;
  let attackerKey: { priv: string; pub: string };

  beforeEach(async () => {
    alice = await createAnonymousIdentity();
    bob = await createAnonymousIdentity();
    const { ed25519 } = await import('@noble/curves/ed25519.js');
    const priv = new Uint8Array(32);
    crypto.getRandomValues(priv);
    attackerKey = {
      priv: bufferToBase64(priv),
      pub: bufferToBase64(ed25519.getPublicKey(priv)),
    };
  });

  afterEach(() => {
    // no-op
  });

  it('delivers a validly signed message', async () => {
    const aliceKeys = identityPrivateKeys(alice);
    const bobKeys = identityPrivateKeys(bob);

    const sender = new P2PSignalingClient({
      signingPrivateKey: bufferToBase64(aliceKeys.ed25519Secret),
      signingPublicKey: alice.signingPublicKey,
    });
    const receiver = new P2PSignalingClient({
      signingPrivateKey: bufferToBase64(bobKeys.ed25519Secret),
      signingPublicKey: bob.signingPublicKey,
    });

    const received: unknown[] = [];
    receiver.onMessage((msg) => received.push(msg));

    await sender.connect();
    await receiver.connect();

    await sender.sendSignal({
      type: 'ping',
      senderFingerprint: alice.fingerprint,
      targetFingerprint: bob.fingerprint,
      payload: { hello: 42 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
    expect((received[0] as { payload?: unknown }).payload).toEqual({ hello: 42 });
  });

  it('drops a message whose signing key does not match the sender fingerprint', async () => {
    const bobKeys = identityPrivateKeys(bob);

    const attacker = new P2PSignalingClient({
      signingPrivateKey: attackerKey.priv,
      signingPublicKey: attackerKey.pub,
    });
    const receiver = new P2PSignalingClient({
      signingPrivateKey: bufferToBase64(bobKeys.ed25519Secret),
      signingPublicKey: bob.signingPublicKey,
    });

    const received: unknown[] = [];
    receiver.onMessage((msg) => received.push(msg));

    await attacker.connect();
    await receiver.connect();

    await attacker.sendSignal({
      type: 'ping',
      senderFingerprint: alice.fingerprint, // spoofed fingerprint
      targetFingerprint: bob.fingerprint,
      payload: { hello: 42 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(0);
  });

  it('accepts unsigned messages for backward compatibility', async () => {
    const sender = new P2PSignalingClient({});
    const receiver = new P2PSignalingClient({});

    const received: unknown[] = [];
    receiver.onMessage((msg) => received.push(msg));

    await sender.connect();
    await receiver.connect();

    await sender.sendSignal({
      type: 'ping',
      senderFingerprint: 'sender-fp',
      targetFingerprint: 'receiver-fp',
      payload: { ok: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
  });
});