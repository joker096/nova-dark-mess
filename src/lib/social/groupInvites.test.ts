import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildGroupInviteLink,
  getOrCreateGroupInvite,
  loadGroupInviteToken,
  regenerateGroupInviteToken,
} from './groupInvites';

describe('group invites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints and reuses one persisted token per group', () => {
    const first = getOrCreateGroupInvite('thailand');
    const second = getOrCreateGroupInvite('thailand');

    expect(first.token).toMatch(/^[a-f0-9]{24}$/);
    expect(second.token).toBe(first.token);
    expect(loadGroupInviteToken('thailand')).toBe(first.token);
    expect(first.link).toBe(`nova://chat/thailand?invite=${first.token}`);
  });

  it('keeps tokens separate for different groups', () => {
    const a = getOrCreateGroupInvite('thailand');
    const b = getOrCreateGroupInvite('iceland');

    expect(a.token).not.toBe(b.token);
  });

  it('regenerating replaces the stored token and the link follows it', () => {
    const original = getOrCreateGroupInvite('thailand');
    const next = regenerateGroupInviteToken('thailand');

    expect(next).not.toBe(original.token);
    expect(loadGroupInviteToken('thailand')).toBe(next);
    expect(getOrCreateGroupInvite('thailand').link).toBe(buildGroupInviteLink('thailand', next));
    expect(original.link).not.toContain(next);
  });

  it('refuses to mint a token when no CSPRNG is available', () => {
    vi.stubGlobal('crypto', {});
    try {
      expect(() => getOrCreateGroupInvite('thailand')).toThrow(
        'Secure random generator is unavailable',
      );
    } finally {
      vi.unstubAllGlobals();
    }
    expect(getOrCreateGroupInvite('thailand').token).toMatch(/^[a-f0-9]{24}$/);
  });

  it('encodes ids and tokens in the link', () => {
    expect(buildGroupInviteLink('a b', 'tok')).toBe('nova://chat/a%20b?invite=tok');
  });
});
