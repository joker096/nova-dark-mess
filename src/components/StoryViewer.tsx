import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Trash2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { isStoryScheduled, storyPublishAt } from '../lib/social/store';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import type { Story } from '../types/messenger';
import { LazyMedia } from './LazyMedia';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  onViewed?: (storyId: string) => void;
  onDelete?: (storyId: string) => void;
  onToggleReaction?: (storyId: string, emoji: string) => void;
  now?: number;
}

const STORY_DURATION_MS = 6000;
const TICK_MS = 60;
const PROGRESS_STEP = (TICK_MS / STORY_DURATION_MS) * 100;
const STORY_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏', '🎉'];

export const StoryViewer: React.FC<StoryViewerProps> = ({
  stories,
  initialIndex,
  onClose,
  onViewed,
  onDelete,
  onToggleReaction,
  now = Date.now(),
}) => {
  const { t, language } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, stories.length - 1)),
  );
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const activeStory = stories[index];

  useEffect(() => {
    if (stories.length === 0) {
      onClose();
      return;
    }
    setIndex((current) => Math.min(current, stories.length - 1));
  }, [stories.length, onClose]);

  useEffect(() => {
    setProgress(0);
  }, [index, activeStory?.id]);

  const advance = useCallback(() => {
    if (index >= stories.length - 1) {
      onClose();
      return;
    }
    setIndex((current) => current + 1);
  }, [index, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (index <= 0) {
      setProgress(0);
      return;
    }
    setIndex((current) => current - 1);
  }, [index]);

  useEffect(() => {
    if (!activeStory || paused) return undefined;

    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(100, current + PROGRESS_STEP));
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [activeStory, paused, index]);

  useEffect(() => {
    if (progress >= 100) {
      advance();
    }
  }, [progress, advance]);

  const activeStoryId = activeStory?.id;
  const activeStoryIsMine = activeStory?.isMine;

  useEffect(() => {
    if (activeStoryId && !activeStoryIsMine) {
      onViewed?.(activeStoryId);
    }
  }, [activeStoryId, activeStoryIsMine, onViewed]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') advance();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, goPrev, onClose]);

  if (!activeStory) return null;

  const scheduled = isStoryScheduled(activeStory, now);
  const publishAt = storyPublishAt(activeStory) ?? now;
  const diff = Math.max(0, now - publishAt);

  const timeLabel = scheduled
    ? t('stories.scheduledFor', {
        date: new Intl.DateTimeFormat(language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(publishAt)),
      })
    : diff < 60 * 1000
      ? t('common.justNow')
      : diff < 60 * 60 * 1000
        ? t('common.minutesAgo', { count: Math.floor(diff / (60 * 1000)) })
        : t('common.hoursAgo', { count: Math.floor(diff / (60 * 60 * 1000)) });

  const handleDelete = () => {
    onDelete?.(activeStory.id);
    if (stories.length <= 1) {
      onClose();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={t('stories.viewStory')}
    >
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden sm:h-[92vh] sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/80">
        <LazyMedia
          src={activeStory.coverImage}
          alt=""
          eager
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/10 to-black/85" />

        {/* Progress segments */}
        <div className="relative z-20 flex gap-1 px-3 pt-3">
          {stories.map((story, storyIndex) => {
            const width =
              storyIndex < index ? 100 : storyIndex > index ? 0 : progress;
            return (
              <div
                key={story.id}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
                  style={{ width: `${width}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Header */}
        <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/25 bg-black/40">
                <LazyMedia
                  src={activeStory.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  eager
                />
              </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{activeStory.name}</p>
              <p className="flex items-center gap-1 text-[10px] text-white/65">
                {scheduled && <Clock className="h-3 w-3 text-[var(--nova-accent-color)]" />}
                {timeLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {activeStory.isMine && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/75 backdrop-blur-md transition hover:bg-red-500/25 hover:text-red-300"
                aria-label={t('stories.deleteStory')}
                title={t('stories.deleteStory')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition hover:bg-white/20"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tap zones */}
        <button
          type="button"
          onClick={goPrev}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-pointer"
          aria-label={t('common.previous')}
        />
        <button
          type="button"
          onClick={advance}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
          className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-pointer"
          aria-label={t('common.next')}
        />

        {/* Caption */}
        <div className="relative z-20 mt-auto px-4 pb-5 pt-16">
          {scheduled && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--nova-accent-color)]/40 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-[var(--nova-accent-color)] backdrop-blur-md">
              <Clock className="h-3 w-3" />
              {t('stories.scheduled')}
            </div>
          )}

          {activeStory.caption && (
            <p className="mb-3 text-sm font-medium leading-relaxed text-white drop-shadow-lg">
              {activeStory.caption}
            </p>
          )}

          {!activeStory.isMine && onToggleReaction && (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
              {STORY_REACTIONS.map((emoji) => {
                const reaction = activeStory.reactions?.find(
                  (item) => item.emoji === emoji,
                );
                const reacted = Boolean(reaction?.userReacted);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onToggleReaction(activeStory.id, emoji)}
                    aria-label={`${t('common.react')} ${emoji}`}
                    aria-pressed={reacted}
                    className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm backdrop-blur-md transition active:scale-90 ${
                      reacted
                        ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/25 text-white'
                        : 'border-white/15 bg-black/35 text-white/80 hover:bg-black/50'
                    }`}
                  >
                    <span>{emoji}</span>
                    {reaction && reaction.count > 0 && (
                      <span className="text-[10px] font-semibold tabular-nums">
                        {reaction.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-full border border-white/10 bg-black/35 px-3.5 py-2 backdrop-blur-md">
            <span className="text-[11px] text-white/55">
              {t('stories.tapToAdvance')}
            </span>
            <div className="flex items-center gap-1 text-white/45">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
