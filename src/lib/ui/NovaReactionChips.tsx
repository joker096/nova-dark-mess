import { type ReactNode } from 'react';
import { NovaAvatar } from './NovaAvatar';
import { NovaBadge } from './NovaBadge';

interface Reaction {
  emoji: string;
  count: number;
  fromMe?: boolean;
}

export interface NovaReactionChipsProps {
  reactions: Reaction[];
  onReactionClick?: (emoji: string) => void;
  maxVisible?: number;
  showAvatars?: boolean;
  avatarSize?: 'xs' | 's' | 'm';
}

export function NovaReactionChips({
  reactions,
  onReactionClick,
  maxVisible = 5,
  showAvatars = false,
  avatarSize = 'xs',
}: NovaReactionChipsProps) {
  const visibleReactions = reactions.slice(0, maxVisible);
  const remainingCount = reactions.length - maxVisible;

  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Reactions">
      {visibleReactions.map((reaction, index) => (
        <button
          key={`${reaction.emoji}-${index}`}
          type="button"
          onClick={() => onReactionClick?.(reaction.emoji)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium transition-all duration-150 ${
            reaction.fromMe
              ? 'bg-[var(--bg-field)] border border-[var(--c-primary)] text-[var(--c-primary)]'
              : 'bg-[var(--bg-field)] text-[var(--text-primary)]'
          } hover:scale-[1.05] active:scale-[0.95] cursor-pointer`}
          aria-label={`${reaction.emoji} ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}`}
          aria-pressed={reaction.fromMe}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>{reaction.emoji}</span>
          {reaction.count > 1 && (
            <span className="text-[11px] font-bold">
              {reaction.count}
            </span>
          )}
        </button>
      ))}
      {remainingCount > 0 && (
        <NovaBadge
          value={remainingCount}
          variant="muted"
          size="sm"
          className="ml-0.5"
        />
      )}
      {showAvatars && reactions.length > 0 && (
        <div className="flex -space-x-1 ml-1" aria-hidden="true">
          {reactions
            .filter(r => r.fromMe)
            .slice(0, 3)
            .map((reaction, index) => (
              <NovaAvatar
                key={index}
                name={reaction.emoji}
                size={avatarSize}
                fallbackColor="var(--c-primary)"
              />
            ))}
        </div>
      )}
    </div>
  );
}