import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { formatCount } from './formatCount';

export interface NovaReactionPillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Single emoji shown before the counter. */
  emoji: string;
  count: number;
  /** Marks the pill as reacted by the current user. */
  selected?: boolean;
  className?: string;
}

/**
 * One reaction chip, shared by chat messages and channel posts.
 *
 * Selected pills use the accent token, so a reaction never needs its own color.
 */
export const NovaReactionPill = forwardRef<HTMLButtonElement, NovaReactionPillProps>(
  function NovaReactionPill(
    { emoji, count, selected = false, className = '', type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        aria-pressed={selected}
        className={[
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]',
          'active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed',
          selected
            ? 'border-[var(--nova-accent-color)]/50 bg-[var(--nova-accent-color)]/20 font-semibold text-white'
            : 'border-white/5 bg-[#1e2028] text-[#a6abb8] hover:bg-[#252834]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="text-[13px] leading-none" aria-hidden="true">
          {emoji}
        </span>
        <span className="text-[11px] font-medium tabular-nums">{formatCount(count)}</span>
      </button>
    );
  },
);