import { describe, it, expect } from 'vitest';
import { createInviteUrl, parseInviteUrl, isNovaDeepLink } from './deeplinks';

describe('deeplinks', () => {
  it('creates and parses nova scheme invite urls', () => {
    const invite = { fingerprint: 'nova_pk_abc', handle: 'alice', chatId: 'c1' };
    const url = createInviteUrl(invite);
    expect(url).toBe('nova://invite?fp=nova_pk_abc&handle=alice&chat=c1');

    const parsed = parseInviteUrl(url);
    expect(parsed).toEqual(invite);
  });

  it('supports https fallback', () => {
    const url = createInviteUrl({ fingerprint: 'fp' }, true);
    expect(url).toContain('https://nova.app/invite');
    expect(parseInviteUrl(url)?.fingerprint).toBe('fp');
  });

  it('rejects invalid urls', () => {
    expect(parseInviteUrl('https://example.com/invite?fp=x')).toBeNull();
    expect(parseInviteUrl('nova://other?fp=x')).toBeNull();
    expect(parseInviteUrl('not a url')).toBeNull();
    expect(isNovaDeepLink('nova://invite?fp=x')).toBe(true);
    expect(isNovaDeepLink('https://example.com')).toBe(false);
  });
});
