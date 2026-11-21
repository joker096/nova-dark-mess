/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createAnonymousIdentity } from '../../../src/lib/crypto/identity';
import { P2PManager } from '../../../src/lib/p2p/p2pManager';
import { BotGateway, type BotGatewayOptions } from './index';
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

  it('joins a group and exchanges sender-key encrypted messages', async () => {
    const bot = await createAnonymousIdentity();
    const peer = await createAnonymousIdentity();
    const bus = createSignalingBus();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(
      bot.fingerprint,
      peer.fingerprint,
    );

    const groupMessages: Array<{ groupId: string; sender: string; text: string }> = [];
    const gateway = new BotGateway({
      identity: bot,
      signaling: bus.clientFor(bot.fingerprint),
      relay: asMeshRelay(aliceRelay),
      onGroupMessage: (groupId, sender, text) => groupMessages.push({ groupId, sender, text }),
    });
    gateways.push(gateway);

    const peerGroupMessages: Array<{ groupId: string; sender: string; text: string }> = [];
    const peerOneToOneMessages: string[] = [];
    const peerGateway = new BotGateway({
      identity: peer,
      signaling: bus.clientFor(peer.fingerprint),
      relay: asMeshRelay(bobRelay),
      onMessage: (_from, text) => peerOneToOneMessages.push(text),
      onGroupMessage: (groupId, sender, text) => peerGroupMessages.push({ groupId, sender, text }),
    });
    gateways.push(peerGateway);

    await gateway.initialize();
    await peerGateway.initialize();
    gateway['p2p'].registerPeerBundle(peer.fingerprint, await peerGateway.getPreKeyBundle());
    peerGateway['p2p'].registerPeerBundle(bot.fingerprint, await gateway.getPreKeyBundle());

    const members = [bot.fingerprint, peer.fingerprint];
    await gateway.joinGroup('group-1', members, { distribute: false });
    await peerGateway.joinGroup('group-1', members);
    // Let the peer's SKDM finish before the bot sends its own: the ratchet
    // cannot process two simultaneous sends from both sides.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await gateway.distributeGroupKey('group-1');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(gateway.getJoinedGroups()).toEqual(['group-1']);
    expect(await gateway.sendGroupMessage('group-1', 'hello group')).toBe(true);

    await waitFor(() => peerGroupMessages.length === 1);
    expect(peerGroupMessages[0]).toEqual({
      groupId: 'group-1',
      sender: bot.fingerprint,
      text: 'hello group',
    });
    // A group frame must not surface as a plain 1:1 message.
    expect(peerOneToOneMessages).toHaveLength(0);

    // The sender sees its own echo once.
    expect(groupMessages).toEqual([
      { groupId: 'group-1', sender: bot.fingerprint, text: 'hello group' },
    ]);

    await gateway.removeGroupMember('group-1', peer.fingerprint);
    await gateway.sendGroupMessage('group-1', 'after removal');
    // The removed member is no longer a fan-out target.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(peerGroupMessages).toHaveLength(1);

    await gateway.leaveGroup('group-1');
    expect(gateway.getJoinedGroups()).toEqual([]);
  });

  it('closes cleanly', async () => {
    const identity = await createAnonymousIdentity();
    const gateway = new BotGateway({ identity });
    await gateway.initialize();
    expect(() => gateway.close()).not.toThrow();
  });
});

describe('BotGateway group privacy and wire framing (B4)', () => {
  const gateways: BotGateway[] = [];
  const managers: P2PManager[] = [];

  afterEach(() => {
    gateways.splice(0).forEach((g) => g.close());
    managers.splice(0).forEach((m) => m.close());
  });

  async function connectedPair(gatewayOptions: Partial<BotGatewayOptions> = {}) {
    const bot = await createAnonymousIdentity();
    const peer = await createAnonymousIdentity();
    const bus = createSignalingBus();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(bot.fingerprint, peer.fingerprint);

    const groupMessages: Array<{ sender: string; text: string }> = [];
    const gateway = new BotGateway({
      identity: bot,
      signaling: bus.clientFor(bot.fingerprint),
      relay: asMeshRelay(aliceRelay),
      onGroupMessage: (_groupId, sender, text) => groupMessages.push({ sender, text }),
      ...gatewayOptions,
    });
    const peerGateway = new BotGateway({
      identity: peer,
      signaling: bus.clientFor(peer.fingerprint),
      relay: asMeshRelay(bobRelay),
    });
    gateways.push(gateway, peerGateway);

    await gateway.initialize();
    await peerGateway.initialize();
    gateway['p2p'].registerPeerBundle(peer.fingerprint, await peerGateway.getPreKeyBundle());
    peerGateway['p2p'].registerPeerBundle(bot.fingerprint, await gateway.getPreKeyBundle());

    return { bot, peer, gateway, peerGateway, groupMessages };
  }

  it('answers its own group echo locally instead of looping it back as an update', async () => {
    const { bot, peer, gateway, peerGateway, groupMessages } = await connectedPair({ botId: 'echo' });
    expect(gateway.groupPrivacy).toBe('all');

    const members = [bot.fingerprint, peer.fingerprint];
    await gateway.joinGroup('g', members, { distribute: false });
    await peerGateway.joinGroup('g', members);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await gateway.distributeGroupKey('g');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gateway.getGroupMembers('g')).toEqual(members);

    expect(await gateway.sendGroupMessage('g', 'from the bot')).toBe(true);
    await waitFor(() => groupMessages.length === 1);
    expect(groupMessages[0]).toEqual({ sender: bot.fingerprint, text: 'from the bot' });
    // Only the local echo: sending once must never produce a second update.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(groupMessages).toHaveLength(1);
  });

  it('mention-only mode drops unmentioned group text but keeps commands and mentions', async () => {
    const { bot, peer, gateway, peerGateway, groupMessages } = await connectedPair({
      botId: 'helper',
      mentionOnly: true,
    });
    expect(gateway.groupPrivacy).toBe('mention_only');

    const members = [bot.fingerprint, peer.fingerprint];
    await gateway.joinGroup('g', members, { distribute: false });
    await peerGateway.joinGroup('g', members);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await gateway.distributeGroupKey('g');
    await new Promise((resolve) => setTimeout(resolve, 100));

    await peerGateway.sendGroupMessage('g', 'just chatting');
    // Let any wrongly-delivered frame arrive before asserting nothing came.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(groupMessages).toHaveLength(0);

    await peerGateway.sendGroupMessage('g', '/status');
    await waitFor(() => groupMessages.length === 1);
    expect(groupMessages[0].text).toBe('/status');

    await peerGateway.sendGroupMessage('g', 'hey @helper, are you there?');
    await waitFor(() => groupMessages.length === 2);
    expect(groupMessages[1].text).toBe('hey @helper, are you there?');
  });
});
