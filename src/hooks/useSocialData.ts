import { useCallback, useEffect, useState } from 'react';
import type {
  ChannelDraft,
  ChannelInfo,
  ChannelComment,
  ChannelPost,
  ChannelPostDraft,
  Story,
  StoryDraft,
} from '../types/messenger';
import {
  buildChannel,
  buildChannelPost,
  buildStory,
  loadSocialState,
  saveChannelPosts,
  saveChannels,
  saveStories,
  searchChannels,
  toggleChannelPopular as toggleChannelPopularStore,
  toggleReactionInPost,
  toggleReactionInStory,
  voteInChannelPoll,
  pinChannelPost,
  unpinChannelPost,
  addChannelAdmin,
  removeChannelAdmin,
  toggleChannelAdmin,
  setChannelDiscussionGroup,
  type SocialState,
} from '../lib/social/store';

const CLOCK_TICK_MS = 30 * 1000;

export function useSocialData() {
  const [state, setState] = useState<SocialState>(loadSocialState);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveStories(state.stories);
  }, [state.stories]);

  useEffect(() => {
    saveChannels(state.channels);
  }, [state.channels]);

  useEffect(() => {
    saveChannelPosts(state.posts);
  }, [state.posts]);

  const createStory = useCallback((draft: StoryDraft): Story => {
    const story = buildStory(draft);
    setState((prev) => ({ ...prev, stories: [story, ...prev.stories] }));
    // A story published right now must be visible immediately, without waiting
    // for the next clock tick (its createdAt is newer than the stale `now`).
    setNow(Date.now());
    return story;
  }, []);

  const deleteStory = useCallback((storyId: string): void => {
    setState((prev) => ({
      ...prev,
      stories: prev.stories.filter((story) => story.id !== storyId),
    }));
  }, []);

  const viewStory = useCallback((storyId: string): void => {
    setState((prev) => {
      const target = prev.stories.find((story) => story.id === storyId);
      if (!target || (target.viewed && target.unreadCount === 0)) {
        return prev;
      }
      return {
        ...prev,
        stories: prev.stories.map((story) =>
          story.id === storyId
            ? { ...story, viewed: true, unreadCount: 0 }
            : story,
        ),
      };
    });
  }, []);

  const toggleStoryReaction = useCallback((storyId: string, emoji: string): void => {
    setState((prev) => ({
      ...prev,
      stories: prev.stories.map((story) =>
        story.id === storyId ? toggleReactionInStory(story, emoji) : story,
      ),
    }));
  }, []);

  const createChannel = useCallback((draft: ChannelDraft): ChannelInfo => {
    const channel = buildChannel(draft);
    setState((prev) => ({ ...prev, channels: [...prev.channels, channel] }));
    return channel;
  }, []);

  const deleteChannel = useCallback((channelId: string): void => {
    setState((prev) => ({
      ...prev,
      channels: prev.channels.filter((channel) => channel.id !== channelId),
      posts: prev.posts.filter((post) => post.channelId !== channelId),
    }));
  }, []);

  const setChannelSound = useCallback((channelId: string, enabled: boolean): void => {
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((channel) =>
        channel.id === channelId ? { ...channel, soundEnabled: enabled } : channel,
      ),
    }));
  }, []);

  const createChannelPost = useCallback(
    (channelId: string, draft: ChannelPostDraft): ChannelPost => {
      const post = buildChannelPost(channelId, draft);
      setState((prev) => ({ ...prev, posts: [post, ...prev.posts] }));
      return post;
    },
    [],
  );

  const voteChannelPoll = useCallback((pollId: string, optionId: string): void => {
    setState((prev) => ({
      ...prev,
      posts: voteInChannelPoll(prev.posts, pollId, optionId),
    }));
  }, []);

  const deleteChannelPost = useCallback((postId: string): void => {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.filter((post) => post.id !== postId),
    }));
  }, []);

  const editChannelPost = useCallback((postId: string, draft: ChannelPostDraft): void => {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              title: draft.title.trim(),
              text: draft.text.trim(),
              image: draft.image,
              poll: draft.poll ?? post.poll,
              sticker: draft.sticker ?? post.sticker,
            }
          : post,
      ),
    }));
  }, []);

  const addChannelComment = useCallback((postId: string, text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((post) => {
        if (post.id !== postId) return post;
        const comment: ChannelComment = {
          id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          postId,
          text: trimmed,
          authorName: 'You',
          createdAt: Date.now(),
        };
        return {
          ...post,
          comments: [...(post.comments ?? []), comment],
          commentsCount: (post.comments?.length ?? post.commentsCount ?? 0) + 1,
        };
      }),
    }));
  }, []);

  const togglePostReaction = useCallback((postId: string, emoji: string): void => {
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((post) =>
        post.id === postId ? toggleReactionInPost(post, emoji) : post,
      ),
    }));
  }, []);

  const pinChannelPostFn = useCallback((postId: string): void => {
    setState((prev) => ({
      ...prev,
      posts: pinChannelPost(prev.posts, postId),
    }));
  }, []);

  const unpinChannelPostFn = useCallback((postId: string): void => {
    setState((prev) => ({
      ...prev,
      posts: unpinChannelPost(prev.posts, postId),
    }));
  }, []);

  const toggleChannelPopular = useCallback(
    (channelId: string): void => {
      setState((prev) => ({
        ...prev,
        channels: toggleChannelPopularStore(channelId, prev.channels),
      }));
    },
    [],
  );

  const toggleChannelSubscriberPrivacy = useCallback((channelId: string, hidden: boolean): void => {
    setState((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) =>
        ch.id === channelId ? { ...ch, hideSubscriberCount: hidden } : ch,
      ),
    }));
  }, []);

  const searchChannelsByQuery = useCallback(
    (query: string): ChannelInfo[] => searchChannels(query, state.channels),
    [state.channels],
  );

  const addChannelAdminFn = useCallback((channelId: string, adminId: string, isOwner = false): void => {
    setState((prev) => ({
      ...prev,
      channels: addChannelAdmin(prev.channels, channelId, adminId, isOwner),
    }));
  }, []);

  const removeChannelAdminFn = useCallback((channelId: string, adminId: string): void => {
    setState((prev) => ({
      ...prev,
      channels: removeChannelAdmin(prev.channels, channelId, adminId),
    }));
  }, []);

  const toggleChannelAdminFn = useCallback((channelId: string, adminId: string, makeAdmin: boolean): void => {
    setState((prev) => ({
      ...prev,
      channels: toggleChannelAdmin(prev.channels, channelId, adminId, makeAdmin),
    }));
  }, []);

  const setChannelDiscussionGroupFn = useCallback((channelId: string, discussionGroupId: string | undefined): void => {
    setState((prev) => ({
      ...prev,
      channels: setChannelDiscussionGroup(prev.channels, channelId, discussionGroupId),
    }));
  }, []);

  return {
    stories: state.stories,
    channels: state.channels,
    posts: state.posts,
    now,
    createStory,
    deleteStory,
    viewStory,
    toggleStoryReaction,
    createChannel,
    deleteChannel,
    setChannelSound,
    createChannelPost,
    voteChannelPoll,
    deleteChannelPost,
    editChannelPost,
    addChannelComment,
    togglePostReaction,
    pinChannelPost: pinChannelPostFn,
    unpinChannelPost: unpinChannelPostFn,
    addChannelAdmin: addChannelAdminFn,
    removeChannelAdmin: removeChannelAdminFn,
    toggleChannelAdmin: toggleChannelAdminFn,
    setChannelDiscussionGroup: setChannelDiscussionGroupFn,
    toggleChannelPopular,
    toggleChannelSubscriberPrivacy,
    searchChannels: searchChannelsByQuery,
  };
}
