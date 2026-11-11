import { forwardRef } from 'react';
import type { ImgHTMLAttributes } from 'react';

interface NovaAvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> {
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away';
  showStatus?: boolean;
  className?: string;
}

const SIZE_CONFIG: Record<string, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-emerald-400',
  offline: 'bg-[#6b7280]',
  away: 'bg-[#f59e0b]',
};

const BASE_AVATAR =
  'rounded-full object-cover border border-white/10 flex items-center justify-center overflow-hidden';

const FALLBACK_TEXT =
  'text-white font-medium text-xs leading-none';

const STATUS_DOT =
  'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0d11] shadow-sm';

export const NovaAvatar = forwardRef<HTMLDivElement, NovaAvatarProps>(
  ({ name, size = 'md', status, showStatus = false, className, src, ...props }, ref) => {
    const sizeClass = SIZE_CONFIG[size];
    const initials = name
      ? name
          .split(' ')
          .map((n) => n[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '?';

    const hasImage = !!src;

    return (
      <div
        ref={ref}
        className={`relative ${sizeClass}`}
      >
        {hasImage ? (
          <img
            src={src}
            alt={name || ''}
            className={`${BASE_AVATAR} ${sizeClass} ${className ?? ''}`}
            {...props}
          />
        ) : (
          <div
            className={`${BASE_AVATAR} ${sizeClass} bg-[var(--nova-accent-color,#ff4e18)]/20 text-[var(--nova-accent-color,#ff4e18)] border-[var(--nova-accent-color,#ff4e18)]/30 ${className ?? ''} flex items-center justify-center`}
          >
            <span className={FALLBACK_TEXT}>{initials}</span>
          </div>
        )}
        {showStatus && status && status !== 'offline' && (
          <span
            className={`${STATUS_DOT} ${STATUS_COLORS[status]}`}
            aria-label={status}
          />
        )}
      </div>
    );
  },
);

NovaAvatar.displayName = 'NovaAvatar';

export type { NovaAvatarProps };
