/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGroupMembership,
  getPendingJoinRequests,
  loadJoinRequests,
  markJoinPending,
  setGroupMembership,
  setJoinRequestStatus,
  upsertJoinRequest,
} from './groupJoinRequests';

describe('group join requests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a request once and keeps its timestamp on updates', () => {
    const [first] = upsertJoinRequest('thailand', { fingerprint: 'nova_pk_bob', name: 'Bob' });
    expect(first).toMatchObject({ fingerprint: 'nova_pk_bob', name: 'Bob', status: 'pending' });

    const after = upsertJoinRequest('thailand', { fingerprint: 'nova_pk_bob', status: 'approved' });
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('approved');
    expect(after[0].createdAt).toBe(first.createdAt);
    expect(after[0].name).toBe('Bob');
  });

  it('lists only pending requests and applies decisions', () => {
    upsertJoinRequest('thailand', { fingerprint: 'nova_pk_bob' });
    upsertJoinRequest('thailand', { fingerprint: 'nova_pk_alice' });
    expect(getPendingJoinRequests('thailand')).toHaveLength(2);

    setJoinRequestStatus('thailand', 'nova_pk_alice', 'rejected');
    expect(getPendingJoinRequests('thailand').map((r) => r.fingerprint)).toEqual(['nova_pk_bob']);
    expect(loadJoinRequests('thailand')[1].status).toBe('rejected');
  });

  it('tracks the local device membership separately from requests', () => {
    expect(getGroupMembership('thailand')).toBeNull();
    markJoinPending('thailand');
    expect(getGroupMembership('thailand')).toBe('pending');
    setGroupMembership('thailand', 'member');
    expect(getGroupMembership('thailand')).toBe('member');
  });

  it('ignores malformed stored entries', () => {
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([{ fingerprint: '' }, { fingerprint: 'nova_pk_ok', status: 'pending' }, 'nope']),
    );
    expect(loadJoinRequests('thailand')).toEqual([
      expect.objectContaining({ fingerprint: 'nova_pk_ok', status: 'pending' }),
    ]);
  });
});
