import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Paperclip,
  Volume2,
  VolumeX,
  MessageCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Clock,
  Trash2,
  Copy,
  Check,
  Radio,
  MoreVertical,
  SmilePlus,
} from 'lucide-react';
import { MOCK_CHANNEL_POSTS } from '../data/mockMessengerData';
import type {
  ChannelDraft,
  ChannelInfo,
  ChannelPost,
  ChannelPostDraft,
} from '../types/messenger';
import { DoodleBackground } from './DoodleBackground';
import { useLanguage } from '../context/LanguageContext';
import { usePremium } from '../hooks/usePremium';
import { ChannelAvatar } from './ChannelAvatar';
import { ChannelSwitcherModal } from './ChannelSwitcherModal';
import { ChannelCreateModal } from './ChannelCreateModal';
import { ChannelPostComposerModal } from './ChannelPostComposerModal';
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
  onCreatePost?: (channelId: string, draft: ChannelPostDraft) => ChannelPost | void;
  onDeletePost?: (postId: string) => void;
  onToggleReaction?: (postId: string, emoji: string) => void;
  onToggleSound?: (channelId: string, enabled: boolean) => void;
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
  onCreatePost,
  onDeletePost,
  onToggleReaction,
  onToggleSound,
}) => {
  const { t, language } = useLanguage();
  const { checkout, canUse } = usePremium();
  const fallbackChannels = useMemo(() => [createDefaultChannel()], []);
  const availableChannels = channels ?? fallbackChannels;
  const channel = availableChannels.find((item) => item.id === channelId) ?? availableChannels[0];

  const sourcePosts = useMemo(() => {
    if (posts !== undefined) return posts;
    return channel?.id === KYIV_CHANNEL_ID ? MOCK_CHANNEL_POSTS : [];
  }, [posts, channel?.id]);

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [customReactionEmoji, setCustomReactionEmoji] = useState('');
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const postsScrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const lastManualToggleRef = useRef(0);
  const manualCollapsedRef = useRef(false);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const scrollAccumulatorRef = useRef(0);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!postMenuId) return undefined;
    const closeMenu = () => setPostMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [postMenuId]);

  useEffect(() => {
    if (!reactionPickerPostId) return undefined;
    const closePicker = () => setReactionPickerPostId(null);
    document.addEventListener('click', closePicker);
    return () => document.removeEventListener('click', closePicker);
  }, [reactionPickerPostId]);

  useEffect(() => {
    setReactionPickerPostId(null);
  }, [selectedDay]);

  useEffect(() => {
    const scrollNode = postsScrollRef.current;
    if (scrollNode) {
      scrollNode.scrollTop = 0;
    }
    lastScrollTopRef.current = 0;
    manualCollapsedRef.current = false;
    scrollDirectionRef.current = null;
    scrollAccumulatorRef.current = 0;
    setHeaderCollapsed(false);
  }, [selectedDay]);

  const toggleHeader = () => {
    const nextCollapsed = !headerCollapsed;
    lastManualToggleRef.current = Date.now();
    manualCollapsedRef.current = nextCollapsed;
    scrollDirectionRef.current = null;
    scrollAccumulatorRef.current = 0;
    setHeaderCollapsed(nextCollapsed);
    setPostMenuId(null);
    setReactionPickerPostId(null);
  };

  const handlePostsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
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
    } else if (
      scrollDirectionRef.current === 'up' &&
      scrollAccumulatorRef.current >= HEADER_SCROLL_DELTA &&
      !manualCollapsedRef.current
    ) {
      scrollAccumulatorRef.current = 0;
      setHeaderCollapsed(false);
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2200);
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

  const daysWithPosts = useMemo(
    () => new Set(channelPosts.map((post) => dayKey(postCreatedAt(post)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelPosts, now],
  );

  const dayPosts = useMemo(
    () =>
      channelPosts
        .filter((post) => dayKey(postCreatedAt(post)) === selectedDay)
        .filter((post) => Boolean(channel?.isOwned) || !isPostScheduled(post, now))
        .sort((a, b) => postCreatedAt(a) - postCreatedAt(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelPosts, selectedDay, channel?.isOwned, now],
  );

  const query = searchQuery.trim().toLowerCase();
  const displayPosts = dayPosts.filter(
    (post) =>
      !query ||
      post.title.toLowerCase().includes(query) ||
      post.text.toLowerCase().includes(query),
  );

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
    setFocusDate(dayKey(startOfDay(next)));
  };

  const focus = new Date(focusDate);
  const focusMonth = focus.getMonth();
  const focusYear = focus.getFullYear();

  const nowYear = now ? new Date(now).getFullYear() : new Date().getFullYear();
  const YEAR_OPTIONS = useMemo(
    () => Array.from({ length: 21 }, (_, i) => nowYear - 10 + i),
    [nowYear],
  );

  const setFocusMonth = (month: number) => {
    setFocusDate(dayKey(new Date(focusYear, month, 1)));
  };

  const setFocusYear = (year: number) => {
    setFocusDate(dayKey(new Date(year, focusMonth, 1)));
  };

  const applyMonthPicker = () => {
    setIsMonthPickerOpen(false);
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
      <div className="relative flex h-full flex-col overflow-hidden bg-[#0b0c10] text-white select-none">
        <DoodleBackground />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#181921] text-[var(--nova-accent-color)]">
            <Radio className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-white">{t('channel.noChannels')}</p>
          <p className="mt-1 max-w-[260px] text-xs text-[#828795]">
            {t('channel.noChannelsSubtitle')}
          </p>
          <button
            type="button"
            onClick={() => setCreateChannelOpen(true)}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-[var(--nova-accent-color)] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[var(--nova-accent-color)]/25 transition hover:brightness-110 active:scale-95"
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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0b0c10] text-white select-none">
      {/* Floating Header Card with Date Scrubber */}
      <div className="relative z-20 shrink-0 p-3">
          <div
            className={`relative overflow-hidden rounded-3xl border border-white/10 shadow-xl shadow-black/70 backdrop-blur-xl transition-all duration-300 ${
              headerCollapsed ? 'p-2' : 'p-3 min-h-[200px]'
            } bg-[#14151c]/70`}
          >
          {/* Channel Top row */}
          <div
            className={`flex items-center justify-between gap-2 ${
              headerCollapsed ? '' : 'mb-2'
            }`}
          >
            <button
              onClick={onBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#1e2029]/80 text-white/90 transition active:scale-95 md:hidden"
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-[16px] font-bold tracking-tight text-white">
                {channel.name}
              </h2>
              <p className="text-[11px] text-[#868b98]">
                {t('channel.subscribersCompact', { value: subscribersLabel })}
              </p>
            </div>

            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? t('channel.soundOn') : t('channel.soundOff')}
              title={soundEnabled ? t('channel.soundOn') : t('channel.soundOff')}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                soundEnabled
                  ? 'border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/25'
                  : 'border-white/5 bg-[#1e2029]/80 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 pr-1.5 transition hover:bg-white/10 active:scale-95"
              aria-label={t('channel.switchChannel')}
              title={t('channel.switchChannel')}
            >
              <ChannelAvatar
                avatar={channel.avatar}
                name={channel.name}
                size="sm"
                className="opacity-80"
              />
              <ChevronsUpDown className="h-3.5 w-3.5 text-white/45" />
            </button>

            <button
              type="button"
              onClick={toggleHeader}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#1e2029]/80 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
              aria-label={
                headerCollapsed
                  ? t('channel.expandPanel')
                  : t('channel.collapsePanel')
              }
              title={
                headerCollapsed
                  ? t('channel.expandPanel')
                  : t('channel.collapsePanel')
              }
              aria-expanded={!headerCollapsed}
              aria-controls="channel-date-scrubber"
            >
              {headerCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Date Scrubber / Timeline Ruler */}
          {!headerCollapsed && (
            <div id="channel-date-scrubber" className="w-full px-1">
              <div className="mb-1 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition hover:bg-white/5 hover:text-white"
                  aria-label={t('channel.previousMonth')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleJumpToMonth}
                    className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 transition hover:text-white"
                    aria-label={t('channel.jumpToMonth')}
                    disabled={!canUse('date_picker')}
                  >
                    {monthLabel}
                    {canUse('date_picker') && (
                      <ChevronDown className="h-3 w-3 text-white/40" />
                    )}
                    {!canUse('date_picker') && (
                      <span className="text-[8px] opacity-70">(Premium)</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-white/55 transition hover:border-[var(--nova-accent-color)]/40 hover:text-white"
                  >
                    {t('channel.today')}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition hover:bg-white/5 hover:text-white"
                  aria-label={t('channel.nextMonth')}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {canUse('date_picker') && isMonthPickerOpen && (
                <div className="mt-1 px-1 flex items-center gap-2">
                  <label className="text-[9px] text-[#868b98] uppercase tracking-wider">Month</label>
                  <select
                    value={String(focusMonth)}
                    onChange={(e) => setFocusMonth(Number(e.target.value))}
                    className="rounded border border-white/10 bg-[#1e2029]/60 px-2 py-1 text-[11px] text-white outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <label className="text-[9px] text-[#868b98] uppercase tracking-wider">Year</label>
                  <select
                    value={String(focusYear)}
                    onChange={(e) => setFocusYear(Number(e.target.value))}
                    className="rounded border border-white/10 bg-[#1e2029]/60 px-2 py-1 text-[11px] text-white outline-none"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyMonthPicker}
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-white/10"
                  >
                    Apply
                  </button>
                </div>
              )}

              <div
                ref={dateScrubberRef}
                className="w-full flex items-center gap-x-1 px-1 overflow-x-scroll no-scrollbar flex-nowrap"
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
                const hasPosts = daysWithPosts.has(key);
                const weekday = new Intl.DateTimeFormat(language, {
                  weekday: 'short',
                }).format(date);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className="shrink-0 min-w-[48px] group relative z-10 flex flex-col items-center transition active:scale-95"
                    aria-label={new Intl.DateTimeFormat(language, {
                      dateStyle: 'full',
                    }).format(date)}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wide ${
                        isSelected ? 'text-white/65' : 'text-white/30'
                      }`}
                    >
                      {weekday}
                    </span>
                    <div
                      className={`mt-0.5 rounded-lg border px-2 py-0.5 text-[12px] font-semibold transition ${
                        isSelected
                          ? 'scale-110 border-white/15 bg-[#22242f] text-white shadow-sm'
                          : 'border-transparent text-[#6e727e] group-hover:text-white/80'
                      } ${isToday && !isSelected ? 'ring-1 ring-inset ring-[var(--nova-accent-color)]/50' : ''}`}
                    >
                      {date.getDate()}
                    </div>
                    <div
                      className={`my-1 h-[1px] w-[1px] transition ${
                        isSelected
                          ? 'h-3 bg-[var(--nova-accent-color)]'
                          : 'h-1.5 bg-white/20 group-hover:bg-white/40'
                      }`}
                    />
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        hasPosts
                          ? 'bg-[var(--nova-accent-color)] shadow-sm shadow-[var(--nova-accent-color)]'
                          : 'bg-transparent'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar when toggled */}
      {searchOpen && (
        <div className="relative z-20 px-4 pb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('channel.searchFeedPlaceholder')}
            className="w-full rounded-2xl border border-white/10 bg-[#171820] px-4 py-2 text-xs text-white placeholder-white/30 focus:border-[var(--nova-accent-color)]/60 focus:outline-none"
          />
        </div>
      )}

      {/* Posts Stream */}
      <div
        ref={postsScrollRef}
        onScroll={handlePostsScroll}
        data-testid="channel-posts-scroll"
        className="relative z-10 flex-1 overflow-y-auto px-4 py-1 pb-20"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#868b98]">
            {dateLabel}
          </span>
          <span className="text-[10px] text-[#636875]">
            {t('channel.postsCount', { count: displayPosts.length })}
          </span>
        </div>

        {displayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-[#181921] text-white/30">
              <Radio className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-white/80">
              {query ? t('channel.noSearchResults') : t('channel.noPosts')}
            </p>
            <p className="mt-1 max-w-[230px] text-xs text-[#717682]">
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
                className="mt-3 flex items-center gap-1.5 rounded-full bg-[var(--nova-accent-color)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-[var(--nova-accent-color)]/25 transition hover:brightness-110 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('channel.newPost')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {displayPosts.map((post) => {
              const scheduled = isPostScheduled(post, now);
              const postCardClassName = scheduled
                ? 'bg-[#171820]/80 border border-dashed border-[var(--nova-accent-color)]/40 shadow-md shadow-black/40'
                : 'bg-[#171820]/95 border border-white/5 shadow-md shadow-black/50';

              return (
                <div key={post.id} className="relative flex items-start gap-2.5">
                  {/* Left Timestamp Margin */}
                  <div className="w-10 shrink-0 pt-3 text-right text-[11px] font-medium tabular-nums text-[#717682]">
                    {post.time}
                  </div>

                  {/* Post Card */}
                  <div className={`flex-1 space-y-3 rounded-[24px] p-4 text-white ${postCardClassName}`}>
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

                    {/* Media Image Banner if present */}
                    {post.image && (
                      <div className="group relative aspect-[16/9] overflow-hidden rounded-[18px] bg-[#22242e]">
                        <img
                          src={post.image}
                          alt={post.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        {post.imageBadge && (
                          <div className="absolute bottom-2.5 left-2.5 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                            {post.imageBadge}
                          </div>
                        )}
                        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                        </div>
                      </div>
                    )}

                    {/* Title & menu */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14.5px] font-bold leading-snug text-white">
                        {post.title}
                      </h3>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPostMenuId((current) =>
                              current === post.id ? null : post.id,
                            );
                          }}
                          className="rounded-full p-1 text-white/40 transition hover:bg-white/5 hover:text-white"
                          aria-label={t('common.more')}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {postMenuId === post.id && (
                          <div
                            className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-white/10 bg-[#1b1c28] p-1 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                showToast(t('channel.linkCopied'));
                                setPostMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-white/75 transition hover:bg-white/5 hover:text-white"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {t('common.copy')}
                            </button>
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
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Body Text */}
                    {post.text && (
                      <p className="text-[13px] font-normal leading-relaxed text-[#a0a5b2]">
                        {post.text}
                      </p>
                    )}

                    {/* Reactions & Comments Row */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-[#1e2028] px-2.5 py-1 text-xs font-medium text-[#8c919d]">
                        <MessageCircle className="h-3.5 w-3.5 text-[#8c919d]" />
                        <span>{post.commentsCount}</span>
                      </div>

                      {post.reactions.map((reaction, index) => (
                        <button
                          key={`${reaction.emoji}-${index}`}
                          type="button"
                          onClick={() => handleToggleReaction(post.id, reaction.emoji)}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition active:scale-90 ${
                            reaction.userReacted
                              ? 'border border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/20 font-semibold text-white'
                              : 'border border-white/5 bg-[#1e2028] text-[#a6abb8] hover:bg-[#252834]'
                          }`}
                        >
                          <span className="text-[13px]">{reaction.emoji}</span>
                          <span className="text-[11px] font-medium tabular-nums">
                            {reaction.count}
                          </span>
                        </button>
                      ))}

                      {onToggleReaction && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setReactionPickerPostId((current) =>
                                current === post.id ? null : post.id,
                              );
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded-full border transition active:scale-90 ${
                              reactionPickerPostId === post.id
                                ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]'
                                : 'border-white/5 bg-[#1e2028] text-[#8c919d] hover:bg-[#252834] hover:text-white'
                            }`}
                            aria-label={t('common.react')}
                            title={t('common.react')}
                            aria-expanded={reactionPickerPostId === post.id}
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </button>

                          {reactionPickerPostId === post.id && (
                            <div
                              className="absolute bottom-9 left-0 z-30 grid w-[152px] grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-[#1b1c28] p-1.5 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {POST_REACTIONS.map((emoji) => {
                                const reacted = post.reactions.some(
                                  (reaction) =>
                                    reaction.emoji === emoji && reaction.userReacted,
                                );
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      handleToggleReaction(post.id, emoji);
                                      setReactionPickerPostId(null);
                                    }}
                                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm transition active:scale-90 ${
                                      reacted
                                        ? 'bg-[var(--nova-accent-color)]/20 ring-1 ring-[var(--nova-accent-color)]/50'
                                        : 'hover:bg-white/10'
                                    }`}
                                    aria-label={`${t('common.react')} ${emoji}`}
                                    aria-pressed={reacted}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                              {/* Custom reaction input */}
                              <div className="col-span-4 flex items-center gap-1 pt-1">
                                <input
                                  type="text"
                                  value={customReactionEmoji}
                                  onChange={(e) => setCustomReactionEmoji(e.target.value)}
                                  maxLength={2}
                                  className="flex-1 bg-[#1e2028] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-[#6e727e] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                                  placeholder="❤️"
                                  title="Свой эмодзи"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const emoji = customReactionEmoji.trim();
                                    if (!emoji) return;
                                    handleToggleReaction(post.id, emoji);
                                    setCustomReactionEmoji('');
                                    setReactionPickerPostId(null);
                                  }}
                                  disabled={!customReactionEmoji.trim()}
                                  className="flex h-8 w-8 items-center justify-center rounded-xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                    customReactionEmoji.trim()
                                      ? 'bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] ring-1 ring-[var(--nova-accent-color)]/50'
                                      : 'hover:bg-white/10 text-white/60'
                                  }"
                                  aria-label="Добавить свой эмодзи"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {post.reactions.some((reaction) => reaction.userReacted) && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--nova-accent-color)]">
                          <Check className="h-3 w-3" />
                          {t('channel.youReacted')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-full border border-[var(--nova-accent-color)]/50 bg-[#1e202a]/95 px-3.5 py-1.5 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="relative z-20 shrink-0 p-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => showToast(t('channel.linkCopied'))}
            className="mr-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#181920]/95 text-white/70 shadow-md transition hover:bg-[#20222a] hover:text-white active:scale-95"
            title={t('common.share')}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen((current) => !current)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/10 shadow-md transition active:scale-95 ${
              searchOpen
                ? 'bg-[var(--nova-accent-color)] text-white'
                : 'bg-[#181920]/95 text-white/70 hover:bg-[#20222a] hover:text-white'
            }`}
            title={t('common.search')}
          >
            <Search className="h-4 w-4" />
          </button>

          {channel.isOwned && onCreatePost && (
            <button
              type="button"
              onClick={() => setPostComposerOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nova-accent-color)] text-white shadow-lg shadow-[var(--nova-accent-color)]/30 transition hover:brightness-110 active:scale-95"
              title={t('channel.newPost')}
              aria-label={t('channel.newPost')}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

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
      />

      <ChannelCreateModal
        isOpen={createChannelOpen}
        onClose={() => setCreateChannelOpen(false)}
        onCreate={handleCreateChannel}
      />

      <ChannelPostComposerModal
        isOpen={postComposerOpen}
        onClose={() => setPostComposerOpen(false)}
        channelName={channel.name}
        onPublish={handlePublishPost}
      />
    </div>
  );
};
