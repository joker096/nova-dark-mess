import {
  CURRENT_USER,
  MOCK_CHANNEL_POSTS,
  MOCK_STORIES,
} from '../../data/mockMessengerData';
import type {
  ChannelDraft,
  ChannelInfo,
  ChannelPost,
  ChannelPostDraft,
  PollData,
  Story,
  StoryDraft,
} from '../../types/messenger';

export const STORIES_STORAGE_KEY = 'nova_stories_v1';
export const CHANNELS_STORAGE_KEY = 'nova_channels_v1';
export const CHANNEL_POSTS_STORAGE_KEY = 'nova_channel_posts_v1';
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const KYIV_CHANNEL_ID = 'kyiv-channel';

export interface SocialState {
  stories: Story[];
  channels: ChannelInfo[];
  posts: ChannelPost[];
}

export function startOfDay(value: number | Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dayKey(value: number | Date): number {
  return startOfDay(value).getTime();
}

export function isSameDay(a: number | Date, b: number | Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function formatTimeOfDay(value: number | Date): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function createDefaultChannel(): ChannelInfo {
  return {
    id: KYIV_CHANNEL_ID,
    name: 'Real Kyiv Life',
    description: 'Daily stories, photos and city news from Kyiv.',
    avatar: 'ukraine_trident',
    coverImage: 'https://picsum.photos/seed/kyiv-channel/1200/400',
    subscribers: 3495530,
    createdAt: Date.now(),
    isOwned: false,
    isPopular: true,
    soundEnabled: false,
  };
}

function seedStories(now: number): Story[] {
  return MOCK_STORIES.map((story, index) => {
    const createdAt = now - (index + 1) * 45 * 60 * 1000;
    return {
      ...story,
      createdAt,
      expiresAt: createdAt + STORY_TTL_MS,
      viewed: false,
      isMine: false,
    };
  });
}

function seedPosts(now: number): ChannelPost[] {
  const today = startOfDay(now);
  return MOCK_CHANNEL_POSTS.map((post) => {
    const postDate = new Date(today);
    if (post.dateKey !== new Date(now).getDate()) {
      postDate.setDate(postDate.getDate() - 1);
    }
    const [hours, minutes] = post.time.split(':').map(Number);
    postDate.setHours(hours, minutes, 0, 0);
    return {
      ...post,
      channelId: KYIV_CHANNEL_ID,
      createdAt: postDate.getTime(),
      dateKey: postDate.getDate(),
      authorName: 'Real Kyiv Life',
    };
  });
}

function readJson<T>(key: string): T | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    void 0;
  }
}

export function loadSocialState(): SocialState {
  const now = Date.now();

  let stories = readJson<Story[]>(STORIES_STORAGE_KEY);
  if (!Array.isArray(stories)) {
    stories = seedStories(now);
    writeJson(STORIES_STORAGE_KEY, stories);
  }

  let channels = readJson<ChannelInfo[]>(CHANNELS_STORAGE_KEY);
  if (!Array.isArray(channels) || channels.length === 0) {
    channels = [createDefaultChannel()];
    writeJson(CHANNELS_STORAGE_KEY, channels);
  } else if (!channels.some((channel) => channel.id === KYIV_CHANNEL_ID)) {
    channels = [createDefaultChannel(), ...channels];
    writeJson(CHANNELS_STORAGE_KEY, channels);
  }

  let posts = readJson<ChannelPost[]>(CHANNEL_POSTS_STORAGE_KEY);
  if (!Array.isArray(posts)) {
    posts = seedPosts(now);
    writeJson(CHANNEL_POSTS_STORAGE_KEY, posts);
  }

  return { stories, channels, posts };
}

export function saveStories(stories: Story[]): void {
  writeJson(STORIES_STORAGE_KEY, stories);
}

export function saveChannels(channels: ChannelInfo[]): void {
  writeJson(CHANNELS_STORAGE_KEY, channels);
}

export function saveChannelPosts(posts: ChannelPost[]): void {
  writeJson(CHANNEL_POSTS_STORAGE_KEY, posts);
}

export function storyPublishAt(story: Story): number | undefined {
  return story.scheduledFor ?? story.createdAt;
}

export function isStoryScheduled(story: Story, now: number): boolean {
  return typeof story.scheduledFor === 'number' && story.scheduledFor > now;
}

export function isStoryExpired(story: Story, now: number): boolean {
  if (typeof story.expiresAt === 'number') {
    return story.expiresAt <= now;
  }
  const publishAt = storyPublishAt(story);
  return typeof publishAt === 'number' ? publishAt + STORY_TTL_MS <= now : false;
}

export function isStoryLive(story: Story, now: number): boolean {
  if (isStoryScheduled(story, now) || isStoryExpired(story, now)) {
    return false;
  }
  const publishAt = storyPublishAt(story);
  return typeof publishAt === 'number' ? publishAt <= now : true;
}

export function isPostScheduled(post: ChannelPost, now: number): boolean {
  return typeof post.scheduledFor === 'number' && post.scheduledFor > now;
}

export function getStoryFeed(stories: Story[], now: number): Story[] {
  const visible = stories.filter(
    (story) => isStoryLive(story, now) || isStoryScheduled(story, now),
  );
  const mine = visible.filter((story) => story.isMine);
  const others = visible.filter((story) => !story.isMine);
  return [...mine, ...others];
}

export function buildStory(draft: StoryDraft, now = Date.now()): Story {
  const publishAt = draft.scheduledFor ?? now;
  return {
    id: `story-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: CURRENT_USER.name,
    avatar: CURRENT_USER.avatar,
    coverImage: draft.coverImage,
    unreadCount: 0,
    caption: draft.caption?.trim() || undefined,
    createdAt: publishAt,
    expiresAt: publishAt + STORY_TTL_MS,
    scheduledFor: draft.scheduledFor,
    viewed: true,
    isMine: true,
  };
}

export function buildChannel(draft: ChannelDraft, now = Date.now()): ChannelInfo {
  return {
    id: `channel-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    avatar: draft.avatar,
    coverImage: draft.coverImage,
    isPopular: draft.isPopular === true,
    subscribers: 1,
    createdAt: now,
    isOwned: true,
    soundEnabled: true,
  };
}

export function buildChannelPost(
  channelId: string,
  draft: ChannelPostDraft,
  now = Date.now(),
): ChannelPost {
  const publishAt = draft.scheduledFor ?? now;
  const publishDate = new Date(publishAt);
  return {
    id: `post-${now}-${Math.random().toString(36).slice(2, 8)}`,
    channelId,
    time: formatTimeOfDay(publishDate),
    dateKey: publishDate.getDate(),
    title: draft.title.trim(),
    text: draft.text.trim(),
    image: draft.image,
    commentsCount: 0,
    reactions: [],
    createdAt: publishAt,
    scheduledFor: draft.scheduledFor,
    authorName: CURRENT_USER.name,
    poll: draft.poll,
    sticker: draft.sticker,
  };
}

type ReactionState = {
  emoji: string;
  count: number;
  userReacted?: boolean;
};

function toggleReactionState(reactions: ReactionState[], emoji: string): ReactionState[] {
  const existing = reactions.find((reaction) => reaction.emoji === emoji);

  if (!existing) {
    return [...reactions, { emoji, count: 1, userReacted: true }];
  }

  if (existing.userReacted) {
    const nextCount = Math.max(0, existing.count - 1);
    return nextCount > 0
      ? reactions.map((reaction) =>
          reaction.emoji === emoji
            ? { ...reaction, count: nextCount, userReacted: false }
            : reaction,
        )
      : reactions.filter((reaction) => reaction.emoji !== emoji);
  }

  return reactions.map((reaction) =>
    reaction.emoji === emoji
      ? { ...reaction, count: reaction.count + 1, userReacted: true }
      : reaction,
  );
}

export function toggleReactionInPost(post: ChannelPost, emoji: string): ChannelPost {
  return {
    ...post,
    reactions: toggleReactionState(post.reactions, emoji),
  };
}

export function voteInPoll(poll: PollData, optionId: string): PollData {
  const options = poll.options.map((option) => {
    if (option.id === optionId) {
      const voted = !option.votedByMe;
      return {
        ...option,
        votedByMe: voted,
        votes: voted ? option.votes + 1 : Math.max(0, option.votes - 1),
      };
    }
    if (!poll.allowsMultiple && option.votedByMe) {
      return { ...option, votedByMe: false, votes: Math.max(0, option.votes - 1) };
    }
    return option;
  });

  return {
    ...poll,
    options,
    totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
  };
}

export function voteInChannelPoll(
  posts: ChannelPost[],
  pollId: string,
  optionId: string,
): ChannelPost[] {
  return posts.map((post) =>
    post.poll && post.poll.id === pollId
      ? { ...post, poll: voteInPoll(post.poll, optionId) }
      : post,
  );
}

export function toggleReactionInStory(story: Story, emoji: string): Story {
  return {
    ...story,
    reactions: toggleReactionState(story.reactions ?? [], emoji),
  };
}

export function toggleChannelPopular(channelId: string, channels: ChannelInfo[]): ChannelInfo[] {
  return channels.map((channel) =>
    channel.id === channelId ? { ...channel, isPopular: !channel.isPopular } : channel,
  );
}

export function searchChannels(query: string, channels: ChannelInfo[]): ChannelInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return channels;
  return channels.filter(
    (channel) =>
      channel.name.toLowerCase().includes(q) ||
      channel.description?.toLowerCase().includes(q),
  );
}
