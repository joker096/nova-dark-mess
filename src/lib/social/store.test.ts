/// <reference types="vitest/globals" />

import { describe, expect, it } from 'vitest';
import type { ChannelInfo, ChannelPost, Story } from '../../types/messenger';
import {
  STORY_TTL_MS,
  buildChannel,
  buildChannelPost,
  buildStory,
  getStoryFeed,
  isPostScheduled,
  isStoryLive,
  isStoryScheduled,
  searchChannels,
  toggleChannelPopular,
  toggleReactionInPost,
  toggleReactionInStory,
  voteInChannelPoll,
} from './store';

const NOW = new Date(2026, 10, 11, 10, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

const basePost = (overrides: Partial<ChannelPost> = {}): ChannelPost => ({
  id: 'post-1',
  time: '10:00',
  dateKey: 11,
  title: 'Title',
  text: 'Text',
  commentsCount: 0,
  reactions: [],
  channelId: 'channel-1',
  createdAt: NOW,
  ...overrides,
});

describe('social store - stories', () => {
  it('builds a live own story with a 24h expiry', () => {
    const story = buildStory({ coverImage: 'cover', caption: '  hello  ' }, NOW);

    expect(story.coverImage).toBe('cover');
    expect(story.caption).toBe('hello');
    expect(story.isMine).toBe(true);
    expect(story.viewed).toBe(true);
    expect(story.createdAt).toBe(NOW);
    expect(story.expiresAt).toBe(NOW + STORY_TTL_MS);
    expect(story.scheduledFor).toBeUndefined();
    expect(isStoryLive(story, NOW)).toBe(true);
  });

  it('keeps scheduled stories out of the live feed until their publish time', () => {
    const story = buildStory(
      { coverImage: 'cover', scheduledFor: NOW + HOUR },
      NOW,
    );

    expect(isStoryScheduled(story, NOW)).toBe(true);
    expect(isStoryLive(story, NOW)).toBe(false);
    expect(isStoryLive(story, NOW + HOUR + 1)).toBe(true);
  });

  it('adds and removes a reaction on a story', () => {
    const story = buildStory({ coverImage: 'cover' }, NOW);
    const reacted = toggleReactionInStory(story, '❤️');

    expect(reacted.reactions).toEqual([
      { emoji: '❤️', count: 1, userReacted: true },
    ]);

    const unreacted = toggleReactionInStory(reacted, '❤️');
    expect(unreacted.reactions).toEqual([]);
  });

  it('orders own stories first and drops expired entries', () => {
    const mine = buildStory({ coverImage: 'mine' }, NOW);
    const mineScheduled = buildStory(
      { coverImage: 'mine-scheduled', scheduledFor: NOW + HOUR },
      NOW,
    );
    const other: Story = {
      id: 'other',
      name: 'Other',
      avatar: 'avatar',
      coverImage: 'other',
      unreadCount: 1,
      createdAt: NOW - HOUR,
      expiresAt: NOW + HOUR,
    };
    const expired: Story = {
      id: 'expired',
      name: 'Expired',
      avatar: 'avatar',
      coverImage: 'expired',
      unreadCount: 0,
      createdAt: NOW - STORY_TTL_MS - HOUR,
      expiresAt: NOW - HOUR,
    };

    const feed = getStoryFeed([other, expired, mine, mineScheduled], NOW);

    expect(feed.map((story) => story.id)).toEqual([
      mine.id,
      mineScheduled.id,
      other.id,
    ]);
  });
});

describe('social store - channel posts', () => {
  it('builds a scheduled post with formatted time and channel metadata', () => {
    const scheduledFor = new Date(2026, 10, 12, 18, 30, 0).getTime();
    const post = buildChannelPost(
      'channel-1',
      {
        title: '  City update  ',
        text: '  Details  ',
        scheduledFor,
      },
      NOW,
    );

    expect(post.channelId).toBe('channel-1');
    expect(post.title).toBe('City update');
    expect(post.text).toBe('Details');
    expect(post.time).toBe('18:30');
    expect(post.dateKey).toBe(12);
    expect(post.createdAt).toBe(scheduledFor);
    expect(post.scheduledFor).toBe(scheduledFor);
    expect(isPostScheduled(post, NOW)).toBe(true);
    expect(isPostScheduled(post, scheduledFor + 1)).toBe(false);
  });

  it('keeps the poll and sticker attached to a new post', () => {
    const poll = {
      id: 'poll-1',
      question: 'Where to meet?',
      options: [
        { id: 'opt-1', text: 'Khreshchatyk', votes: 0, votedByMe: false },
        { id: 'opt-2', text: 'Podil', votes: 0, votedByMe: false },
      ],
      totalVotes: 0,
      isAnonymous: true,
      allowsMultiple: false,
      isQuiz: false,
    };
    const sticker = {
      id: 'test-sticker',
      packId: 'test',
      packName: 'Test Pack',
      name: 'Test Sticker',
      emoji: '🐱',
    };

    const post = buildChannelPost(
      'channel-1',
      { title: 'Weekend plans', text: '', poll, sticker },
      NOW,
    );

    expect(post.poll).toEqual(poll);
    expect(post.sticker).toEqual(sticker);
  });

  it('records a poll vote and clears it on retract', () => {
    const post = basePost({
      poll: {
        id: 'poll-1',
        question: 'Where to meet?',
        options: [
          { id: 'opt-1', text: 'Khreshchatyk', votes: 0, votedByMe: false },
          { id: 'opt-2', text: 'Podil', votes: 0, votedByMe: false },
        ],
        totalVotes: 0,
        isAnonymous: true,
        allowsMultiple: false,
        isQuiz: false,
      },
    });

    const voted = voteInChannelPoll([post], 'poll-1', 'opt-1')[0];
    expect(voted.poll?.options[0]).toEqual({
      id: 'opt-1',
      text: 'Khreshchatyk',
      votes: 1,
      votedByMe: true,
    });
    expect(voted.poll?.totalVotes).toBe(1);

    const retracted = voteInChannelPoll([voted], 'poll-1', '')[0];
    expect(retracted.poll?.options[0].votes).toBe(0);
    expect(retracted.poll?.options[0].votedByMe).toBe(false);
    expect(retracted.poll?.totalVotes).toBe(0);
  });

  it('adds, toggles and removes a reaction', () => {
    const added = toggleReactionInPost(basePost(), '🔥');
    expect(added.reactions).toEqual([
      { emoji: '🔥', count: 1, userReacted: true },
    ]);

    const removed = toggleReactionInPost(added, '🔥');
    expect(removed.reactions).toEqual([]);
  });

  it('increments an existing reaction from another user', () => {
    const post = basePost({
      reactions: [{ emoji: '❤️', count: 4, userReacted: false }],
    });

    const updated = toggleReactionInPost(post, '❤️');

    expect(updated.reactions).toEqual([
      { emoji: '❤️', count: 5, userReacted: true },
    ]);
  });
});

describe('social store - channel popular & search', () => {
  const CHANNELS: ChannelInfo[] = [
    {
      id: 'ch-1',
      name: 'Real Kyiv Life',
      description: 'City news',
      subscribers: 100,
      createdAt: 0,
      isPopular: true,
    },
    {
      id: 'ch-2',
      name: 'Tech News',
      description: 'Technology updates',
      subscribers: 50,
      createdAt: 1,
      isPopular: false,
    },
    {
      id: 'ch-3',
      name: 'Cooking Club',
      description: 'Recipes and food',
      subscribers: 30,
      createdAt: 2,
      isPopular: false,
    },
  ];

  it('toggles isPopular flag on a channel', () => {
    const toggledOn = toggleChannelPopular('ch-2', CHANNELS);
    const ch2 = toggledOn.find((c) => c.id === 'ch-2');
    expect(ch2?.isPopular).toBe(true);

    const toggledOff = toggleChannelPopular('ch-1', CHANNELS);
    const ch1 = toggledOff.find((c) => c.id === 'ch-1');
    expect(ch1?.isPopular).toBe(false);
  });

  it('does not mutate original channels array', () => {
    toggleChannelPopular('ch-2', CHANNELS);
    expect(CHANNELS.find((c) => c.id === 'ch-2')?.isPopular).toBe(false);
  });

  it('searches channels by name', () => {
    const results = searchChannels('tech', CHANNELS);
    expect(results.map((c) => c.id)).toEqual(['ch-2']);
  });

  it('searches channels by description', () => {
    const results = searchChannels('recipes', CHANNELS);
    expect(results.map((c) => c.id)).toEqual(['ch-3']);
  });

  it('search is case-insensitive', () => {
    const results = searchChannels('KYIV', CHANNELS);
    expect(results.map((c) => c.id)).toEqual(['ch-1']);
  });

  it('returns all channels for empty query', () => {
    const results = searchChannels('', CHANNELS);
    expect(results).toHaveLength(3);
  });

  it('buildChannel marks isPopular from draft', () => {
    const channel = buildChannel(
      { name: 'Popular Channel', isPopular: true },
      1000,
    );
    expect(channel.isPopular).toBe(true);
    expect(channel.id).toMatch(/^channel-1000-/);

    const notPopular = buildChannel({ name: 'Normal Channel' }, 2000);
    expect(notPopular.isPopular).toBe(false);
  });

  it('buildChannel creates a public channel by default', () => {
    const channel = buildChannel({ name: 'Public Channel' }, 3000);
    expect(channel.visibility).toBe('public');
    expect(channel.inviteCode).toBeUndefined();
  });

  it('buildChannel generates an invite code for private channels', () => {
    const channel = buildChannel(
      { name: 'Secret Channel', visibility: 'private' },
      4000,
    );
    expect(channel.visibility).toBe('private');
    expect(channel.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
  });
});
