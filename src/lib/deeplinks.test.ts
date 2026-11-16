import { describe, expect, it } from 'vitest';
import {
  NOVA_INVITE_HOST,
  NOVA_SCHEME,
  type NovaInvite,
  createInviteUrl,
  isNovaDeepLink,
  parseInviteUrl,
} from './deeplinks';

const baseInvite: NovaInvite = { fingerprint: 'nova_pk_abc123' };

describe('createInviteUrl', () => {
  it('builds a minimal nova:// invite with only a fingerprint', () => {
    expect(createInviteUrl(baseInvite)).toBe('nova://invite?fp=nova_pk_abc123');
  });

  it('includes handle, chat id and nonce when present', () => {
    const url = createInviteUrl({
      fingerprint: 'fp',
      handle: 'alice',
      chatId: 'c1',
      nonce: 'n-42',
    });
    expect(url).toBe('nova://invite?fp=fp&handle=alice&chat=c1&nonce=n-42');
  });

  it('omits optional fields that are undefined', () => {
    const url = createInviteUrl({ fingerprint: 'fp', handle: undefined });
    expect(url).toBe('nova://invite?fp=fp');
  });

  it('percent-encodes unsafe characters in the values', () => {
    const url = createInviteUrl({ fingerprint: 'fp', handle: 'a b&c=d' });
    expect(url).toBe('nova://invite?fp=fp&handle=a+b%26c%3Dd');
    expect(url).not.toContain(' ');
    expect(parseInviteUrl(url)?.handle).toBe('a b&c=d');
  });

  it('supports the https fallback host', () => {
    expect(createInviteUrl(baseInvite, true)).toBe('https://nova.app/invite?fp=nova_pk_abc123');
  });

  it('keeps the fallback opt-in: default scheme is nova://', () => {
    expect(createInviteUrl(baseInvite).startsWith(`${NOVA_SCHEME}://${NOVA_INVITE_HOST}`)).toBe(true);
  });
});

describe('parseInviteUrl (positive cases)', () => {
  it('round-trips a nova:// invite', () => {
    const invite: NovaInvite = { fingerprint: 'FP', handle: 'bob', chatId: 'chat-9', nonce: 'n' };
    expect(parseInviteUrl(createInviteUrl(invite))).toEqual(invite);
  });

  it('accepts https://nova.app/invite', () => {
    const parsed = parseInviteUrl('https://nova.app/invite?fp=x&handle=y');
    expect(parsed).toEqual({ fingerprint: 'x', handle: 'y', chatId: undefined, nonce: undefined });
  });

  it('accepts http:// and invite.nova.app variants of the fallback host', () => {
    expect(parseInviteUrl('http://nova.app/invite?fp=x')?.fingerprint).toBe('x');
    expect(parseInviteUrl('https://invite.nova.app/invite?fp=x')?.fingerprint).toBe('x');
  });

  it('tolerates surrounding whitespace and trailing slashes', () => {
    expect(parseInviteUrl('  https://nova.app/invite///?fp=x  ')?.fingerprint).toBe('x');
  });

  it('returns only the fingerprint field when optional params are absent', () => {
    expect(parseInviteUrl('nova://invite?fp=solo')).toEqual({
      fingerprint: 'solo',
      handle: undefined,
      chatId: undefined,
      nonce: undefined,
    });
  });
});

describe('parseInviteUrl (negative / edge cases)', () => {
  const invalid: Array<[string, string]> = [
    ['empty string', ''],
    ['whitespace only', '   '],
    ['plain text', 'not a url'],
    ['garbage with separators', ':://???fp='],
    ['wrong scheme https other host', 'https://example.com/invite?fp=x'],
    ['wrong scheme http other path', 'https://nova.app/not-invite?fp=x'],
    ['nova scheme wrong host', 'nova://other?fp=x'],
    ['nova scheme no host', 'nova://?fp=x'],
    ['missing fingerprint', 'nova://invite?handle=a'],
    ['fingerprint only in path', 'nova://invite/some-fp'],
  ];

  it.each(invalid)('returns null for %s', (_label, url) => {
    expect(parseInviteUrl(url)).toBeNull();
  });

  it('returns null for an empty-but-present fingerprint', () => {
    expect(parseInviteUrl('nova://invite?fp=')).toBeNull();
  });

  it('never throws on hostile input', () => {
    expect(() => parseInviteUrl('\u0000\u0001\x1b')).not.toThrow();
    expect(parseInviteUrl('\u0000\u0001\x1b')).toBeNull();
  });

  it('does not treat a subdomain of nova.app as trusted', () => {
    expect(parseInviteUrl('https://evil.nova.app/invite?fp=x')).toBeNull();
  });
});

describe('isNovaDeepLink', () => {
  it('is true for valid nova invites and https fallbacks', () => {
    expect(isNovaDeepLink('nova://invite?fp=x')).toBe(true);
    expect(isNovaDeepLink('https://nova.app/invite?fp=x')).toBe(true);
  });

  it('is false for anything that does not parse', () => {
    expect(isNovaDeepLink('')).toBe(false);
    expect(isNovaDeepLink('https://example.com')).toBe(false);
    expect(isNovaDeepLink('nova://other?fp=x')).toBe(false);
    expect(isNovaDeepLink('nova://chat/abc')).toBe(false);
  });

  it('matches the parse result for arbitrary input', () => {
    const samples = ['nova://invite?fp=x', 'junk', 'https://invite.nova.app/invite?fp=y'];
    for (const url of samples) {
      expect(isNovaDeepLink(url)).toBe(parseInviteUrl(url) !== null);
    }
  });
});
