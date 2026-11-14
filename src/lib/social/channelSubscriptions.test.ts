/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it } from 'vitest';
import { isSubscribed, setSubscribed } from './channelSubscriptions';

describe('channel subscriptions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats every channel as subscribed until the user leaves', () => {
    expect(isSubscribed('kyiv')).toBe(true);
  });

  it('remembers an unsubscribe and a re-subscribe', () => {
    setSubscribed('kyiv', false);
    expect(isSubscribed('kyiv')).toBe(false);
    expect(isSubscribed('other')).toBe(true);

    setSubscribed('kyiv', true);
    expect(isSubscribed('kyiv')).toBe(true);
  });

  it('ignores a corrupted storage entry', () => {
    localStorage.setItem('nova.channel.subscriptions', '{not json');
    expect(isSubscribed('kyiv')).toBe(true);
  });
});
