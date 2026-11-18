/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach } from 'vitest';
import { P2PManager } from './p2pManager';
import { createAnonymousIdentity } from '../crypto/identity';
import {
  createSignalingBus,
  createRelayPair,
  installWebRtcStub,
  waitFor,
} from '../../test/p2pHarness';

installWebRtcStub();

describe('P2PManager end-to-end: two peers exchange a message', () => {
  const managers: P2PManager[] = [];

  afterEach(() => {
    managers.splice(0).forEach((manager) => manager.close());
  });

  it('delivers an encrypted message from alice to bob over the relay', async () => {
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
      onMessage: (_from, text) => bobInbox.push(text),
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

    // Exchange prekey bundles via signaling bus.
    aliceManager.registerPeerBundle(bob.fingerprint, await bobManager.getPreKeyBundle());
    bobManager.registerPeerBundle(alice.fingerprint, await aliceManager.getPreKeyBundle());

    // Alice sends a message; it goes through the relay (WebRTC channel is not
    // connected in this harness, so the relay path is exercised).
    const ok = await aliceManager.sendMessage(bob.fingerprint, 'hello, real p2p');
    expect(ok).toBe(true);

    await waitFor(() => bobInbox.length === 1);
    expect(bobInbox[0]).toBe('hello, real p2p');
  });

  it('rejects a message to an unknown peer without a bundle', async () => {
    const alice = await createAnonymousIdentity();
    const manager = new P2PManager({ identity: alice, signaling: createSignalingBus().clientFor(alice.fingerprint) });
    managers.push(manager);

    await manager.initialize();
    await expect(manager.sendMessage('unknown_peer', 'nope')).rejects.toThrow(
      /Waiting for prekey bundle/,
    );
  });
});
