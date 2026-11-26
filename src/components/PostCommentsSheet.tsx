import React, { useEffect, useRef } from 'react';
import {IconMessageCircle as MessageCircle, IconSend as Send, IconX as X} from '@tabler/icons-react';
import type { ChannelComment, ChannelPost } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface PostCommentsSheetProps {
  post: ChannelPost;
  comments: ChannelComment[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAddComment: (text: string) => void;
  onClose: () => void;
  /** Moves focus back to the trigger once the sheet is gone. */
  returnFocusTo?: HTMLElement | null;
}

/**
 * Comments for one channel post.
 *
 * Mobile gets a sheet that covers most of the screen; from md up it docks to
 * the right edge so the feed stays readable behind it.
 */
export const PostCommentsSheet: React.FC<PostCommentsSheetProps> = ({
  post,
  comments,
  draft,
  onDraftChange,
  onAddComment,
  onClose,
  returnFocusTo,
}) => {
  const { t, language } = useLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  useEffect(() => {
    return () => {
      returnFocusTo?.focus?.();
    };
  }, [returnFocusTo]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAddComment(text);
    onDraftChange('');
    inputRef.current?.focus();
  };

  const timeLabel = (createdAt: number) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(createdAt),
    );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in md:items-stretch md:justify-end"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-comments-title"
        data-testid="post-comments-sheet"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--nova-border-color)] bg-[var(--nova-surface)] shadow-2xl shadow-black/80 md:h-full md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl md:border-y-0 md:border-r-0"
      >
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--nova-border-color)] px-4 backdrop-blur-xl">
          <MessageCircle className="h-4 w-4 shrink-0 text-[var(--nova-accent-color)]" aria-hidden="true" />
          <h2 id="post-comments-title" className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--nova-text-primary)]">
            {t('channel.commentsCount', { count: comments.length })}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Quoted post keeps the panel readable without the whole feed behind it. */}
        <div className="shrink-0 border-b border-[var(--nova-border-color)] px-4 py-2.5">
          <p className="line-clamp-1 text-[11px] font-semibold text-[var(--nova-text-secondary)]">{post.title}</p>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--nova-text-muted)]">{post.text}</p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {comments.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--nova-text-muted)]">{t('channel.noComments')}</p>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nova-surface-high)] text-[10px] font-bold uppercase text-[var(--nova-text-secondary)]"
                aria-hidden="true"
              >
                {comment.authorName.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[11px] font-semibold text-[var(--nova-text-primary)]">
                    {comment.authorName}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--nova-text-muted)]">
                    {timeLabel(comment.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--nova-text-secondary)]">
                  {comment.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--nova-border-color)] px-3 py-2.5 pb-[max(0.625rem,var(--nova-safe-bottom))]">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t('channel.commentPlaceholder')}
            aria-label={t('channel.commentPlaceholder')}
            className="min-w-0 flex-1 bg-[var(--nova-overlay-weak)]/50 rounded-xl px-3 py-2.5 text-sm text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('channel.sendComment')}
            title={t('channel.sendComment')}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};










