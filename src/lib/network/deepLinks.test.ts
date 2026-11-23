/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  buildDeepLink,
  buildContactInviteUrl,
  parseDeepLink,
  parseDeepLinkFromHash,
} from './deepLinks';
import { DeviceLinkManager, encodeDeviceLinkOffer } from '../p2p/deviceLinking';

describe('parseDeepLink', () => {
  it('parses chat, channel and profile links', () => {
    expect(parseDeepLink('nova://chat/katie')).toEqual({ type: 'chat', id: 'katie' });
    expect(parseDeepLink('nova://channel/channel-kyiv')).toEqual({
      type: 'channel',
      id: 'channel-kyiv',
    });
    expect(parseDeepLink('nova://profile/kurt')).toEqual({ type: 'profile', id: 'kurt' });
  });

  it('parses and builds contact invitation links', () => {
    const target = { type: 'contact-invite' as const, code: 'eyJ2IjoxfQ' };
    const link = buildDeepLink(target);

    expect(link).toBe('nova://contact/eyJ2IjoxfQ');
    expect(parseDeepLink(link)).toEqual(target);
    expect(parseDeepLinkFromHash(`#${link}`)).toEqual(target);
    expect(buildContactInviteUrl(target.code, 'https://mess.cvr.name')).toBe(
      'https://mess.cvr.name/#nova://contact/eyJ2IjoxfQ',
    );
    expect(parseDeepLink('nova://contact/unsafe?relay=https://example.com')).toBeNull();
    expect(() => buildContactInviteUrl('invalid/code')).toThrow('Contact invite code is invalid.');
    expect(() => buildContactInviteUrl(target.code, 'ftp://localhost:3000')).toThrow(
      'Contact invite links must use HTTPS.',
    );
    expect(buildContactInviteUrl(target.code, 'http://localhost:3000')).toContain(
      'http://localhost:3000/#nova://contact/',
    );
  });

  it('parses the same targets as universal links', () => {
    expect(parseDeepLink('https://nova.app/chat/katie')).toEqual({ type: 'chat', id: 'katie' });
    expect(parseDeepLink('https://nova.app/channel/channel-kyiv/?ref=qr')).toEqual({
      type: 'channel',
      id: 'channel-kyiv',
    });
  });

  it('accepts a valid device-link offer', () => {
    const manager = new DeviceLinkManager();
    const offer = encodeDeviceLinkOffer(manager.createOffer());

    expect(parseDeepLink(offer)).toEqual({ type: 'device-link', url: offer });
  });

  it('parses bot links with optional start payload', () => {
    expect(parseDeepLink('nova://bot/echo')).toEqual({ type: 'bot', id: 'echo', startPayload: undefined });
    expect(parseDeepLink('nova://bot/echo?start=deep')).toEqual({
      type: 'bot',
      id: 'echo',
      startPayload: 'deep',
    });
    expect(parseDeepLink('https://nova.app/bot/echo?start=hello')).toEqual({
      type: 'bot',
      id: 'echo',
      startPayload: 'hello',
    });
  });

  it('rejects foreign, malformed and injected links', () => {
    expect(parseDeepLink('https://example.com/chat/katie')).toBeNull();
    expect(parseDeepLink('nova://settings/toggle')).toBeNull();
    expect(parseDeepLink('nova://chat/')).toBeNull();
    expect(parseDeepLink('nova://chat/../../etc/passwd')).toBeNull();
    // Query parameters never change the target.
    expect(parseDeepLink('nova://chat/me?admin=1&next=nova://profile/katie')).toEqual({
      type: 'chat',
      id: 'me',
    });
    expect(parseDeepLink('nova://device-link?code=ABCDEF')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('not a link')).toBeNull();
  });

  it('reads links out of a page hash', () => {
    expect(parseDeepLinkFromHash('#nova://chat/katie')).toEqual({ type: 'chat', id: 'katie' });
    expect(parseDeepLinkFromHash('#/nova://channel/world')).toEqual({
      type: 'channel',
      id: 'world',
    });
    expect(parseDeepLinkFromHash('')).toBeNull();
    expect(parseDeepLinkFromHash('#')).toBeNull();
  });
});

describe('site handoff deep links', () => {
  it('parses the nova:// scheme with the key in the fragment', () => {
    expect(parseDeepLink('nova://site-handoff/abcd1234efgh5678#keymat1234mat5678')).toEqual({
      type: 'site-handoff',
      token: 'abcd1234efgh5678',
      key: 'keymat1234mat5678',
    });
  });

  it('parses the universal /c/<token> link on the app hosts', () => {
    expect(parseDeepLink('https://nova.app/c/abcd1234efgh5678#keymat1234mat5678')).toEqual({
      type: 'site-handoff',
      token: 'abcd1234efgh5678',
      key: 'keymat1234mat5678',
    });
    expect(parseDeepLink('https://mess.cvr.name/c/abcd1234efgh5678#keymat1234mat5678')).toEqual({
      type: 'site-handoff',
      token: 'abcd1234efgh5678',
      key: 'keymat1234mat5678',
    });
  });

  it('parses the landing-page alias nova://widget-handoff?token=#key', () => {
    expect(
      parseDeepLink('nova://widget-handoff?token=abcd1234efgh5678#keymat1234mat5678')
    ).toEqual({ type: 'site-handoff', token: 'abcd1234efgh5678', key: 'keymat1234mat5678' });
    expect(parseDeepLink('nova://widget-handoff')).toBeNull();
    expect(parseDeepLink('nova://widget-handoff?token=short')).toBeNull();
  });

  it('keeps the key out of the path and rejects bad tokens/hosts', () => {
    expect(parseDeepLink('https://nova.app/c/abcd1234efgh5678?key=keymat1234mat5678')).toEqual({
      type: 'site-handoff',
      token: 'abcd1234efgh5678',
    });
    expect(parseDeepLink('https://nova.app/c/short')).toBeNull();
    expect(parseDeepLink('https://nova.app/c/abcd1234efgh5678#bad key')).toBeNull();
    expect(parseDeepLink('https://evil.example/c/abcd1234efgh5678#keymat1234mat5678')).toBeNull();
  });

  it('builds scheme links that round-trip', () => {
    const built = buildDeepLink({ type: 'site-handoff', token: 'abcd1234efgh5678', key: 'keymat1234mat5678' });
    expect(built).toBe('nova://site-handoff/abcd1234efgh5678');
    expect(parseDeepLink(built)).toEqual({ type: 'site-handoff', token: 'abcd1234efgh5678' });
  });
});

  describe('buildDeepLink', () => {
  it('round-trips built links', () => {
    for (const target of [
      { type: 'chat' as const, id: 'katie' },
      { type: 'channel' as const, id: 'channel-kyiv' },
      { type: 'profile' as const, id: 'nova_pk_abc123' },
      { type: 'channel' as const, id: 'channel-kyiv', postId: 'post-1', comments: true },
      { type: 'channel' as const, id: 'channel-kyiv', postId: 'post-1' },
      { type: 'bot' as const, id: 'echo', startPayload: 'deep' },
      { type: 'bot' as const, id: 'echo' },
    ]) {
      expect(parseDeepLink(buildDeepLink(target))).toEqual(target);
    }
  });

  it('builds bot links', () => {
    expect(buildDeepLink({ type: 'bot', id: 'echo', startPayload: 'deep' })).toBe(
      'nova://bot/echo?start=deep',
    );
    expect(buildDeepLink({ type: 'bot', id: 'echo' })).toBe('nova://bot/echo');
  });

  it('keeps the post a channel link points at', () => {
    expect(parseDeepLink('nova://channel/world?post=post-1&comments=1')).toEqual({
      type: 'channel',
      id: 'world',
      postId: 'post-1',
      comments: true,
    });
    expect(parseDeepLink('https://nova.app/channel/world?post=post-1')).toEqual({
      type: 'channel',
      id: 'world',
      postId: 'post-1',
    });
  });

  it('ignores a malformed post id', () => {
    expect(parseDeepLink('nova://channel/world?post=../../etc/passwd&comments=1')).toEqual({
      type: 'channel',
      id: 'world',
    });
    expect(parseDeepLink('nova://channel/world?post=&comments=1')).toEqual({
      type: 'channel',
      id: 'world',
    });
  });

  it('builds a post link with its comments flag', () => {
    expect(
      buildDeepLink({ type: 'channel', id: 'world', postId: 'post-1', comments: true }),
    ).toBe('nova://channel/world?post=post-1&comments=1');
    expect(buildDeepLink({ type: 'channel', id: 'world', postId: 'post-1' })).toBe(
      'nova://channel/world?post=post-1',
    );
  });
});
