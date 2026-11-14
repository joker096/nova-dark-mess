/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach } from 'vitest';
import { P2PManager } from './p2pManager';
import { createAnonymousIdentity } from '../crypto/identity';
import {
  createRelayPair,
  createSignalingBus,
  createSilentSignaling,
  installWebRtcStub,
  waitFor,
} from '../../test/p2pHarness';

installWebRtcStub();

function lastResetPayloadFrom(sent: unknown[]) {
  return [...sent]
    .reverse()
    .find((payload) => Boolean((payload as { x3dh?: unknown }).x3dh)) as
    | { x3dh?: { generation?: number; signedPreKeyId: number } }
    | undefined;
}

describe('P2PManager prekey bundle freshness', () => {
  const managers: P2PManager[] = [];

  afterEach(() => {
    managers.splice(0).forEach((manager) => manager.close());
  });

  it('refreshes the peer bundle before re-keying, so a rotated signed prekey is used', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const bus = createSignalingBus();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(
      alice.fingerprint,
      bob.fingerprint,
    );

    const bobInbox: string[] = [];
    const aliceManager = new P2PManager({
      identity: alice,
      signaling: bus.clientFor(alice.fingerprint),
      relay: asMeshRelay(aliceRelay),
      bundleMaxAgeMs: 0,
    });
    const bobManager = new P2PManager({
      identity: bob,
      signaling: bus.clientFor(bob.fingerprint),
      relay: asMeshRelay(bobRelay),
      onMessage: (_from, text) => bobInbox.push(text),
    });
    managers.push(aliceManager, bobManager);

    await aliceManager.initialize();
    await bobManager.initialize();
    const initialBundle = await bobManager.getPreKeyBundle();
    aliceManager.registerPeerBundle(bob.fingerprint, initialBundle);
    bobManager.registerPeerBundle(alice.fingerprint, await aliceManager.getPreKeyBundle());

    await aliceManager.sendMessage(bob.fingerprint, 'before rotation');
    await waitFor(() => bobInbox.length === 1);

    const rotated = await bobManager.rotateSignedPreKey();
    expect(rotated.signedPreKey.keyId).not.toBe(initialBundle.signedPreKey.keyId);

    expect(await aliceManager.rekeySession(bob.fingerprint)).toBe(true);
    expect(bus.sent.some((message) => message.type === 'prekey_request')).toBe(true);

    await aliceManager.sendMessage(bob.fingerprint, 'after rotation');
    await waitFor(() => bobInbox.length === 2);
    expect(bobInbox[1]).toBe('after rotation');
    expect(lastResetPayloadFrom(aliceRelay.sent)?.x3dh?.signedPreKeyId).toBe(
      rotated.signedPreKey.keyId,
    );
  });

  it('still wins when no refresh is possible by keeping the previous signed prekey', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(
      alice.fingerprint,
      bob.fingerprint,
    );

    const bobInbox: string[] = [];
    const aliceManager = new P2PManager({
      identity: alice,
      signaling: createSilentSignaling(),
      relay: asMeshRelay(aliceRelay),
      // Never treat the cached bundle as stale: the reset will use the old SPK.
      bundleMaxAgeMs: Number.POSITIVE_INFINITY,
    });
    const bobManager = new P2PManager({
      identity: bob,
      signaling: createSilentSignaling(),
      relay: asMeshRelay(bobRelay),
      onMessage: (_from, text) => bobInbox.push(text),
    });
    managers.push(aliceManager, bobManager);

    await aliceManager.initialize();
    await bobManager.initialize();
    const cachedBundle = await bobManager.getPreKeyBundle();
    aliceManager.registerPeerBundle(bob.fingerprint, cachedBundle);
    bobManager.registerPeerBundle(alice.fingerprint, await aliceManager.getPreKeyBundle());

    await aliceManager.sendMessage(bob.fingerprint, 'before rotation');
    await waitFor(() => bobInbox.length === 1);

    await bobManager.rotateSignedPreKey();

    expect(await aliceManager.rekeySession(bob.fingerprint)).toBe(true);

    await aliceManager.sendMessage(bob.fingerprint, 'stale bundle reset');
    await waitFor(() => bobInbox.length === 2);
    expect(bobInbox[1]).toBe('stale bundle reset');
    expect(lastResetPayloadFrom(aliceRelay.sent)?.x3dh?.signedPreKeyId).toBe(
      cachedBundle.signedPreKey.keyId,
    );
  });
});
