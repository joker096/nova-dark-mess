import React from 'react';
import { LazyMedia } from './LazyMedia';

interface ChannelAvatarProps {
  avatar?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
};

const isImageAvatar = (avatar?: string): boolean =>
  Boolean(
    avatar &&
      (avatar.startsWith('http') ||
        avatar.startsWith('data:') ||
        avatar.startsWith('/')),
  );

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CH';

export const ChannelAvatar: React.FC<ChannelAvatarProps> = ({
  avatar,
  name,
  size = 'md',
  className,
}) => {
  if (isImageAvatar(avatar)) {
    return (
      <div
        className={`${SIZE_CLASS[size]} shrink-0 overflow-hidden rounded-full border border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)] ${className ?? ''}`.trim()}
      >
        <LazyMedia
  src={avatar}
  alt={name}
  className="h-full w-full object-cover"
  eager
/>
      </div>
    );
  }

  if (avatar === 'ukraine_trident') {
    return (
      <div
        className={`${SIZE_CLASS[size]} flex shrink-0 items-center justify-center rounded-full border border-[var(--nova-border-color)] bg-gradient-to-tr from-[#e11d48] to-[var(--nova-accent-color)] shadow-lg ${className ?? ''}`.trim()}
        aria-label={name}
      >
        <svg className="h-[55%] w-[55%] fill-white" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`${SIZE_CLASS[size]} flex shrink-0 items-center justify-center rounded-full border border-[var(--nova-border-color)] bg-gradient-to-tr from-[var(--nova-accent-color)]/80 to-[#7c3aed]/80 font-bold text-[var(--nova-on-accent)] ${className ?? ''}`.trim()}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
};
