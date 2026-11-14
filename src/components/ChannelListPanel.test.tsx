/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChannelInfo } from '../types/messenger';
import { ChannelListPanel } from './ChannelListPanel';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, options?: { value?: string }) => {
      if (key === 'channel.subscribersCompact')
        return `${options?.value ?? ''} subscribers`;
      if (key === 'channel.searchChannels') return 'Search channels...';
      if (key === 'channel.popular') return 'Popular channels';
      if (key === 'channel.following') return 'Following';
      if (key === 'channel.recommended') return 'Recommended';
      if (key === 'channel.addPopular') return 'Add to popular';
      if (key === 'channel.removePopular') return 'Remove from popular';
      if (key === 'channel.noSearchResults') return 'No matching channels';
      if (key === 'channel.noSearchResultsSubtitle')
        return 'Try a different search term.';
      return key;
    },
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const CHANNELS: ChannelInfo[] = [
  {
    id: 'kyiv-channel',
    name: 'Real Kyiv Life',
    description: 'City updates',
    subscribers: 3495530,
    createdAt: 0,
    isPopular: true,
  },
  {
    id: 'my-channel',
    name: 'My Channel',
    subscribers: 12,
    createdAt: 1,
    isOwned: true,
  },
  {
    id: 'tech-channel',
    name: 'Tech News',
    description: 'Technology and gadgets',
    subscribers: 100,
    createdAt: 2,
    isPopular: false,
  },
];

describe('ChannelListPanel', () => {
  it('renders only channels and marks the active one', () => {
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('Real Kyiv Life')).toBeInTheDocument();
    expect(screen.getByText('My Channel')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /My Channel/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: /Real Kyiv Life/ }),
    ).not.toHaveAttribute('aria-current');
  });

  it('selects a channel from the list', () => {
    const onSelectChannel = vi.fn();
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={onSelectChannel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Real Kyiv Life/ }));

    expect(onSelectChannel).toHaveBeenCalledWith('kyiv-channel');
  });

  it('renders recommended channels section with star badge', () => {
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Real Kyiv Life')).toBeInTheDocument();
    // Popular channel has a filled star (aria-label + fill class)
    const stars = screen.getAllByLabelText('Popular channels');
    const filledStar = stars.find((el) =>
      el.getAttribute('class')?.includes('fill-'),
    );
    expect(filledStar).toBeTruthy();
  });

  it('toggles popular status on star click', () => {
    const onTogglePopular = vi.fn();
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
        onTogglePopular={onTogglePopular}
      />,
    );

    // Tech channel is not popular - aria-label "Add to popular"
    const allStars = screen.getAllByLabelText('Add to popular');
    fireEvent.click(allStars[0]);

    expect(onTogglePopular).toHaveBeenCalledWith('tech-channel');
  });

  it('filters channels by search query (including popular)', () => {
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search channels...');
    fireEvent.change(searchInput, { target: { value: 'Tech' } });

    expect(screen.getByText('Tech News')).toBeInTheDocument();
    expect(screen.queryByText('Real Kyiv Life')).not.toBeInTheDocument();
    expect(screen.queryByText('My Channel')).not.toBeInTheDocument();
  });

  it('shows no results message when search matches nothing', () => {
    render(
      <ChannelListPanel
        channels={CHANNELS}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search channels...');
    fireEvent.change(searchInput, { target: { value: 'ZZZ' } });

    expect(screen.getByText('No matching channels')).toBeInTheDocument();
  });

  it('keeps private channels out of the public list and shows them separately', () => {
    const privateChannel: ChannelInfo = {
      id: 'secret-channel',
      name: 'Secret Club',
      subscribers: 3,
      createdAt: 3,
      isOwned: true,
      visibility: 'private',
      inviteCode: 'ABC123',
    };

    render(
      <ChannelListPanel
        channels={[...CHANNELS, privateChannel]}
        activeChannelId="my-channel"
        onSelectChannel={vi.fn()}
      />,
    );

    expect(screen.getByText('channel.privateChannels')).toBeInTheDocument();
    expect(screen.getByText('Secret Club')).toBeInTheDocument();
    expect(screen.queryByText('channel.inviteCode')).toBeInTheDocument();
  });
});
