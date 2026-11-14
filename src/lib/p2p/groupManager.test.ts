/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { createAnonymousIdentity } from '../crypto/identity';
import { GroupChatManager } from './groupManager';

describe('GroupChatManager', () => {
  it('distributes sender key to members on initialize', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const sendToPeer = vi.fn();

    const aliceMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer,
    });

    await aliceMgr.initialize(true);

    expect(sendToPeer).toHaveBeenCalledWith(
      bob.fingerprint,
      expect.objectContaining({ type: 'skdm', groupId: 'g1' }),
    );
  });

  it('sends the current sender key to a newly added member', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const charlie = await createAnonymousIdentity();
    const sendToPeer = vi.fn();

    const manager = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer,
    });
    await manager.initialize(true);
    sendToPeer.mockClear();

    await manager.addMember(charlie.fingerprint);

    expect(manager.getMembers()).toContain(charlie.fingerprint);
    expect(sendToPeer).toHaveBeenCalledTimes(1);
    expect(sendToPeer).toHaveBeenCalledWith(
      charlie.fingerprint,
      expect.objectContaining({ type: 'skdm', groupId: 'g1' }),
    );
  });

  it('rotates the sender key when a member is removed', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const charlie = await createAnonymousIdentity();

    const aliceInbox: string[] = [];
    const bobInbox: string[] = [];
    let aliceMgr: GroupChatManager;
    let bobMgr: GroupChatManager;

    aliceMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint, charlie.fingerprint],
      sendToPeer: async (peer, payload) => {
        if (peer === bob.fingerprint) await bobMgr.handleIncoming(alice.fingerprint, payload);
      },
      onMessage: (_sender, text) => aliceInbox.push(text),
    });
    bobMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: bob.fingerprint,
      members: [alice.fingerprint, bob.fingerprint, charlie.fingerprint],
      sendToPeer: async () => undefined,
      onMessage: (_sender, text) => bobInbox.push(text),
    });

    await aliceMgr.initialize(true);
    await aliceMgr.sendText('before removal');
    expect(bobInbox).toEqual(['before removal']);

    const keyBefore = aliceMgr.getOwnState()?.keyId;
    await aliceMgr.removeMember(bob.fingerprint);
    const keyAfter = aliceMgr.getOwnState()?.keyId;
    expect(keyAfter).not.toBe(keyBefore);

    await aliceMgr.sendText('after removal');
    expect(bobInbox).toEqual(['before removal']);
  });

  it('sends and receives a group message end to end', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();

    // Transport: deliver payloads between managers.
    let aliceMgr: GroupChatManager;
    let bobMgr: GroupChatManager;

    const aliceInbox: string[] = [];
    const bobInbox: string[] = [];

    aliceMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer: async (peer, payload) => {
        if (peer === bob.fingerprint) {
          await bobMgr.handleIncoming(alice.fingerprint, payload as any);
        }
      },
      onMessage: (_s, text) => aliceInbox.push(text),
    });

    bobMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: bob.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer: async (peer, payload) => {
        if (peer === alice.fingerprint) {
          await aliceMgr.handleIncoming(bob.fingerprint, payload as any);
        }
      },
      onMessage: (_s, text) => bobInbox.push(text),
    });

    await aliceMgr.initialize(true);
    await bobMgr.initialize(true);

    // Bob needs Alice's sender key: Alice distributed on init, but Bob's
    // handleIncoming was not called because Bob did not exist yet. Redistribute.
    await aliceMgr.distributeSenderKey();
    // Wait for async delivery
    await new Promise((r) => setTimeout(r, 0));

    // Now Bob sends his key to Alice.
    await bobMgr.distributeSenderKey();
    await new Promise((r) => setTimeout(r, 0));

    const delivered = await aliceMgr.sendText('hello group');
    expect(delivered).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(bobInbox).toContain('hello group');
  });

  it('broadcasts role changes and hands them to onRoles', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const sendToPeer = vi.fn();
    const onRoles = vi.fn();

    const aliceMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer,
    });
    const bobMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: bob.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      onRoles,
    });

    const roles = {
      [alice.fingerprint]: 'admin' as const,
      [bob.fingerprint]: 'admin' as const,
    };
    await aliceMgr.broadcastRoles(roles);

    expect(sendToPeer).toHaveBeenCalledWith(
      bob.fingerprint,
      expect.objectContaining({ type: 'group_roles', roles }),
    );

    await bobMgr.handleIncoming(bob.fingerprint, {
      type: 'group_roles',
      groupId: 'g1',
      roles,
    });
    expect(onRoles).toHaveBeenCalledWith(bob.fingerprint, roles);

    await bobMgr.handleIncoming(bob.fingerprint, {
      type: 'group_roles',
      groupId: 'other-group',
      roles,
    });
    expect(onRoles).toHaveBeenCalledTimes(1);
  });

  it('relays join requests to admins and decisions back to the requester', async () => {
    const alice = await createAnonymousIdentity();
    const bob = await createAnonymousIdentity();
    const sendToPeer = vi.fn();
    const onJoinRequest = vi.fn();
    const onJoinResponse = vi.fn();

    const aliceMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: alice.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      onJoinRequest,
    });
    const bobMgr = new GroupChatManager({
      groupId: 'g1',
      localFingerprint: bob.fingerprint,
      members: [alice.fingerprint, bob.fingerprint],
      sendToPeer,
      onJoinResponse,
    });

    await bobMgr.requestToJoin('Bob');
    expect(sendToPeer).toHaveBeenCalledWith(
      alice.fingerprint,
      expect.objectContaining({ type: 'group_join_request', fingerprint: bob.fingerprint }),
    );

    await aliceMgr.handleIncoming(bob.fingerprint, {
      type: 'group_join_request',
      groupId: 'g1',
      fingerprint: bob.fingerprint,
      name: 'Bob',
    });
    expect(onJoinRequest).toHaveBeenCalledWith(bob.fingerprint, {
      fingerprint: bob.fingerprint,
      name: 'Bob',
    });

    await aliceMgr.respondToJoin(bob.fingerprint, true);
    await bobMgr.handleIncoming(alice.fingerprint, {
      type: 'group_join_response',
      groupId: 'g1',
      fingerprint: bob.fingerprint,
      approved: true,
    });
    expect(onJoinResponse).toHaveBeenCalledWith(alice.fingerprint, {
      fingerprint: bob.fingerprint,
      approved: true,
    });

    await bobMgr.handleIncoming(alice.fingerprint, {
      type: 'group_join_response',
      groupId: 'other-group',
      fingerprint: bob.fingerprint,
      approved: false,
    });
    expect(onJoinResponse).toHaveBeenCalledTimes(1);
  });
});
