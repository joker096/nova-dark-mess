import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Share2,
  Volume2,
  VolumeX,
  MessageCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Bell,
  BellOff,
  Clock,
  Trash2,
  Copy,
  Check,
  Radio,
  MoreVertical,
  SmilePlus,
  PenSquare,
  X,
  Eye,
  EyeOff,
  Lock,
  Bookmark,
  Languages,
  Flag,
  Calendar,
  Pin,
  PinOff,
  UserPlus,
  UserMinus,
  ShieldCheck,
  BarChart3,
  Users,
  Settings as SettingsIcon,
  Crown,
  Heart,
  ZoomIn,
  ZoomOut,
  Download,
  MessagesSquare,
  Play,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { MOCK_CHANNEL_POSTS } from '../data/mockMessengerData';
import { NovaIconButton, NovaMenu, NovaReactionPill, NovaReactionPicker, Avatar } from '../lib/ui';
import { cachedFetch, invalidateCachePrefix } from '../lib/api';
import { isSubscribed, setSubscribed, isNotificationsEnabled, setNotificationsEnabledForChannel } from '../lib/social/channelSubscriptions';
import { buildDeepLink } from '../lib/network/deepLinks';
import { formatCount } from '../lib/ui';
import type {
  ChannelDraft,
  ChannelInfo,
  ChannelPost,
  ChannelPostDraft,
} from '../types/messenger';
import type { AdCampaign } from '../lib/ads/types';
import { DoodleBackground } from './DoodleBackground';
import { useLanguage } from '../context/LanguageContext';
import { usePremium } from '../hooks/usePremium';

import { ChannelSwitcherModal } from './ChannelSwitcherModal';
import { ChannelCreateModal } from './ChannelCreateModal';
import { ChannelPostComposerModal } from './ChannelPostComposerModal';
import { PostCommentsSheet } from './PostCommentsSheet';
import { ReportSheet } from './ReportSheet';
import { SponsoredPostCard } from './SponsoredPostCard';
import { fetchAd, recordImpression } from '../lib/ads/adClient';
import { getDemoCampaign } from '../lib/ads/demoCampaign';
import { LazyMedia } from './LazyMedia';
import {
  AD_PREFS_CHANGED_EVENT,
  isAdDismissed,
  isAdvertiserBlocked,
} from '../lib/ads/localAds';
import type { ReportTarget } from '../types/moderation';
import { PollBubble } from './chat/PollBubble';
import { StickerMedia } from './chat/StickerMedia';
import {
  createDefaultChannel,
  dayKey,
  isPostScheduled,
  startOfDay,
  KYIV_CHANNEL_ID,
} from '../lib/social/store';

interface ChannelScreenProps {
  onBack: () => void;
  channelId?: string;
  channels?: ChannelInfo[];
  posts?: ChannelPost[];
  now?: number;
  onCreateChannel?: (draft: ChannelDraft) => ChannelInfo | void;
  onSelectChannel?: (channelId: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onDeleteChannels?: (channelIds: string[]) => void;
  onCreatePost?: (channelId: string, draft: ChannelPostDraft) => ChannelPost | void;
  onDeletePost?: (postId: string) => void;
  onEditPost?: (postId: string, draft: ChannelPostDraft) => void;
  onAddComment?: (postId: string, text: string) => void;
  onToggleReaction?: (postId: string, emoji: string) => void;
  onToggleSound?: (channelId: string, enabled: boolean) => void;
  onToggleSubscriberPrivacy?: (channelId: string, hidden: boolean) => void;
  onVotePoll?: (pollId: string, optionId: string) => void;
  /** Deep link target: opens the comments of this post on mount. */
  initialCommentsPostId?: string | null;
  /** Fired once the deep-link comments open, so the app can drop the target. */
  onInitialCommentsHandled?: () => void;
  /** Pin/unpin a post in the channel. */
  onPinPost?: (postId: string) => void;
  onUnpinPost?: (postId: string) => void;
  /** Open channel statistics panel. */
  onOpenStats?: () => void;
  /** Open admin management panel. */
  onManageAdmins?: () => void;
  /** Add an admin to the channel. */
  onAddAdmin?: (adminId: string, isOwner?: boolean) => void;
  /** Remove an admin from the channel. */
  onRemoveAdmin?: (adminId: string) => void;
  /** Toggle admin role for a member. */
  onToggleAdmin?: (memberId: string, makeAdmin: boolean) => void;
  /** Set the linked discussion group for the channel. */
  onSetDiscussionGroup?: (discussionGroupId: string | undefined) => void;
}

const POST_REACTIONS = ['❤️', '👍', '🔥', '😂', '😱', '👏', '🥰', '🎉', '😍', '😎', '🙏', '💯', '🤔', '😢', '😡', '🎊', '🍻', '🎁', '👀', '💪'];
const MONTHS = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' },
];
const HEADER_AUTO_COLLAPSE_OFFSET = 64;
const HEADER_SCROLL_DELTA = 12;
const HEADER_MANUAL_GRACE_MS = 700;

export const ChannelScreen: React.FC<ChannelScreenProps> = ({
  onBack,
  channelId,
  channels,
  posts,
  now = Date.now(),
  onCreateChannel,
  onSelectChannel,
  onDeleteChannel,
  onDeleteChannels,
  onCreatePost,
  onDeletePost,
  onEditPost,
  onAddComment,
  onToggleReaction,
  onToggleSound,
  onToggleSubscriberPrivacy,
  onVotePoll,
  initialCommentsPostId,
  onInitialCommentsHandled,
  onPinPost,
  onUnpinPost,
  onOpenStats,
  onManageAdmins,
  onAddAdmin,
  onRemoveAdmin,
  onToggleAdmin,
  onSetDiscussionGroup,
}) => {
  const { t, language } = useLanguage();
  const { checkout, canUse } = usePremium();
  const fallbackChannels = useMemo(() => [createDefaultChannel()], []);
  const availableChannels = channels ?? fallbackChannels;
  const channel = availableChannels.find((item) => item.id === channelId) ?? availableChannels[0];

  const [localPosts, setLocalPosts] = useState<ChannelPost[] | null>(null);
  const sourcePosts = useMemo(() => {
    if (localPosts !== null) return localPosts;
    if (posts !== undefined) return posts;
    return channel?.id === KYIV_CHANNEL_ID ? MOCK_CHANNEL_POSTS : [];
  }, [localPosts, posts, channel?.id]);

  const handleChannelPollVote = (pollId: string, optionId: string) => {
    // Votes go through the store when it is wired up, so they land in
    // localStorage along with the post instead of dying on reload.
    if (onVotePoll) {
      onVotePoll(pollId, optionId);
      return;
    }

    const updateTarget = (prevList: ChannelPost[]) =>
      prevList.map((p) => {
        if (!p.poll || p.poll.id !== pollId) return p;
        const curPoll = p.poll;
        const updatedOptions = curPoll.options.map((opt) => {
          if (opt.id === optionId) {
            const nowVoted = !opt.votedByMe;
            return {
              ...opt,
              votedByMe: nowVoted,
              votes: nowVoted ? opt.votes + 1 : Math.max(0, opt.votes - 1),
            };
          }
          if (!curPoll.allowsMultiple && opt.votedByMe) {
            return {
              ...opt,
              votedByMe: false,
              votes: Math.max(0, opt.votes - 1),
            };
          }
          return opt;
        });
        const total = updatedOptions.reduce((s, o) => s + o.votes, 0);
        return {
          ...p,
          poll: {
            ...curPoll,
            options: updatedOptions,
            totalVotes: total,
          },
        };
      });

    setLocalPosts((prev) => {
      const base = prev ?? (posts ?? (channel?.id === KYIV_CHANNEL_ID ? MOCK_CHANNEL_POSTS : []));
      return updateTarget(base);
    });
  };

  const postCreatedAt = (post: ChannelPost): number => {
    if (typeof post.createdAt === 'number') return post.createdAt;
    const date = startOfDay(now);
    if (post.dateKey !== new Date(now).getDate()) {
      date.setDate(date.getDate() - 1);
    }
    const [hours, minutes] = post.time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  const channelPosts = useMemo(
    () =>
      sourcePosts.filter(
        (post) => (post.channelId ?? KYIV_CHANNEL_ID) === channel?.id,
      ),
    [sourcePosts, channel?.id],
  );

  // Enhanced Statistics computed values
  const totalViews = channelPosts.reduce((acc, post) => acc + (post.views ?? 0), 0);
  const totalReactions = channelPosts.reduce((acc, post) => acc + (post.reactions?.reduce((r, re) => r + re.count, 0) ?? 0), 0);
  const totalComments = channelPosts.reduce((acc, post) => acc + (post.commentsCount ?? 0), 0);
  const totalForwards = channelPosts.reduce((acc, post) => acc + (post.forwardedFrom ? 1 : 0), 0); // Mock: count forwarded posts

  // Mock trends (in real app, would compare with previous period)
  const viewsTrend = { value: '+12.5%', positive: true };
  const subscribersTrend = { value: '+8.2%', positive: true };
  const postsTrend = { value: '+3', positive: true };
  const reactionsTrend = { value: '+15.3%', positive: true };
  const commentsTrend = { value: '+22.1%', positive: true };
  const forwardsTrend = { value: '+5.7%', positive: true };

  // Mock growth data for chart
  const growthData = [
    { label: 'Mon', value: Math.floor(Math.random() * 100) + 50 },
    { label: 'Tue', value: Math.floor(Math.random() * 100) + 60 },
    { label: 'Wed', value: Math.floor(Math.random() * 100) + 70 },
    { label: 'Thu', value: Math.floor(Math.random() * 100) + 65 },
    { label: 'Fri', value: Math.floor(Math.random() * 100) + 80 },
    { label: 'Sat', value: Math.floor(Math.random() * 100) + 75 },
    { label: 'Sun', value: Math.floor(Math.random() * 100) + 90 },
  ];

  // Top posts by engagement
  const topPosts = channelPosts
    .map((post) => ({
      ...post,
      engagement: (post.reactions?.reduce((acc, r) => acc + r.count, 0) ?? 0) + (post.views ?? 0) / 100 + (post.commentsCount ?? 0) * 2,
    }))
    .sort((a, b) => b.engagement - a.engagement);

  // Media items from posts
  const mediaItems = useMemo(() => {
    const items: Array<{ type: 'image' | 'video'; url: string; thumbnail?: string; alt: string }> = [];
    channelPosts.forEach((post) => {
      if (post.image) {
        items.push({ type: 'image', url: post.image, alt: post.title || 'Image' });
      }
      if (post.images) {
        post.images.forEach((img, idx) => {
          items.push({ type: 'image', url: img, alt: `${post.title || 'Image'} ${idx + 1}` });
        });
      }
    });
    return items;
  }, [channelPosts]);

  const latestDay = useMemo(() => {
    const days = channelPosts.map((post) => dayKey(postCreatedAt(post)));
    return days.length > 0 ? Math.max(...days) : dayKey(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelPosts, now]);

  const [selectedDay, setSelectedDay] = useState<number>(latestDay);
  const [focusDate, setFocusDate] = useState<number>(dayKey(startOfDay(now)));
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const dateScrubberRef = useRef<HTMLDivElement>(null);
  const [localSoundEnabled, setLocalSoundEnabled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'photos' | 'videos' | 'links' | 'files'>('all');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [subscribed, setSubscribedState] = useState(() => isSubscribed(channelId));
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => isNotificationsEnabled(channelId));

  // The channel can change without unmounting this screen.
  useEffect(() => {
    setSubscribedState(isSubscribed(channelId));
    setNotificationsEnabled(isNotificationsEnabled(channelId));
  }, [channelId]);

  const toggleSubscription = () => {
    const next = !subscribed;
    setSubscribedState(next);
    setSubscribed(channelId, next);
    showToast(next ? t('channel.subscribed') : t('channel.unsubscribed'));
  };

  const toggleNotifications = () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    setNotificationsEnabledForChannel(channelId, next);
    showToast(next ? t('channel.notificationsEnabled') : t('channel.notificationsDisabled'));
  };
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ChannelPost | null>(null);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const commentTriggerRef = useRef<HTMLElement | null>(null);
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);
  const [, refreshAdPrefs] = useReducer((tick: number) => tick + 1, 0);

  // Settings can reset hidden ads and blocked advertisers without remounting
  // the feed. Clearing the in-session flag and forcing a render lets the slot
  // be evaluated again.
  useEffect(() => {
    const refresh = () => {
      setAdDismissed(false);
      refreshAdPrefs();
    };
    window.addEventListener(AD_PREFS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AD_PREFS_CHANGED_EVENT, refresh);
  }, []);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);
  const [adminsPanelOpen, setAdminsPanelOpen] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  // A deep link can point at one post's comments; jump to its day and open it.
  useEffect(() => {
    if (!initialCommentsPostId) return;
    const target = channelPosts.find((post) => post.id === initialCommentsPostId);
    if (!target) return;
    const key = dayKey(postCreatedAt(target));
    setSelectedDay(key);
    setFocusDate(key);
    setSearchQuery('');
    setSearchOpen(false);
    setCommentingPostId(target.id);
    onInitialCommentsHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCommentsPostId, channelPosts]);

  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const commentingPost = useMemo(
    () =>
      commentingPostId
        ? sourcePosts.find((post) => post.id === commentingPostId) ?? null
        : null,
    [commentingPostId, sourcePosts],
  );
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [mediaScale, setMediaScale] = useState(1);
  const [mediaPosition, setMediaPosition] = useState({ x: 0, y: 0 });
  const toastTimer = useRef<number | null>(null);
  const postsScrollRef = useRef<HTMLDivElement | null>(null);
  const dayHeaderRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastScrollTopRef = useRef(0);
  const lastManualToggleRef = useRef(0);
  const manualCollapsedRef = useRef(false);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const scrollAccumulatorRef = useRef(0);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const mediaTouchStartRef = useRef<{ x: number; y: number; distance: number; scale: number } | null>(null);

  // Helper to detect video URLs (same as ChatScreen)
  const isVideoMediaUrl = (url: string) => /\.(mp4|webm|mov|mkv|m4v|3gp)(\?.*)?$/i.test(url);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
      if (event.key === 'ArrowRight') {
        setLightbox((current) =>
          current && current.index < current.images.length - 1
            ? { ...current, index: current.index + 1 }
            : current,
        );
      }
      if (event.key === 'ArrowLeft') {
        setLightbox((current) =>
          current && current.index > 0 ? { ...current, index: current.index - 1 } : current,
        );
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightbox]);

  useEffect(() => {
    if (!postMenuId) return undefined;
    const closeMenu = () => setPostMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [postMenuId]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchFilter('all');
    setSearchDateFrom('');
    setSearchDateTo('');
  };

  useEffect(() => {
    const scrollNode = postsScrollRef.current;
    if (scrollNode) {
      scrollNode.scrollTop = 0;
    }
    lastScrollTopRef.current = 0;
    manualCollapsedRef.current = false;
    scrollDirectionRef.current = null;
    scrollAccumulatorRef.current = 0;
    try {
      const collapsed =
        localStorage.getItem(`nova.channel.headerCollapsed.${channel?.id ?? ''}`) === '1';
      setHeaderCollapsed(collapsed);
    } catch {
      setHeaderCollapsed(false);
    }
  }, [channel?.id]);

  const toggleHeader = () => {
    const nextCollapsed = !headerCollapsed;
    lastManualToggleRef.current = Date.now();
    manualCollapsedRef.current = nextCollapsed;
    scrollDirectionRef.current = null;
    scrollAccumulatorRef.current = 0;
    setHeaderCollapsed(nextCollapsed);
    try {
      localStorage.setItem(
        `nova.channel.headerCollapsed.${channel?.id ?? ''}`,
        nextCollapsed ? '1' : '0',
      );
    } catch {
      // ignore storage errors
    }
    setPostMenuId(null);
  };

  const handlePostsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setShowJumpToLatest(scrollTop > 300);
    const delta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    if (Date.now() - lastManualToggleRef.current < HEADER_MANUAL_GRACE_MS) {
      return;
    }

    if (delta === 0) {
      return;
    }

    const direction = delta > 0 ? 'down' : 'up';
    if (direction !== scrollDirectionRef.current) {
      scrollDirectionRef.current = direction;
      scrollAccumulatorRef.current = 0;
    }
    scrollAccumulatorRef.current += Math.abs(delta);

    if (scrollTop <= 8) {
      scrollAccumulatorRef.current = 0;
      if (!manualCollapsedRef.current) {
        setHeaderCollapsed(false);
        try {
          localStorage.setItem(`nova.channel.headerCollapsed.${channel?.id ?? ''}`, '0');
        } catch {
          // ignore storage errors
        }
      }
      return;
    }

    if (
      scrollDirectionRef.current === 'down' &&
      scrollAccumulatorRef.current >= HEADER_SCROLL_DELTA &&
      scrollTop > HEADER_AUTO_COLLAPSE_OFFSET
    ) {
      scrollAccumulatorRef.current = 0;
      setHeaderCollapsed(true);
      try {
        localStorage.setItem(`nova.channel.headerCollapsed.${channel?.id ?? ''}`, '1');
      } catch {
        // ignore storage errors
      }
    } else if (
      scrollDirectionRef.current === 'up' &&
      scrollAccumulatorRef.current >= HEADER_SCROLL_DELTA &&
      !manualCollapsedRef.current
    ) {
      scrollAccumulatorRef.current = 0;
      setHeaderCollapsed(false);
      try {
        localStorage.setItem(`nova.channel.headerCollapsed.${channel?.id ?? ''}`, '0');
      } catch {
        // ignore storage errors
      }
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2200);
  };

  const handleSharePost = async (postId: string) => {
    if (!channel) return;
    // A nova:// link reopens the channel on that post with its comments.
    const url = buildDeepLink({
      type: 'channel',
      id: channel.id,
      postId,
      comments: true,
    });
    try {
      await navigator.clipboard?.writeText(url);
      showToast(t('channel.linkCopied'));
    } catch {
      // Clipboard unavailable in this browser context.
    }
  };

  const handleShareChannel = async () => {
    if (!channel) return;
    const url =
      channel.visibility === 'private' && channel.inviteCode
        ? `${window.location.origin}/join/${channel.inviteCode}`
        : `${window.location.origin}/channel/${channel.id}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: channel.name,
          text: channel.description ?? '',
          url,
        });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard?.writeText(url);
      showToast(t('channel.linkCopied'));
    } catch {
      // Clipboard unavailable in this browser context.
    }
  };

  const handlePinPost = (postId: string) => {
    if (!channel) return;
    onPinPost?.(postId);
    showToast(t('channel.postPinned'));
    setPostMenuId(null);
  };

  const handleUnpinPost = (postId: string) => {
    if (!channel) return;
    onUnpinPost?.(postId);
    showToast(t('channel.postUnpinned'));
    setPostMenuId(null);
  };

  const openStats = () => {
    onOpenStats?.();
    setStatsPanelOpen(true);
  };

  const openAdmins = () => {
    onManageAdmins?.();
    setAdminsPanelOpen(true);
  };

  const openDiscussionGroup = () => {
    if (channel?.discussionGroupId) {
      window.dispatchEvent(
        new CustomEvent('nova:open-chat', { detail: { chatId: channel.discussionGroupId } })
      );
    }
  };

  const weekDays = useMemo(() => {
    const focus = new Date(focusDate);
    const year = focus.getFullYear();
    const month = focus.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [focusDate]);

  useEffect(() => {
    if (!dateScrubberRef.current) return;
    const index = weekDays.findIndex((d) => dayKey(d) === selectedDay);
    if (index === -1) return;
    const container = dateScrubberRef.current;
    const target = container.children[index];
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.left - containerRect.left - containerRect.width / 2 + targetRect.width / 2;
    if (typeof container.scrollBy === 'function') {
      container.scrollBy({ left: offset, behavior: 'smooth' });
    }
  }, [selectedDay, weekDays]);

  const dayPostCounts = useMemo(() => {
    const counts = new Map<number, number>();
    channelPosts.forEach((post) => {
      const key = dayKey(postCreatedAt(post));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [channelPosts]);

  const monthPostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    channelPosts.forEach((post) => {
      const date = new Date(postCreatedAt(post));
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [channelPosts]);

  const feedPosts = useMemo(
    () =>
      channelPosts
        .filter((post) => Boolean(channel?.isOwned) || !isPostScheduled(post, now))
        .slice()
        .sort((a, b) => postCreatedAt(b) - postCreatedAt(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelPosts, channel?.isOwned, now],
  );

  const query = searchQuery.trim().toLowerCase();
  const matchesSearchFilter = (post: ChannelPost) => {
    if (searchFilter === 'photos') return Boolean(post.image);
    if (searchFilter === 'videos') return false;
    if (searchFilter === 'links')
      return /https?:\/\//i.test(`${post.title} ${post.text}`);
    if (searchFilter === 'files') return false;
    return true;
  };
  const displayPosts = query
    ? channelPosts
        .filter((post) => Boolean(channel?.isOwned) || !isPostScheduled(post, now))
        .filter(matchesSearchFilter)
        .filter((post) => {
          const created = postCreatedAt(post);
          if (searchDateFrom) {
            const from = new Date(`${searchDateFrom}T00:00:00`).getTime();
            if (created < from) return false;
          }
          if (searchDateTo) {
            const to = new Date(`${searchDateTo}T00:00:00`);
            to.setDate(to.getDate() + 1);
            if (created >= to.getTime()) return false;
          }
          return true;
        })
        .filter(
          (post) =>
            post.title.toLowerCase().includes(query) ||
            post.text.toLowerCase().includes(query),
        )
        .slice()
        .sort((a, b) => postCreatedAt(b) - postCreatedAt(a))
    : feedPosts;

  const [adCampaign, setAdCampaign] = useState<AdCampaign | null>(null);

  // Fetch a real ad from the ad server for this channel. Falls back to the
  // demo campaign when the server is unavailable or has no ad for the channel.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function loadAd() {
      if (!channel || channel.isOwned || channel.visibility === 'private') return;
      try {
        const ad = await fetchAd(channel.id);
        if (!cancelled) setAdCampaign(ad ?? null);
      } catch {
        /* ad fetch is best-effort; falls back to demo campaign */
      }
    }

    // Stagger the fetch so it doesn't block the initial paint.
    timer = setTimeout(loadAd, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [channel, language]);

  const campaign = adCampaign ?? getDemoCampaign(language);

  const showSponsoredCard =
    !query &&
    !canUse('ads_free') &&
    !channel.isOwned &&
    channel.visibility !== 'private' &&
    displayPosts.length >= 5 &&
    !adDismissed &&
    !isAdDismissed(campaign.id) &&
    !isAdvertiserBlocked(campaign.advertiserId);

  // Record server-side impression when a real (non-demo) ad becomes visible.
  useEffect(() => {
    if (!adCampaign) return;
    recordImpression(adCampaign.id, adCampaign.id, channel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adCampaign]);

  useEffect(() => {
    const root = postsScrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const key = Number(visible[0].target.getAttribute('data-day-key'));
        if (!Number.isNaN(key)) setSelectedDay(key);
      },
      { root, rootMargin: '0px 0px -85% 0px', threshold: 0 },
    );
    dayHeaderRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [displayPosts]);


  const monthLabel = new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(focusDate));

  const dateLabel = new Intl.DateTimeFormat(language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(selectedDay));

  const shiftMonth = (offset: number) => {
    const next = new Date(focusDate);
    next.setMonth(next.getMonth() + offset);
    const key = dayKey(startOfDay(next));
    setFocusDate(key);
    setSelectedDay(key);
  };

  const focus = new Date(focusDate);
  const focusMonth = focus.getMonth();
  const focusYear = focus.getFullYear();

  const setFocusYear = (year: number) => {
    setFocusDate(dayKey(new Date(year, focusMonth, 1)));
    setSelectedDay(dayKey(new Date(year, focusMonth, 1)));
  };

  const handleJumpToMonth = () => {
    if (!canUse('date_picker')) {
      checkout();
      return;
    }
    setIsMonthPickerOpen((open) => !open);
  };

  const goToday = () => {
    const today = dayKey(now);
    setSelectedDay(today);
    setFocusDate(today);
  };

  const handleSelectChannel = (id: string) => {
    onSelectChannel?.(id);
  };

  const handleCreateChannel = (draft: ChannelDraft) => {
    const created = onCreateChannel?.(draft);
    if (created && 'id' in created) {
      onSelectChannel?.(created.id);
      setSelectedDay(dayKey(now));
      setFocusDate(dayKey(now));
    }
    showToast(t('channel.channelCreated'));
  };

  const handlePublishPost = (draft: ChannelPostDraft) => {
    if (!channel) return;
    if (editingPost) {
      onEditPost?.(editingPost.id, draft);
      setEditingPost(null);
      showToast(t('channel.postUpdated', 'Post updated'));
      return;
    }
    onCreatePost?.(channel.id, draft);
    const target = draft.scheduledFor ?? Date.now();
    setSelectedDay(dayKey(target));
    setFocusDate(dayKey(target));
    if (draft.scheduledFor) {
      showToast(
        t('channel.postScheduled', {
          date: new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(draft.scheduledFor)),
        }),
      );
    } else {
      showToast(t('channel.postPublished'));
    }
  };

  const handleToggleReaction = (postId: string, emoji: string) => {
    onToggleReaction?.(postId, emoji);
    if (!onToggleReaction) {
      showToast(t('channel.reactionAdded'));
    }
  };

  // Double-tap detection → quick ❤️ reaction (Telegram-style)
  const handlePostDoubleTap = (postId: string) => {
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev.id === postId && now - prev.time < 320) {
      handleToggleReaction(postId, '❤️');
      lastTapRef.current = { id: '', time: 0 };
    } else {
      lastTapRef.current = { id: postId, time: now };
    }
  };

  const soundEnabled = onToggleSound
    ? Boolean(channel?.soundEnabled)
    : localSoundEnabled;

  const toggleSound = () => {
    if (!channel) return;
    const next = !soundEnabled;
    setLocalSoundEnabled(next);
    onToggleSound?.(channel.id, next);
    showToast(next ? t('channel.soundOn') : t('channel.soundOff'));
  };

  if (!channel) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] select-none" data-theme-preserve="dark">
        <DoodleBackground />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-raised)] text-[var(--nova-accent-color)]">
            <Radio className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-[var(--nova-text-primary)]">{t('channel.noChannels')}</p>
          <p className="mt-1 max-w-[260px] text-xs text-[var(--nova-text-muted)]">
            {t('channel.noChannelsSubtitle')}
          </p>
          <button
            type="button"
            onClick={() => setCreateChannelOpen(true)}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-[var(--nova-accent-color)] px-4 py-2 text-xs font-semibold text-[var(--nova-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/25 transition hover:brightness-110 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('channel.createChannel')}
          </button>
        </div>

        <ChannelCreateModal
          isOpen={createChannelOpen}
          onClose={() => setCreateChannelOpen(false)}
          onCreate={handleCreateChannel}
        />
      </div>
    );
  }

  const subscribersLabel = new Intl.NumberFormat(language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(channel.subscribers);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] select-none" data-theme-preserve="dark">
      {/* Floating Header Card with Date Scrubber */}
      <div className="relative z-20 shrink-0 p-3">
          <div
            className={`relative overflow-hidden rounded-3xl border border-[var(--nova-border-subtle)] shadow-xl shadow-black/70 backdrop-blur-xl transition-all duration-300 ${
              headerCollapsed || searchOpen ? 'p-2' : 'p-3 min-h-[200px]'
            } bg-[var(--nova-surface)]/70`}
          >
          {/* Channel Top row */}
          <div
            className={`flex items-center justify-between gap-2 ${
              headerCollapsed || searchOpen ? '' : 'mb-2'
            }`}
          >
            <button
              onClick={onBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)]/80 text-[var(--nova-text-primary)] transition active:scale-95 lg:hidden"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {searchOpen ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--nova-accent-color)]/40 bg-[var(--nova-surface)] px-3 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[var(--nova-text-muted)]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') closeSearch();
                    }}
                    placeholder={t('channel.searchFeedPlaceholder')}
                    aria-label={t('channel.searchFeedPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--nova-text-primary)] placeholder-white/35 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]"
                      aria-label={t('common.reset')}
                      title={t('common.reset')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={closeSearch}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)]/80 text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] active:scale-95"
                  aria-label={t('common.close')}
                  title={t('common.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                {/* Same layout as the chat header: avatar, name, actions. */}
                <button
                  type="button"
                  onClick={() => setSwitcherOpen(true)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                  aria-label={t('channel.switchChannel')}
                  title={t('channel.switchChannel')}
                >
                  <Avatar src={channel.avatar} name={channel.name} size="sm" channelType="default" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-[14px] font-bold tracking-tight text-[var(--nova-text-primary)]">
                      {channel.visibility === 'private' && (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--nova-accent-color)]" />
                      )}
                      <span className="truncate">{channel.name}</span>
                    </span>
                    <span className="block truncate text-[10.5px] text-[var(--nova-text-muted)]">
                      {channel.hideSubscriberCount
                        ? t('channel.subscribersHidden', 'Subscribers hidden')
                        : t('channel.subscribersCompact', {
                            value: subscribersLabel,
                            count: channel.subscribers,
                          })}
                    </span>
                    {channel.description && (
                      <span className="block truncate text-[10.5px] text-[var(--nova-text-muted)] mt-0.5">
                        {channel.description}
                      </span>
                    )}
                  </span>
                </button>

                <NovaIconButton
                  label={t('common.search')}
                  icon={<Search />}
                  size={36}
                  variant="subtle"
                  className="border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)]/80"
                  onClick={() => setSearchOpen(true)}
                />

                {/* Subscribe/Notifications button - like Telegram */}
                <button
                  type="button"
                  onClick={subscribed ? toggleNotifications : toggleSubscription}
                  aria-pressed={subscribed && notificationsEnabled}
                  aria-label={!subscribed
                    ? t('channel.subscribe')
                    : notificationsEnabled
                    ? t('channel.disableNotifications')
                    : t('channel.enableNotifications')}
                  className={`flex h-8 shrink-0 items-center justify-center rounded-full border px-2.5 transition active:scale-95 cursor-pointer ${
                    !subscribed
                      ? 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]'
                      : notificationsEnabled
                      ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/25'
                      : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-secondary)]'
                  }`}
                >
                  {!subscribed ? (
                    <Bell className="h-4 w-4" />
                  ) : notificationsEnabled ? (
                    <Bell className="h-4 w-4 fill-current" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                </button>

                {/* Discussion Group link button */}
                {channel.discussionGroupId && (
                  <button
                    type="button"
                    onClick={openDiscussionGroup}
                    className="flex h-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2.5 transition active:scale-95 cursor-pointer hover:bg-emerald-500/20 hover:text-emerald-300"
                    title={t('channel.openDiscussionGroup', 'Open discussion group')}
                    aria-label={t('channel.openDiscussionGroup', 'Open discussion group')}
                  >
                    <MessagesSquare className="h-4 w-4" />
                  </button>
                )}

                <NovaMenu
                  label={t('common.more')}
                  trigger={
                    <NovaIconButton
                      label={t('common.more')}
                      icon={<MoreVertical />}
                      size={36}
                      variant="subtle"
                      className="border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)]/80"
                    />
                  }
                  items={[
                    {
                      key: 'share',
                      label: t('common.share'),
                      icon: <Share2 />,
                      onSelect: handleShareChannel,
                    },
                    {
                      key: 'switch',
                      label: t('channel.switchChannel'),
                      icon: <ChevronsUpDown />,
                      onSelect: () => setSwitcherOpen(true),
                    },
                    ...(onToggleSound
                      ? [
                          {
                            key: 'sound',
                            label: soundEnabled ? t('channel.soundOff') : t('channel.soundOn'),
                            icon: soundEnabled ? <VolumeX /> : <Volume2 />,
                            onSelect: toggleSound,
                          },
                        ]
                      : []),
                    {
                      key: 'calendar',
                      label: headerCollapsed
                        ? t('channel.showCalendar', 'Show calendar')
                        : t('channel.hideCalendar', 'Hide calendar'),
                      icon: <Calendar />,
                      onSelect: toggleHeader,
                      disabled: !canUse('date_picker'),
                    },
                    ...(channel.isOwned && onToggleSubscriberPrivacy
                      ? [
                          {
                            key: 'privacy',
                            label: channel.hideSubscriberCount
                              ? t('channel.showSubscriberCount')
                              : t('channel.hideSubscriberCount'),
                            icon: channel.hideSubscriberCount ? <Eye /> : <EyeOff />,
                            onSelect: () =>
                              onToggleSubscriberPrivacy(channel.id, !channel.hideSubscriberCount),
                          },
                        ]
                      : []),
                    ...(subscribed
                      ? [
                          {
                            key: 'notifications',
                            label: notificationsEnabled
                              ? t('channel.disableNotifications')
                              : t('channel.enableNotifications'),
                            icon: notificationsEnabled ? <Bell /> : <BellOff />,
                            onSelect: toggleNotifications,
                          },
                        ]
                      : []),
                    ...(channel.isOwned && onOpenStats
                      ? [
                          {
                            key: 'stats',
                            label: t('channel.statistics', 'Statistics'),
                            icon: <BarChart3 />,
                            onSelect: openStats,
                          },
                        ]
                      : []),
                    ...(channel.isOwned && onManageAdmins
                      ? [
                          {
                            key: 'admins',
                            label: t('channel.manageAdmins', 'Manage admins'),
                            icon: <Users />,
                            onSelect: openAdmins,
                          },
                        ]
                      : []),
                    ...(channel.isOwned && onSetDiscussionGroup
                      ? [
                          {
                            key: 'discussion-group',
                            label: channel.discussionGroupId
                              ? t('channel.editDiscussionGroup', 'Edit discussion group')
                              : t('channel.addDiscussionGroup', 'Add discussion group'),
                            icon: <MessagesSquare />,
                            onSelect: () => {
                              // Open communities panel or direct link
                              if (channel.discussionGroupId) {
                                // Open the linked discussion group
                                window.dispatchEvent(
                                  new CustomEvent('nova:open-chat', { detail: { chatId: channel.discussionGroupId } })
                                );
                              }
                            },
                          },
                        ]
                      : []),
                    {
                      key: 'unsubscribe',
                      label: subscribed ? t('channel.unsubscribe') : t('channel.subscribe'),
                      icon: <Bell />,
                      danger: subscribed,
                      separatorBefore: true,
                      onSelect: toggleSubscription,
                    },
                  ]}
                />

                </>
            )}
          </div>

          {/* Date Scrubber / Timeline Ruler */}
          {!headerCollapsed && !searchOpen && (
            <div id="channel-date-scrubber" className="w-full px-1">
              <div className="mb-1 flex items-center justify-between px-1">
                <button
                  type="button"                    onClick={() => shiftMonth(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                  aria-label={t('channel.previousMonth')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleJumpToMonth}
                    className="flex min-h-6 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--nova-text-muted)] transition hover:text-[var(--nova-text-primary)]"
                    aria-label={t('channel.jumpToMonth')}
                    disabled={!canUse('date_picker')}
                  >
                    {monthLabel}
                    {canUse('date_picker') && (
                      <ChevronDown className="h-3 w-3 text-[var(--nova-text-muted)]" />
                    )}
                    {!canUse('date_picker') && (
                      <span className="text-[8px] opacity-70">(Premium)</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className={`min-h-6 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition ${
                      selectedDay !== dayKey(now)
                        ? 'border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]'
                        : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)] hover:border-[var(--nova-accent-color)]/40 hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    {t('channel.today')}
                  </button>
                </div>

                <button
                  type="button"                    onClick={() => shiftMonth(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                  aria-label={t('channel.nextMonth')}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {canUse('date_picker') && isMonthPickerOpen && (
                <div className="mt-1 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] p-2 shadow-2xl shadow-black/60">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setFocusYear(focusYear - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]"
                      aria-label={t('channel.previousYear', 'Previous year')}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] font-semibold text-[var(--nova-text-primary)]">{focusYear}</span>
                    <button
                      type="button"
                      onClick={() => setFocusYear(focusYear + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]"
                      aria-label={t('channel.nextYear', 'Next year')}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {MONTHS.map((month) => {
                      const count = monthPostCounts.get(`${focusYear}-${month.value}`) ?? 0;
                      const intensity =
                        count >= 5 ? 'bg-[var(--nova-accent-color)]/40' : count >= 2 ? 'bg-[var(--nova-accent-color)]/25' : count >= 1 ? 'bg-[var(--nova-accent-color)]/12' : 'bg-[var(--nova-overlay-weak)]';
                      return (
                        <button
                          key={month.value}
                          type="button"
                          onClick={() => {
                            setFocusDate(dayKey(new Date(focusYear, month.value, 1)));
                            setSelectedDay(dayKey(new Date(focusYear, month.value, 1)));
                            setIsMonthPickerOpen(false);
                          }}
                          className={`rounded-lg px-1 py-1.5 text-[10px] font-semibold transition hover:bg-[var(--nova-overlay-medium)] ${
                            focusMonth === month.value && focusYear === focus.getFullYear()
                              ? 'text-[var(--nova-text-primary)]'
                              : 'text-[var(--nova-text-secondary)]'
                          }`}
                        >
                          <span className="block truncate">{month.label.slice(0, 3)}</span>
                          <span className={`mt-0.5 block h-1.5 w-full rounded-full ${intensity}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div
                ref={dateScrubberRef}
                role="grid"
                aria-label={monthLabel}
                className="w-full flex items-center gap-x-1 px-1 overflow-x-scroll no-scrollbar flex-nowrap pb-2"
                onWheel={(e) => {
                  if (e.deltaX === 0 && e.deltaY !== 0) {
                    e.preventDefault();
                    dateScrubberRef.current?.scrollBy({ left: e.deltaY, behavior: 'smooth' });
                  }
                }}
              >
                {weekDays.map((date) => {
                  const key = dayKey(date);
                const isSelected = selectedDay === key;
                const isToday = dayKey(now) === key;
                const count = dayPostCounts.get(key) ?? 0;
                const isFuture = key > dayKey(now);
                const weekday = new Intl.DateTimeFormat(language, {
                  weekday: 'short',
                }).format(date);
                const dots = count >= 5 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;

                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-label={new Intl.DateTimeFormat(language, {
                      dateStyle: 'full',
                    }).format(date)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-selected={isSelected}
                    aria-disabled={isFuture}
                    disabled={isFuture}
                    onClick={() => {
                      if (isFuture) return;
                      setSelectedDay(key);
                      const node = dayHeaderRefs.current.get(key);
                      node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft') {
                        event.preventDefault();
                        const prev = new Date(date);
                        prev.setDate(prev.getDate() - 1);
                        setSelectedDay(dayKey(prev));
                      } else if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        const next = new Date(date);
                        next.setDate(next.getDate() + 1);
                        setSelectedDay(dayKey(next));
                      } else if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!isFuture) setSelectedDay(key);
                      }
                    }}
                    className={`shrink-0 min-w-[52px] group relative z-10 flex flex-col items-center rounded-lg px-2 py-1.5 transition active:scale-95 ${
                      isFuture ? 'cursor-not-allowed opacity-35' : 'hover:bg-[var(--nova-overlay-weak)]'
                    } ${isSelected ? 'bg-[var(--nova-accent-color)]/20 ring-1 ring-[var(--nova-accent-color)]' : ''} ${isToday && !isSelected ? 'ring-1 ring-inset ring-[var(--nova-accent-color)]/50' : ''}`}
                  >
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wide ${
                        isSelected ? 'text-[var(--nova-text-secondary)]' : 'text-[var(--nova-text-muted)]'
                      }`}
                    >
                      {weekday}
                    </span>
                    <div
                      className={`mt-0.5 rounded-lg border px-2 py-0.5 text-[12px] font-semibold transition ${
                        isSelected
                          ? 'border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] shadow-sm'
                          : 'border-transparent text-[var(--nova-text-muted)] group-hover:text-[var(--nova-text-secondary)]'
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="mt-1 flex items-center gap-0.5">
                      {Array.from({ length: dots }).map((_, index) => (
                        <span
                          key={index}
                          className={`h-1 w-1 rounded-full ${
                            isToday ? 'bg-[var(--nova-accent-color)]' : 'bg-[var(--nova-overlay-strong)]'
                          }`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Reply Preview Bar - shows when composing a comment */}
      {commentingPost && commentDraft && (
        <div className="px-4 py-2 bg-[var(--nova-surface-raised)]/95 border-t border-b border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-between text-xs z-20 backdrop-blur-xl shadow-lg animate-in slide-in-from-bottom-2 duration-150">
          <div
            onClick={() => postsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 truncate cursor-pointer group flex-1 mr-2"
            title={t('channel.replyPreviewTitle', { defaultValue: 'Replying to post' })}
          >
            <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color,#ff4e18)]/20 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)] shrink-0 border border-[var(--nova-accent-color,#ff4e18)]/30">
              <MessageCircle className="w-3.5 h-3.5" />
            </div>
            <div className="truncate flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--nova-accent-color,#ff4e18)] font-bold text-[11px] group-hover:underline">
                  {t('channel.replyingTo', { defaultValue: 'Replying to' })} {commentingPost.title || t('channel.post')}
                </span>
                <span className="text-[10px] text-[var(--nova-text-muted)]">· Click to jump</span>
              </div>
              <p className="text-[var(--nova-text-muted)] truncate text-[11px] mt-0.5 font-normal">
                {commentDraft}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCommentingPostId(null);
              setCommentDraft('');
            }}
            className="px-2 py-1 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0 active:scale-95"
            title={t('common.cancel')}
          >
            <X className="w-3.5 h-3.5 text-[var(--nova-text-secondary)]" />
            <span>{t('common.cancel')}</span>
          </button>
        </div>
      )}

      {/* Posts Stream */}
      <div
        ref={postsScrollRef}
        onScroll={handlePostsScroll}
        data-testid="channel-posts-scroll"
        className="relative z-10 flex-1 overflow-y-auto px-4 py-1 pb-20"
      >
        <div className="sticky top-0 z-10 mb-2 flex flex-col gap-1 bg-[var(--nova-canvas)]/80 px-1 py-1 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">
              {query ? t('common.search') : dateLabel}
            </span>
          </div>
          {searchOpen && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'photos', 'videos', 'links', 'files'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setSearchFilter(filter)}
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition ${
                    searchFilter === filter
                      ? 'border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]'
                      : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]'
                  }`}
                >
                  {t(`channel.searchFilter.${filter}`, filter)}
                </button>
              ))}
              <input
                type="date"
                value={searchDateFrom}
                onChange={(event) => setSearchDateFrom(event.target.value)}
                aria-label={t('channel.searchDateFrom', 'From date')}
                className="rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-0.5 text-[10px] text-[var(--nova-text-secondary)] outline-none"
              />
              <input
                type="date"
                value={searchDateTo}
                onChange={(event) => setSearchDateTo(event.target.value)}
                aria-label={t('channel.searchDateTo', 'To date')}
                className="rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-0.5 text-[10px] text-[var(--nova-text-secondary)] outline-none"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end px-1">
          <span className="text-[10px] text-[var(--nova-text-muted)]">
            {t('channel.postsCount', { count: displayPosts.length })}
          </span>
        </div>

        {displayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-raised)] text-[var(--nova-text-muted)]">
              <Radio className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-[var(--nova-text-secondary)]">
              {query ? t('channel.noSearchResults') : t('channel.noPosts')}
            </p>
            <p className="mt-1 max-w-[230px] text-xs text-[var(--nova-text-muted)]">
              {query
                ? t('channel.noSearchResultsSubtitle')
                : channel.isOwned
                  ? t('channel.noPostsSubtitle')
                  : t('channel.noPostsSubtitleOther')}
            </p>
            {!query && channel.isOwned && onCreatePost && (
              <button
                type="button"
                onClick={() => setPostComposerOpen(true)}
                className="mt-3 flex items-center gap-1.5 rounded-full bg-[var(--nova-accent-color)] px-3.5 py-1.5 text-xs font-semibold text-[var(--nova-on-accent)] shadow-md shadow-[var(--nova-accent-color)]/25 transition hover:brightness-110 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('channel.newPost')}
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[840px] space-y-4">
            {displayPosts.map((post, index) => {
              const scheduled = isPostScheduled(post, now);
              const postCardClassName = scheduled
                ? 'bg-[var(--nova-surface-raised)]/80 border border-dashed border-[var(--nova-accent-color)]/40 shadow-md shadow-black/40'
                : 'bg-[var(--nova-surface-raised)]/95 border border-[var(--nova-border-subtle)] shadow-md shadow-black/50';

              const dayKeyForPost = dayKey(postCreatedAt(post));
              const prevPost = index > 0 ? displayPosts[index - 1] : null;
              const showDayHeader =
                !query &&
                (!prevPost ||
                  dayKey(postCreatedAt(prevPost)) !== dayKeyForPost);

              return (
                <React.Fragment key={post.id}>
                  {showDayHeader && (
                    <div
                      ref={(node) => {
                        if (node) dayHeaderRefs.current.set(dayKeyForPost, node);
                        else dayHeaderRefs.current.delete(dayKeyForPost);
                      }}
                      data-day-key={dayKeyForPost}
                      className="sticky top-0 z-20 -mx-4 mb-2 border-b border-white/[0.06] bg-[var(--nova-canvas)]/90 px-4 py-1.5 backdrop-blur-sm"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--nova-text-secondary)]">
                        {new Intl.DateTimeFormat(language, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        }).format(new Date(dayKeyForPost))}
                      </span>
                    </div>
                  )}
                  {/* Post Card - full width with time inside */}
                  <div
                    className={`space-y-3 rounded-[24px] p-4 text-[var(--nova-text-primary)] ${postCardClassName}`}
                    onDoubleClick={() => handlePostDoubleTap(post.id)}
                  >
                    {/* Time inside card at top */}
                    <div className="text-right text-[11px] font-medium tabular-nums text-[var(--nova-text-muted)]">
                      {post.time}
                    </div>
                    {scheduled && (
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--nova-accent-color)]">
                        <Clock className="h-3 w-3" />
                        {t('channel.scheduledBadge')} ·{' '}
                        {new Intl.DateTimeFormat(language, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(post.scheduledFor ?? postCreatedAt(post)))}
                      </div>
                    )}

                    {/* Media grid if present */}
                    {(() => {
                      const mediaImages =
                        post.images && post.images.length > 0
                          ? post.images
                          : post.image
                            ? [post.image]
                            : [];
                      if (mediaImages.length === 0) return null;

                      const openLightbox = (index: number) => {
                        setMediaScale(1);
                        setMediaPosition({ x: 0, y: 0 });
                        setLightbox({ images: mediaImages, index });
                      };
                      const gridClass =
                        mediaImages.length === 1
                          ? 'grid-cols-1'
                          : mediaImages.length === 2
                            ? 'grid-cols-2'
                            : mediaImages.length === 3
                              ? 'grid-cols-2 grid-rows-2'
                              : 'grid-cols-2 grid-rows-2';
                      return (
                        <div className={`grid gap-2 ${gridClass}`}>
                          {mediaImages.slice(0, 4).map((src, index) => {
                            const isLastVisible =
                              index === 3 && mediaImages.length > 4;
                            const spanClass =
                              mediaImages.length === 3 && index === 0
                                ? 'row-span-2'
                                : '';
                            return (
                              <button
                                key={`${post.id}-media-${index}`}
                                type="button"
                                onClick={() => openLightbox(index)}
                                className={`group relative overflow-hidden rounded-[18px] bg-[var(--nova-surface-high)] cursor-zoom-in ${spanClass} ${
                                  mediaImages.length === 1
                                    ? 'aspect-[16/9] max-h-[min(560px,70vh)]'
                                    : 'aspect-square'
                                }`}
                              >
                                <LazyMedia
                                  src={src}
                                  alt={post.title}
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                  eager
                                />
                                {isLastVisible && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-[var(--nova-on-accent)]">
                                    +{mediaImages.length - 4}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                          {post.imageBadge && mediaImages.length === 1 && (
                            <div className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full border border-[var(--nova-border-subtle)] bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-[var(--nova-on-accent)] backdrop-blur-md">
                              {post.imageBadge}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Title & menu */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14.5px] font-bold leading-snug text-[var(--nova-text-primary)]">
                          {post.title}
                        </h3>
                        {(post.isPinned || post.editedAt || post.forwardedFrom) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--nova-text-muted)]">
                            {post.isPinned && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-0.5 font-semibold text-[var(--nova-text-secondary)]">
                                <Pin className="h-3 w-3" />
                                {t('channel.pinned', 'Pinned')}
                              </span>
                            )}
                            {post.forwardedFrom && (
                              <span className="inline-flex items-center gap-1">
                                {t('channel.forwardedFrom', 'Forwarded from')} {post.forwardedFrom}
                              </span>
                            )}
                            {post.editedAt && (
                              <span className="italic text-[var(--nova-text-muted)]">
                                {t('channel.edited', '(edited)')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPostMenuId((current) =>
                              current === post.id ? null : post.id,
                            );
                          }}
                          className="rounded-full p-1 text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                          aria-label={t('common.more')}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {postMenuId === post.id && (
                          <div
                            className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] p-1 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                showToast(t('channel.linkCopied'));
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {t('channel.copyLink', 'Copy link')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSharePost(post.id);
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              {t('channel.sharePost')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                showToast(t('channel.postSaved', 'Saved'));
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                            >
                              <Bookmark className="h-3.5 w-3.5" />
                              {t('channel.savePost', 'Save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(post.text).catch(() => undefined);
                                showToast(t('channel.textCopied', 'Text copied'));
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {t('channel.copyText', 'Copy text')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                showToast(t('channel.translateUnavailable', 'Translation unavailable'));
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                            >
                              <Languages className="h-3.5 w-3.5" />
                              {t('channel.translate', 'Translate')}
                            </button>
                            <div className="my-1 h-px bg-[var(--nova-overlay-weak)]" />
                            <button
                              type="button"
                              onClick={() => {
                                setReportTarget({
                                  type: 'post',
                                  id: post.id,
                                  channelId: channel.id,
                                  title: post.title,
                                });
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-red-400 transition hover:bg-red-500/10"
                            >
                              <Flag className="h-3.5 w-3.5" />
                              {t('channel.report', 'Report')}
                            </button>
                            {channel.isOwned && onEditPost && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPost(post);
                                  setPostMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                              >
                                <PenSquare className="h-3.5 w-3.5" />
                                {t('channel.editPost', 'Edit post')}
                              </button>
                            )}
                            {channel.isOwned && onDeletePost && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeletePost(post.id);
                                  setPostMenuId(null);
                                  showToast(t('channel.postDeleted'));
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-red-400 transition hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('channel.deletePost')}
                              </button>
                            )}
                            {channel.isOwned && onPinPost && onUnpinPost && (
                              <>
                                {!post.isPinned && (
                                  <button
                                    type="button"
                                    onClick={() => handlePinPost(post.id)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                                  >
                                    <Pin className="h-3.5 w-3.5" />
                                    {t('channel.pinPost', 'Pin post')}
                                  </button>
                                )}
                                {post.isPinned && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnpinPost(post.id)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                                  >
                                    <PinOff className="h-3.5 w-3.5" />
                                    {t('channel.unpinPost', 'Unpin post')}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Body Text */}
                    {post.text && (
                      <div>
                        <p
                          className={`text-[13px] font-normal leading-relaxed text-[var(--nova-text-secondary)] ${
                            expandedPostIds.has(post.id) ? '' : 'line-clamp-4'
                          }`}
                        >
                          {post.text}
                        </p>
                        {post.text.length > 260 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPostIds((current) => {
                                const next = new Set(current);
                                if (next.has(post.id)) next.delete(post.id);
                                else next.add(post.id);
                                return next;
                              })
                            }
                            className="mt-1 text-[11px] font-semibold text-[var(--nova-accent-color)] hover:underline"
                          >
                            {expandedPostIds.has(post.id)
                              ? t('channel.showLess', 'Show less')
                              : t('channel.readMore', 'Read more')}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Sticker in Channel Post */}
                    {post.sticker && (
                      <div className="flex justify-start pt-1">
                        <StickerMedia
                          sticker={post.sticker}
                          className="h-28 w-28 object-contain filter drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
                          emojiClassName="text-5xl"
                        />
                      </div>
                    )}

                    {/* Interactive Poll in Channel Post */}
                    {post.poll && (
                      <div className="pt-2 pb-1">
                        <PollBubble
                          poll={post.poll}
                          onVote={handleChannelPollVote}
                          onRetractVote={(pollId) => handleChannelPollVote(pollId, '')}
                        />
                      </div>
                    )}

                    {/* Reactions on the left, engagement actions on the right:
                        reacting and commenting are different actions and used
                        to look identical in one row. */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {post.reactions.map((reaction) => (
                        <NovaReactionPill
                          key={reaction.emoji}
                          emoji={reaction.emoji}
                          count={reaction.count}
                          selected={reaction.userReacted}
                          onClick={() => handleToggleReaction(post.id, reaction.emoji)}
                        />
                      ))}

                      {onToggleReaction && (
                        <NovaReactionPicker
                          label={t('common.react')}
                          emojis={POST_REACTIONS}
                          selectedEmojis={post.reactions
                            .filter((r) => r.userReacted)
                            .map((r) => r.emoji)}
                          onSelect={(emoji) => handleToggleReaction(post.id, emoji)}
                          allowCustom={true}
                          customLabel={t('common.customReaction')}
                          trigger={
                            <NovaIconButton
                              icon={<SmilePlus className="h-3.5 w-3.5" />}
                              label={t('common.react')}
                              size={32}
                              className="border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] text-[var(--nova-text-muted)] hover:bg-[var(--nova-surface-high)] hover:text-[var(--nova-text-primary)]"
                            />
                          }
                        />
                      )}

                      {post.reactions.some((reaction) => reaction.userReacted) && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--nova-accent-color)]">
                          <Check className="h-3 w-3" />
                          {t('channel.youReacted')}
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1.5">
                        {typeof post.views === 'number' && (
                          <span className="flex items-center gap-1 px-1 text-[11px] tabular-nums text-[var(--nova-text-muted)]">
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatCount(post.views)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            commentTriggerRef.current = event.currentTarget;
                            setCommentingPostId(post.id);
                          }}
                          aria-haspopup="dialog"
                          aria-expanded={commentingPostId === post.id}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] px-2.5 py-1 text-[11px] font-medium text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] active:scale-95"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-[var(--nova-text-muted)]" />
                          <span>{t('channel.commentsCount', { count: post.commentsCount })}</span>
                        </button>
                        <NovaIconButton
                          label={t('channel.sharePost')}
                          icon={<Share2 />}
                          size={32}
                          className="border border-[var(--nova-border-subtle)] bg-[var(--nova-surface-high)] text-[var(--nova-text-muted)] hover:bg-[var(--nova-surface-high)] hover:text-[var(--nova-text-primary)]"
                          onClick={() => handleSharePost(post.id)}
                        />
                      </div>
                    </div>
                  </div>
                  {showSponsoredCard && index === 3 && (
                  <div
                    className="relative flex items-start gap-2.5"
                    data-testid="channel-sponsored-slot"
                  >
                    <div className="w-10 shrink-0 pt-3 text-right text-[9px] font-bold uppercase tracking-wider text-[var(--nova-accent-color)]/70">
                      {t('ads.label')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <SponsoredPostCard
                        campaign={campaign}
                        onDismissed={() => setAdDismissed(true)}
                      />
                    </div>
                  </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {reportTarget && (
        <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      )}

      {/* Toast Notification */}
      {lightbox && (
        <div
          data-testid="media-lightbox"
          onClick={() => { setLightbox(null); setMediaScale(1); setMediaPosition({ x: 0, y: 0 }); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 text-[var(--nova-on-accent)] backdrop-blur-md"
        >
          <div className="absolute inset-0" onClick={() => { setLightbox(null); setMediaScale(1); setMediaPosition({ x: 0, y: 0 }); }} />
          <div className="relative z-10 flex max-h-full max-w-full items-center gap-3" onClick={(event) => event.stopPropagation()}>
            {lightbox.images.length > 1 && (
              <button
                type="button"
                aria-label="Previous media"
                onClick={() => {
                  setLightbox((current) =>
                    current
                      ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length }
                      : current,
                  );
                  setMediaScale(1);
                  setMediaPosition({ x: 0, y: 0 });
                }}
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/75 cursor-pointer sm:static sm:translate-y-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {isVideoMediaUrl(lightbox.images[lightbox.index]) ? (
              <video
                src={lightbox.images[lightbox.index]}
                controls
                playsInline
                aria-label={`Media ${lightbox.index + 1}`}
                className="max-h-[85vh] max-w-[85vw] rounded-xl bg-black"
              />
            ) : (
              <div
                className="relative"
                onWheel={(e) => {
                  e.preventDefault();
                  if (e.ctrlKey || e.metaKey) {
                    setMediaScale((s) => Math.max(0.5, Math.min(4, s - e.deltaY * 0.005)));
                  }
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 2) {
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                    mediaTouchStartRef.current = { x: (touch1.clientX + touch2.clientX) / 2, y: (touch1.clientY + touch2.clientY) / 2, distance, scale: mediaScale };
                  } else if (e.touches.length === 1 && mediaScale > 1) {
                    mediaTouchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, distance: 0, scale: mediaScale };
                  }
                }}
                onTouchMove={(e) => {
                  if (!mediaTouchStartRef.current) return;
                  if (e.touches.length === 2) {
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                    const newScale = Math.max(0.5, Math.min(4, mediaTouchStartRef.current.scale * (distance / mediaTouchStartRef.current.distance)));
                    setMediaScale(newScale);
                  } else if (e.touches.length === 1 && mediaScale > 1) {
                    const dx = e.touches[0].clientX - mediaTouchStartRef.current.x;
                    const dy = e.touches[0].clientY - mediaTouchStartRef.current.y;
                    setMediaPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
                    mediaTouchStartRef.current = { ...mediaTouchStartRef.current, x: e.touches[0].clientX, y: e.touches[0].clientY };
                  }
                }}
                onTouchEnd={() => {
                  mediaTouchStartRef.current = null;
                }}
              >
                <LazyMedia
                  src={lightbox.images[lightbox.index]}
                  alt={`Media ${lightbox.index + 1}`}
                  eager
                  className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl"
                  style={{
                    transform: `translate(${mediaPosition.x}px, ${mediaPosition.y}px) scale(${mediaScale})`,
                    transformOrigin: 'center center',
                    transition: mediaScale > 1 ? 'none' : 'transform 0.2s ease-out',
                  }}
                />
              </div>
            )}
            {lightbox.images.length > 1 && (
              <button
                type="button"
                aria-label="Next media"
                onClick={() => {
                  setLightbox((current) =>
                    current
                      ? { ...current, index: (current.index + 1) % current.images.length }
                      : current,
                  );
                  setMediaScale(1);
                  setMediaPosition({ x: 0, y: 0 });
                }}
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/75 cursor-pointer sm:static sm:translate-y-0"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
          {lightbox.images.length > 1 && (
            <span className="absolute bottom-5 z-20 text-xs text-[var(--nova-text-secondary)]">
              {lightbox.index + 1} / {lightbox.images.length}
            </span>
          )}

          {/* Zoom controls */}
          {!isVideoMediaUrl(lightbox.images[lightbox.index]) && mediaScale > 1 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setMediaScale((s) => Math.max(1, s - 0.5))}
                className="p-1.5 text-[var(--nova-text-primary)] hover:text-[var(--nova-accent-color)] cursor-pointer"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                onClick={() => { setMediaScale(1); setMediaPosition({ x: 0, y: 0 }); }}
                className="px-2 py-1.5 text-xs font-medium text-[var(--nova-text-secondary)] bg-[var(--nova-overlay-medium)] rounded-full hover:bg-[var(--nova-overlay-strong)] cursor-pointer"
              >
                100%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setMediaScale((s) => Math.min(4, s + 0.5))}
                className="p-1.5 text-[var(--nova-text-primary)] hover:text-[var(--nova-accent-color)] cursor-pointer"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Share & Save actions */}
          <div className="absolute bottom-16 right-4 z-20 flex items-center gap-2">
            <button
              type="button"
              aria-label="Share"
              onClick={async () => {
                const url = lightbox.images[lightbox.index];
                if (navigator.share) {
                  await navigator.share({ title: 'Media', url });
                } else {
                  await navigator.clipboard.writeText(url);
                  showToast('Link copied');
                }
              }}
              className="p-2 bg-black/70 backdrop-blur-sm rounded-full text-[var(--nova-on-accent)] hover:text-[var(--nova-accent-color)] cursor-pointer"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Save"
              onClick={async () => {
                const url = lightbox.images[lightbox.index];
                try {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = url.split('/').pop() || 'media';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                  showToast('Saved to device');
                } catch {
                  showToast('Failed to save');
                }
              }}
              className="p-2 bg-black/70 backdrop-blur-sm rounded-full text-[var(--nova-on-accent)] hover:text-[var(--nova-accent-color)] cursor-pointer"
            >
              <Download className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setLightbox(null); setMediaScale(1); setMediaPosition({ x: 0, y: 0 }); }}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-[var(--nova-on-accent)] hover:bg-black/75 cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {toastMessage && (
        <div className="fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-full border border-[var(--nova-accent-color)]/50 bg-[var(--nova-surface-high)]/95 px-3.5 py-1.5 text-xs text-[var(--nova-text-primary)] shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      

      {showJumpToLatest && (
        <button
          type="button"
          onClick={() => postsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="absolute bottom-20 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/30 transition hover:brightness-110 active:scale-95"
          aria-label={t('channel.jumpToLatest', 'Jump to latest')}
          title={t('channel.jumpToLatest', 'Jump to latest')}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      <ChannelSwitcherModal
        isOpen={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        channels={availableChannels}
        activeChannelId={channel.id}
        onSelect={handleSelectChannel}
        onCreateRequest={() => {
          setSwitcherOpen(false);
          setCreateChannelOpen(true);
        }}
        onDelete={(id) => {
          onDeleteChannel?.(id);
          showToast(t('channel.channelDeleted'));
        }}
        onDeleteMany={onDeleteChannels}
      />

      <ChannelCreateModal
        isOpen={createChannelOpen}
        onClose={() => setCreateChannelOpen(false)}
        onCreate={handleCreateChannel}
      />

      <ChannelPostComposerModal
        isOpen={postComposerOpen || !!editingPost}
        onClose={() => {
          setPostComposerOpen(false);
          setEditingPost(null);
        }}
        channelName={channel.name}
        onPublish={handlePublishPost}
        initialDraft={
          editingPost
            ? {
                title: editingPost.title,
                text: editingPost.text,
                image: editingPost.image,
                poll: editingPost.poll,
                sticker: editingPost.sticker,
              }
            : null
        }
      />

      {commentingPost && (
        <PostCommentsSheet
          post={commentingPost}
          comments={commentingPost.comments ?? []}
          draft={commentDraft}
          onDraftChange={setCommentDraft}
          onAddComment={(text) => onAddComment?.(commentingPost.id, text)}
          onClose={() => {
            setCommentingPostId(null);
            setCommentDraft('');
          }}
          returnFocusTo={commentTriggerRef.current}
        />
      )}

      {/* Channel Statistics Panel */}
      {statsPanelOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setStatsPanelOpen(false)}>
          <div className="w-full max-w-3xl bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-3xl shadow-[var(--shadow-2)] p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)] text-lg">{t('channel.statistics', 'Statistics')}</h2>
              <button onClick={() => setStatsPanelOpen(false)} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Time range selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-tertiary)]">{t('channel.statsPeriod', 'Period:')}</span>
              {(['7d', '30d', 'all'] as const).map((period) => (
                <button
                  key={period}
                  className={`px-3 py-1 rounded-lg text-[11px] font-medium transition ${
                    statsPeriod === period
                      ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)]'
                      : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] text-[var(--nova-text-secondary)]'
                  }`}
                  onClick={() => setStatsPeriod(period)}
                >
                  {period === '7d' ? '7d' : period === '30d' ? '30d' : t('channel.statsAllTime', 'All time')}
                </button>
              ))}
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label={t('channel.statsViews', 'Views')} value={formatCount(totalViews)} icon={<Eye className="w-5 h-5" />} color="text-blue-400" trend={viewsTrend} />
              <StatCard label={t('channel.statsSubscribers', 'Subscribers')} value={formatCount(channel?.subscribers ?? 0)} icon={<Users className="w-5 h-5" />} color="text-green-400" trend={subscribersTrend} />
              <StatCard label={t('channel.statsPosts', 'Posts')} value={formatCount(channelPosts.length)} icon={<MessageCircle className="w-5 h-5" />} color="text-purple-400" trend={postsTrend} />
              <StatCard label={t('channel.statsReactions', 'Reactions')} value={formatCount(totalReactions)} icon={<Heart className="w-5 h-5" />} color="text-red-400" trend={reactionsTrend} />
              <StatCard label={t('channel.statsComments', 'Comments')} value={formatCount(totalComments)} icon={<MessagesSquare className="w-5 h-5" />} color="text-yellow-400" trend={commentsTrend} />
              <StatCard label={t('channel.statsForwards', 'Forwards')} value={formatCount(totalForwards)} icon={<Share2 className="w-5 h-5" />} color="text-cyan-400" trend={forwardsTrend} />
            </div>

            {/* Growth Chart (mock) */}
            <div className="border-t border-[var(--border)] pt-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('channel.statsGrowth', 'Growth')}</h3>
              <div className="h-32 flex items-end justify-between gap-1">
                {growthData.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-[var(--nova-accent-color)]/50 rounded-t transition-all duration-300 hover:bg-[var(--nova-accent-color)] cursor-pointer"
                      style={{ height: `${Math.max(20, day.value * 60)}%` }}
                      title={`${day.label}: ${formatCount(day.value)}`}
                    />
                    <span className="text-[9px] text-[var(--text-tertiary)]">{day.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Posts */}
            <div className="border-t border-[var(--border)] pt-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('channel.statsTopPosts', 'Top posts by engagement')}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {topPosts.slice(0, 5).map((post) => (
                  <div key={post.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border)]">
                    <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-tertiary)]">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">{post.title}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {formatCount(post.views ?? 0)} views · {formatCount(post.reactions?.reduce((acc, r) => acc + r.count, 0) ?? 0)} reactions
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Media Gallery Section */}
            <div className="border-t border-[var(--border)] pt-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('channel.statsMedia', 'Media Gallery')}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {mediaItems.slice(0, 12).map((item, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-[var(--bg-surface-2)] border border-[var(--border)] relative group cursor-pointer">
                    {item.type === 'image' && (
                      <LazyMedia
                        src={item.url}
                        alt={item.alt}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    {item.type === 'video' && (
                      <>
                        <LazyMedia
                          src={item.thumbnail}
                          alt={item.alt}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-8 h-8 text-[var(--nova-text-primary)]" />
                        </div>
                      </>
                    )}
                    <div className="absolute bottom-1 right-1 p-1 bg-black/50 rounded text-[9px] text-[var(--nova-text-primary)]">
                      {item.type === 'video' ? '🎥' : '🖼️'}
                    </div>
                  </div>
                ))}
                {mediaItems.length > 12 && (
                  <div className="aspect-square rounded-lg overflow-hidden bg-[var(--bg-surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--nova-text-muted)] text-sm cursor-pointer">
                    +{mediaItems.length - 12} {t('channel.statsMore', 'more')}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStatsPanelOpen(false)} className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-hover)]">
                {t('common.close')}
              </button>
              <button
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-xs font-semibold hover:opacity-90"
                onClick={() => {
                  // Export stats
                  showToast(t('channel.statsExported', 'Statistics exported'));
                }}
              >
                {t('channel.statsExport', 'Export')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Management Panel */}
      {adminsPanelOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAdminsPanelOpen(false)}>
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-3xl shadow-[var(--shadow-2)] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--text-primary)] text-lg">{t('channel.manageAdmins', 'Manage admins')}</h2>
              <button onClick={() => setAdminsPanelOpen(false)} className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-[var(--text-secondary)]">{t('channel.adminsDesc', 'Add or remove channel administrators.')}</p>

            <div className="space-y-2">
              {(channel?.admins ?? []).map((admin) => {
                const adminId = admin.id;
                const isOwner = admin.isOwner === true || adminId === channel?.ownerFingerprint;
                return (
                <div key={adminId} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)] font-bold">
                      {adminId.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{adminId}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">{t('channel.adminRole', 'Administrator')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (onToggleAdmin && !isOwner) {
                        onToggleAdmin(adminId, false);
                        showToast(t('channel.adminDemoted'));
                      }
                    }}
                    disabled={isOwner || !onToggleAdmin}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    {t('channel.demote', 'Demote')}
                  </button>
                </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-[var(--border)]">
              <label className="block text-[11px] font-medium text-[var(--text-tertiary)] mb-2">{t('channel.addAdmin', 'Add admin')}</label>
              <div className="flex gap-2">
                <input
                  id="add-admin-input"
                  type="text"
                  placeholder={t('channel.addAdminPlaceholder', 'User ID or @username')}
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] text-sm"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('add-admin-input') as HTMLInputElement;
                    if (input?.value?.trim() && onAddAdmin) {
                      onAddAdmin(input.value.trim());
                      input.value = '';
                      showToast(t('channel.adminAdded'));
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] text-xs font-semibold hover:opacity-90"
                >
                  {t('channel.addAdmin', 'Add')}
                </button>
              </div>
            </div>

            <button onClick={() => setAdminsPanelOpen(false)} className="w-full px-4 py-2 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-hover)] mt-2">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// StatCard component for statistics panel
const StatCard: React.FC<{ 
  label: string; 
  value: string; 
  icon: React.ReactNode; 
  color: string; 
  trend?: { value: string; positive: boolean } 
}> = ({ label, value, icon, color, trend }) => (
  <div className="p-4 rounded-xl bg-[var(--bg-app)] border border-[var(--border)]">
    <div className="flex items-center justify-between">
      <span className={color}>{icon}</span>
      <span className="text-[11px] font-medium text-[var(--text-tertiary)]">{label}</span>
    </div>
    <p className="mt-2 text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
    {trend && (
      <div className="mt-1.5 flex items-center gap-1">
        {trend.positive ? (
          <TrendingUp className="w-3 h-3 text-green-400" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400" />
        )}
        <span className={`text-[10px] font-medium ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
          {trend.value}
        </span>
      </div>
    )}
  </div>
);

export default ChannelScreen;
