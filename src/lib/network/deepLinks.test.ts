/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  buildDeepLink,
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

  it('round-trips built links', () => {
    for (const target of [
      { type: 'chat' as const, id: 'katie' },
      { type: 'channel' as const, id: 'channel-kyiv' },
      { type: 'profile' as const, id: 'nova_pk_abc123' },
    ]) {
      expect(parseDeepLink(buildDeepLink(target))).toEqual(target);
    }
  });
});
