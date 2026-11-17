/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ChannelScreen } from './ChannelScreen';
import { clearLocalAdPrefs } from '../lib/ads/localAds';
import type { ChannelInfo, ChannelPost } from '../types/messenger';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

// Premium grants every sold feature, including `ads_free`, so the ads slot is
// the only thing that changes between the two states below.
const premiumState = vi.hoisted(() => ({ active: false }));

vi.mock('../hooks/usePremium', () => ({
  usePremium: () => ({
    premium: premiumState.active,
    loading: false,
    checkout: vi.fn(),
    canUse: () => premiumState.active,
    freeDaysRemaining: () => 0,
    minSubscriptionCost: 390,
  }),
}));

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

const channel: ChannelInfo = {
  id: 'test-channel',
  name: 'Test channel',
  subscribers: 1200,
  createdAt: NOW - 30 * 24 * 60 * 60 * 1000,
  isOwned: false,
  visibility: 'public',
};

const posts: ChannelPost[] = Array.from({ length: 5 }, (_, index) => ({
  id: `post-${index + 1}`,
  time: `1${index}:00`,
  dateKey: 16,
  title: `Post ${index + 1}`,
  text: `Body ${index + 1}`,
  commentsCount: 0,
  reactions: [],
  channelId: channel.id,
  createdAt: NOW - index * 60_000,
}));

describe('ChannelScreen sponsored slot', () => {
  beforeEach(() => {
    premiumState.active = false;
    localStorage.clear();
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  it('places one native ad after the first posts, not in the first card', () => {
    render(
      <ChannelScreen
        onBack={() => {}}
        channelId={channel.id}
        channels={[channel]}
        posts={posts}
        now={NOW}
      />,
    );

    expect(screen.getByTestId('sponsored-post-card')).toBeTruthy();
    expect(screen.getByTestId('channel-sponsored-slot')).toBeTruthy();
    expect(screen.getByText('ads.nativeLabel')).toBeTruthy();
  });

  it('hides the sponsored slot for Premium subscribers', () => {
    premiumState.active = true;
    render(
      <ChannelScreen
        onBack={() => {}}
        channelId={channel.id}
        channels={[channel]}
        posts={posts}
        now={NOW}
      />,
    );

    expect(screen.queryByTestId('channel-sponsored-slot')).toBeNull();
    expect(screen.queryByTestId('sponsored-post-card')).toBeNull();
    expect(screen.queryByText('ads.nativeLabel')).toBeNull();
    // The feed itself must stay untouched without ads.
    expect(screen.getByText('Post 1')).toBeTruthy();
    expect(screen.getByText('Post 5')).toBeTruthy();
  });

  it('restores the slot after local ad preferences are reset', async () => {
    localStorage.setItem('nova_ads_dismissed_v1', JSON.stringify(['cmp_demo_auralis_001']));
    render(
      <ChannelScreen
        onBack={() => {}}
        channelId={channel.id}
        channels={[channel]}
        posts={posts}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId('channel-sponsored-slot')).toBeNull();

    act(() => clearLocalAdPrefs());

    await waitFor(() => expect(screen.getByTestId('channel-sponsored-slot')).toBeTruthy());
  });
});
