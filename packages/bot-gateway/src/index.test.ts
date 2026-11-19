/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createAnonymousIdentity } from '../../../src/lib/crypto/identity';
import { P2PManager } from '../../../src/lib/p2p/p2pManager';
import { BotGateway } from './index';
import {
  createSignalingBus,
  createRelayPair,
  installWebRtcStub,
  waitFor,
} from '../../../src/test/p2pHarness';

installWebRtcStub();

describe('BotGateway', () => {
  const gateways: BotGateway[] = [];
  const managers: P2PManager[] = [];

  afterEach(() => {
    gateways.splice(0).forEach((g) => g.close());
    managers.splice(0).forEach((m) => m.close());
  });

  it('exposes its fingerprint and prekey bundle', async () => {
    const identity = await createAnonymousIdentity();
    const gateway = new BotGateway({ identity });
    gateways.push(gateway);
    await gateway.initialize();

    expect(gateway.fingerprint).toBe(identity.fingerprint);
    const bundle = await gateway.getPreKeyBundle();
    expect(bundle.identityKey).toBe(identity.publicKey);
    expect(bundle.signingKey).toBe(identity.signingPublicKey);
    expect(bundle.fingerprint).toBe(identity.fingerprint);
  });

  it('sends an encrypted 1:1 message to a peer over the relay', async () => {
    const bot = await createAnonymousIdentity();
    const peer = await createAnonymousIdentity();
    const bus = createSignalingBus();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(
      bot.fingerprint,
      peer.fingerprint,
    );

    const gateway = new BotGateway({
      identity: bot,
      signaling: bus.clientFor(bot.fingerprint),
      relay: asMeshRelay(aliceRelay),
    });
    gateways.push(gateway);

    const peerManager = new P2PManager({
      identity: peer,
      signaling: bus.clientFor(peer.fingerprint),
      relay: asMeshRelay(bobRelay),
      onMessage: (_from, text) => received.push(text),
    });
    managers.push(peerManager);

    await gateway.initialize();
    await peerManager.initialize();

    // Exchange prekey bundles via signaling bus.
    gateway['p2p'].registerPeerBundle(
      peer.fingerprint,
      await peerManager.getPreKeyBundle(),
    );
    peerManager.registerPeerBundle(
      bot.fingerprint,
      await gateway.getPreKeyBundle(),
    );

    const received: string[] = [];
    const ok = await gateway.sendMessage(peer.fingerprint, 'hello from bot');
    expect(ok).toBe(true);

    await waitFor(() => received.length === 1);
    expect(received[0]).toBe('hello from bot');
  });

  it('closes cleanly', async () => {
    const identity = await createAnonymousIdentity();
    const gateway = new BotGateway({ identity });
    await gateway.initialize();
    expect(() => gateway.close()).not.toThrow();
  });
});
