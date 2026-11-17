import { describe, it, expect } from 'vitest';
import { createInviteToken, isInviteToken } from './spam';

describe('one-time invite tokens', () => {
  it('creates structurally valid tokens', () => {
    const token = createInviteToken();
    expect(isInviteToken(token)).toBe(true);
    expect(isInviteToken(createInviteToken())).toBe(true);
  });

  it('never repeats a token', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(createInviteToken());
    expect(seen.size).toBe(100);
  });

  it('rejects malformed tokens', () => {
    expect(isInviteToken(undefined)).toBe(false);
    expect(isInviteToken(null)).toBe(false);
    expect(isInviteToken(42)).toBe(false);
    expect(isInviteToken('')).toBe(false);
    // Wrong byte length (not 32 bytes).
    // Wrong byte length (not 32 bytes): 32 bytes = 43 base64url chars when the
    // final byte is fully encoded, or 44 with padding chars.
    expect(isInviteToken('short')).toBe(false);
    expect(isInviteToken('A'.repeat(43))).toBe(true);
    // Invalid base64url characters (fails regex or atob).
    expect(isInviteToken('!!!!invalid@chars####')).toBe(false);
    expect(isInviteToken('AB/CD+EF')).toBe(false);
  });
});
