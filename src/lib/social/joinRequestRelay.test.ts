/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JOIN_OUTBOX_KEY,
  JOIN_RETRY_MAX_MS,
  JoinRequestRelay,
  applyJoinPayload,
  clearJoinOutbox,
  flushJoinOutbox,
  getActiveJoinRelay,
  joinRetryDelay,
  loadJoinOutbox,
  nextJoinOutboxDelay,
  queueJoinRequestRelay,
  queueJoinResponseRelay,
  resetJoinOutboxBackoff,
  retryJoinOutboxNow,
} from './joinRequestRelay';
import type { MeshRelay } from '../p2p/relay';
import {
  getGroupMembership,
  getPendingJoinRequests,
  loadJoinRequests,
  setGroupMembership,
  upsertJoinRequest,
} from './groupJoinRequests';

const GROUP = 'thailand';
const ME = 'nova_pk_me';
const PEER = 'nova_pk_peer';

beforeEach(() => {
  localStorage.removeItem(JOIN_OUTBOX_KEY);
  localStorage.removeItem(`nova_group_join_requests_${GROUP}`);
  localStorage.removeItem(`nova_group_membership_${GROUP}`);
});

describe('join request outbox', () => {
  it('queues a request once per group and requester', () => {
    queueJoinRequestRelay(GROUP, PEER, 'Bob');
    queueJoinRequestRelay(GROUP, PEER, 'Bob');
    expect(loadJoinOutbox()).toHaveLength(1);
    expect(loadJoinOutbox()[0]).toMatchObject({ groupId: GROUP, kind: 'request', fingerprint: PEER });
  });

  it('broadcasts queued jobs and drops the ones that went out', () => {
    queueJoinRequestRelay(GROUP, PEER, 'Bob');
    queueJoinResponseRelay(GROUP, PEER, true);
    const send = vi.fn().mockReturnValue(true);

    const result = flushJoinOutbox({ send });

    expect(result).toEqual({ sent: 2, failed: 0, deferred: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual([
      '*',
      { type: 'group_join_request', groupId: GROUP, fingerprint: PEER, name: 'Bob' },
    ]);
    expect(send.mock.calls[1]).toEqual([
      '*',
      { type: 'group_join_response', groupId: GROUP, fingerprint: PEER, approved: true },
    ]);
    expect(loadJoinOutbox()).toHaveLength(0);
  });

  it('keeps jobs the relay could not hand off', () => {
    queueJoinRequestRelay(GROUP, PEER);
    const result = flushJoinOutbox({ send: vi.fn().mockReturnValue(false) });

    expect(result).toEqual({ sent: 0, failed: 1, deferred: 0 });
    expect(loadJoinOutbox()).toHaveLength(1);
    clearJoinOutbox();
    expect(loadJoinOutbox()).toHaveLength(0);
  });
});

describe('join request retry backoff', () => {
  it('doubles the wait after every failed attempt', () => {
    queueJoinRequestRelay(GROUP, PEER);
    const send = vi.fn().mockReturnValue(false);

    expect(flushJoinOutbox({ send }, 1_000)).toEqual({ sent: 0, failed: 1, deferred: 0 });
    expect(loadJoinOutbox()[0]).toMatchObject({ attempts: 1, nextAttemptAt: 1_000 + 5_000 });

    // Still inside the backoff window: no second attempt.
    expect(flushJoinOutbox({ send }, 2_000)).toEqual({ sent: 0, failed: 0, deferred: 1 });
    expect(send).toHaveBeenCalledTimes(1);

    // Window elapsed: retry, then wait twice as long.
    expect(flushJoinOutbox({ send }, 6_000).failed).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(loadJoinOutbox()[0]).toMatchObject({ attempts: 2, nextAttemptAt: 6_000 + 10_000 });
  });

  it('caps the delay and reports when the next job is due', () => {
    queueJoinRequestRelay(GROUP, PEER);
    const send = vi.fn().mockReturnValue(false);

    expect(nextJoinOutboxDelay(0)).toBe(0);
    let now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      flushJoinOutbox({ send }, now);
      now += JOIN_RETRY_MAX_MS + 1;
    }

    expect(loadJoinOutbox()[0]?.attempts).toBe(10);
    expect(joinRetryDelay(20)).toBe(JOIN_RETRY_MAX_MS);
    expect(nextJoinOutboxDelay(0)).toBeGreaterThan(0);

    resetJoinOutboxBackoff();
    expect(loadJoinOutbox()[0]).toMatchObject({ attempts: 0, nextAttemptAt: 0 });

    clearJoinOutbox();
    expect(nextJoinOutboxDelay()).toBeNull();
  });

  it('retries everything at once through the session relay', () => {
    queueJoinRequestRelay(GROUP, PEER, 'Bob');
    const relay = {
      send: vi.fn().mockReturnValue(false),
      onDeliver: vi.fn(),
      close: vi.fn(),
    };
    const session = new JoinRequestRelay({
      localFingerprint: ME,
      relay: relay as unknown as MeshRelay,
    });
    session.start();
    session.flush();
    expect(loadJoinOutbox()[0]?.attempts).toBe(1);

    relay.send.mockReturnValue(true);
    expect(retryJoinOutboxNow()).toBe(0);
    expect(loadJoinOutbox()).toHaveLength(0);

    session.stop();
    expect(getActiveJoinRelay()).toBeNull();
  });
});

describe('applyJoinPayload', () => {
  it('records a relayed request only for group admins', () => {
    const request = {
      type: 'group_join_request' as const,
      groupId: GROUP,
      fingerprint: PEER,
      name: 'Bob',
    };

    expect(applyJoinPayload(request, { localFingerprint: ME, isAdminOf: () => false })).toBeNull();
    expect(getPendingJoinRequests(GROUP)).toHaveLength(0);

    const applied = applyJoinPayload(request, { localFingerprint: ME, isAdminOf: () => true });
    expect(applied).toMatchObject({ kind: 'request', fingerprint: PEER, name: 'Bob' });
    expect(getPendingJoinRequests(GROUP).map((r) => r.fingerprint)).toEqual([PEER]);
  });

  it('ignores a request the device sent to itself and foreign groups evidence-free', () => {
    expect(
      applyJoinPayload(
        { type: 'group_join_request', groupId: GROUP, fingerprint: ME },
        { localFingerprint: ME, isAdminOf: () => true },
      ),
    ).toBeNull();
    expect(loadJoinRequests(GROUP)).toHaveLength(0);
  });

  it('turns a relayed decision into membership for the invitee', () => {
    // The invitee queued its own request when it asked to join.
    setGroupMembership(GROUP, 'pending');
    upsertJoinRequest(GROUP, { fingerprint: ME });

    const applied = applyJoinPayload(
      { type: 'group_join_response', groupId: GROUP, fingerprint: ME, approved: true },
      { localFingerprint: ME },
    );

    expect(applied).toMatchObject({ kind: 'response', approved: true });
    expect(getGroupMembership(GROUP)).toBe('member');
    expect(loadJoinRequests(GROUP)[0]?.status).toBe('approved');
  });

  it('does not apply a decision to a device that never asked', () => {
    expect(
      applyJoinPayload(
        { type: 'group_join_response', groupId: GROUP, fingerprint: ME, approved: true },
        { localFingerprint: ME },
      ),
    ).toBeNull();
    expect(getGroupMembership(GROUP)).toBeNull();

    setGroupMembership(GROUP, 'pending');
    expect(
      applyJoinPayload(
        { type: 'group_join_response', groupId: GROUP, fingerprint: PEER, approved: true },
        { localFingerprint: ME },
      ),
    ).toBeNull();
  });
});
