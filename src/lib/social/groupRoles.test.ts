import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureGroupRoles,
  getMemberRole,
  isGroupAdmin,
  loadGroupRoles,
  mergeGroupRoles,
  removeMemberRole,
  setMemberRole,
} from './groupRoles';

describe('group roles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds the local device as admin on first open and reuses that afterwards', () => {
    const seeded = ensureGroupRoles('thailand', 'nova_pk_me');
    expect(seeded).toEqual({ nova_pk_me: 'admin' });
    expect(isGroupAdmin(seeded, 'nova_pk_me')).toBe(true);

    setMemberRole('thailand', 'nova_pk_bob', 'member');
    expect(ensureGroupRoles('thailand', 'nova_pk_me')).toEqual({
      nova_pk_me: 'admin',
      nova_pk_bob: 'member',
    });
  });

  it('does not overwrite an existing roster when the local device is missing from it', () => {
    setMemberRole('thailand', 'nova_pk_bob', 'admin');
    const roles = ensureGroupRoles('thailand', 'nova_pk_me');

    expect(roles).toEqual({ nova_pk_bob: 'admin' });
    expect(isGroupAdmin(roles, 'nova_pk_me')).toBe(false);
  });

  it('promotes, demotes and removes members', () => {
    setMemberRole('thailand', 'nova_pk_bob', 'admin');
    expect(getMemberRole(loadGroupRoles('thailand'), 'nova_pk_bob')).toBe('admin');

    setMemberRole('thailand', 'nova_pk_bob', 'member');
    expect(getMemberRole(loadGroupRoles('thailand'), 'nova_pk_bob')).toBe('member');

    removeMemberRole('thailand', 'nova_pk_bob');
    expect(loadGroupRoles('thailand')).toEqual({});
  });

  it('ignores corrupt storage and unknown roles', () => {
    localStorage.setItem('nova_group_roles_thailand', 'not json');
    expect(loadGroupRoles('thailand')).toEqual({});

    localStorage.setItem(
      'nova_group_roles_thailand',
      JSON.stringify({ a: 'admin', b: 'owner', c: 7 }),
    );
    expect(loadGroupRoles('thailand')).toEqual({ a: 'admin' });
  });

  it('merges roles synced from another device and persists the result', () => {
    setMemberRole('thailand', 'nova_pk_me', 'admin');

    const merged = mergeGroupRoles('thailand', loadGroupRoles('thailand'), {
      nova_pk_bob: 'admin',
      nova_pk_me: 'member',
      nova_pk_ghost: 'owner',
    });

    expect(merged).toEqual({ nova_pk_me: 'member', nova_pk_bob: 'admin' });
    expect(loadGroupRoles('thailand')).toEqual(merged);
  });

  it('keeps local-only members when a remote map arrives', () => {
    setMemberRole('thailand', 'nova_pk_me', 'admin');
    setMemberRole('thailand', 'nova_pk_alice', 'member');

    const merged = mergeGroupRoles('thailand', loadGroupRoles('thailand'), {
      nova_pk_bob: 'admin',
    });

    expect(merged).toEqual({
      nova_pk_me: 'admin',
      nova_pk_alice: 'member',
      nova_pk_bob: 'admin',
    });
  });

  it('treats unknown members and empty fingerprints as plain members', () => {
    const roles = { nova_pk_me: 'admin' as const };
    expect(getMemberRole(roles, 'nova_pk_ghost')).toBe('member');
    expect(isGroupAdmin(roles, null)).toBe(false);
  });
});
