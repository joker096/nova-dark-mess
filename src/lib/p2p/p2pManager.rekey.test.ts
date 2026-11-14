/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach } from 'vitest';
import { P2PManager } from './p2pManager';
import { createAnonymousIdentity } from '../crypto/identity';
import {
  createRelayPair,
  createSilentSignaling,
  waitFor,
} from '../../test/p2pHarness';

describe('P2PManager re-keying after edit/delete', () => {
  const managers: P2PManager[] = [];

  afterEach(() => {
    managers.splice(0).forEach((manager) => manager.close());
  });

  it('reports that it cannot re-key before a peer bundle is known', async () => {
    const identity = await createAnonymousIdentity();
    const peer = await createAnonymousIdentity();
    const manager = new P2PManager({ identity, signaling: createSilentSignaling() });
    managers.push(manager);

    await expect(manager.rekeySession(peer.fingerprint)).resolves.toBe(false);
    await expect(manager.rekeyAllSessions()).resolves.toBe(0);
  });

  it('keeps the conversation working across a re-key and rejects a stale reset', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const { aliceRelay, bobRelay, asMeshRelay } = createRelayPair(
      alice.fingerprint,
      bob.fingerprint,
    );

    const aliceInbox: string[] = [];
    const bobInbox: string[] = [];
    const bobErrors: Error[] = [];

    const aliceManager = new P2PManager({
      identity: alice,
      signaling: createSilentSignaling(),
      relay: asMeshRelay(aliceRelay),
      onMessage: (_from, text) => aliceInbox.push(text),
    });
    const bobManager = new P2PManager({
      identity: bob,
      signaling: createSilentSignaling(),
      relay: asMeshRelay(bobRelay),
      onMessage: (_from, text) => bobInbox.push(text),
      onError: (error) => bobErrors.push(error),
    });
    managers.push(aliceManager, bobManager);

    await aliceManager.initialize();
    await bobManager.initialize();
    aliceManager.registerPeerBundle(bob.fingerprint, await bobManager.getPreKeyBundle());
    bobManager.registerPeerBundle(alice.fingerprint, await aliceManager.getPreKeyBundle());

    await aliceManager.sendMessage(bob.fingerprint, 'original message');
    await waitFor(() => bobInbox.length === 1);
    expect(bobInbox[0]).toBe('original message');

    // A session with a known bundle can always be re-keyed.
    expect(await aliceManager.rekeyAllSessions()).toBe(1);

    await aliceManager.sendMessage(bob.fingerprint, 'message after delete');
    await waitFor(() => bobInbox.length === 2);
    expect(bobInbox[1]).toBe('message after delete');

    // Replaying the reset header must not roll Bob's keys backwards.
    const resetPayload = aliceRelay.sent.find(
      (payload) => (payload as { x3dh?: { generation?: number } }).x3dh?.generation === 1,
    );
    expect(resetPayload).toBeDefined();
    bobRelay.deliver({
      id: 'replay',
      origin: alice.fingerprint,
      destination: bob.fingerprint,
      ttl: 1,
      createdAt: Date.now(),
      hops: [alice.fingerprint],
      sealed: true,
      payload: resetPayload,
    });
    await waitFor(() => bobErrors.length === 1);
    expect(bobErrors[0].message).toMatch(/stale session reset/i);
    expect(bobInbox).toHaveLength(2);

    await bobManager.sendMessage(alice.fingerprint, 'reply after re-key');
    await waitFor(() => aliceInbox.length === 1);
    expect(aliceInbox[0]).toBe('reply after re-key');
  });
});
