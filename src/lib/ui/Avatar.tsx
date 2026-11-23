/**
 * Unified Avatar Component
 *
 * Replaces NovaAvatar and ChannelAvatar with a single component supporting:
 * - Single avatars (image/initials)
 * - Group avatars (2-3 overlapping)
 * - Channel avatars with special cases
 * - Status indicators (online/offline/busy/away)
 * - Flexible sizing (xs/sm/md/lg/xl + numeric px)
 * - Custom fallback colors, special channel icons
 */

import { forwardRef, useMemo, type HTMLAttributes } from 'react';
import { LazyMedia } from '../../components/LazyMedia';

export type AvatarSize = 'xs' | 'sm' | 's' | 'md' | 'm' | 'lg' | 'l' | 'xl' | number;
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

const SIZE_PX_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  s: 36,
  md: 40,
  m: 40,
  lg: 56,
  l: 56,
  xl: 80,
};

const STATUS_SIZE_MAP: Record<number, number> = {
  24: 8,
  32: 9,
  36: 10,
  40: 12,
  56: 14,
  80: 18,
};

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** Image source (http/data:/blob: URLs) */
  src?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Name for initials fallback */
  name?: string;
  /** Size preset or exact pixel value */
  size?: AvatarSize;
  /** Status indicator */
  status?: AvatarStatus;
  /** Show status indicator (default: true if status provided) */
  showStatus?: boolean;
  /** Custom status dot size in px */
  statusSize?: number;
  /** Force specific fallback background color (CSS color string or CSS variable) */
  fallbackColor?: string;
  /** Special channel avatar type */
  channelType?: 'default' | 'ukraine';
  /** Group avatar sources (2-3 URLs for overlapping avatars) */
  groupSources?: string[];
  /** Group member names for alt text */
  groupNames?: string[];
  /** Max avatars to show in group (default: 3) */
  maxGroupAvatars?: number;
  /** Gap between group avatars (negative = overlap) */
  groupGap?: number;
  /** Custom CSS class for wrapper */
  className?: string;
  /** Inline style for wrapper */
  style?: React.CSSProperties;
  /** Force use of initials even if src provided */
  forceInitials?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
}

const CHANNEL_COLORS = [
  'var(--c-name-1)', 'var(--c-name-2)', 'var(--c-name-3)',
  'var(--c-name-4)', 'var(--c-name-5)', 'var(--c-name-6)',
  'var(--c-name-7)', 'var(--c-name-8)',
];

function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHANNEL_COLORS[Math.abs(hash) % CHANNEL_COLORS.length];
}

function isImageUrl(src?: string): boolean {
  return Boolean(src && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')));
}

const UKRAINE_TRIDENT_SVG = (
  <svg className="h-[55%] w-[55%] fill-white" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
  </svg>
);

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt,
      name,
      size = 'md',
      status,
      showStatus,
      statusSize,
      fallbackColor,
      channelType = 'default',
      groupSources,
      groupNames,
      maxGroupAvatars = 3,
      groupGap = -8,
      className,
      style,
      forceInitials = false,
      ...props
    },
    ref
  ) => {
    const sizePx = useMemo(() => {
      if (typeof size === 'number') return size;
      return SIZE_PX_MAP[size] ?? SIZE_PX_MAP.md;
    }, [size]);

    const statusDotSize = statusSize ?? STATUS_SIZE_MAP[sizePx] ?? 10;
    const fontSize = Math.max(10, sizePx * 0.38);

    // Determine if we should show status
    const shouldShowStatus = showStatus ?? Boolean(status);
    const effectiveStatus = status ?? 'offline';

    const fallbackBgColor = useMemo(() => {
      if (fallbackColor) return fallbackColor;
      if (name) return getColorFromName(name);
      return 'var(--c-primary)';
    }, [fallbackColor, name]);

    const initials = name ? getInitials(name) : '?';

    // Ukraine trident special case for channels
    const isUkraineChannel = channelType === 'ukraine' && !src && !groupSources;

    // Group avatar logic
    const showGroup = Boolean(groupSources && groupSources.length > 1);
    const groupAvatars = showGroup ? groupSources.slice(0, maxGroupAvatars) : [];

    const renderSingleAvatar = () => {
      const hasImage = !forceInitials && isImageUrl(src);
      const isUkraine = isUkraineChannel;

      if (hasImage) {
        return (
          <LazyMedia
            src={src!}
            alt={alt ?? name ?? 'Avatar'}
            className="w-full h-full rounded-full object-cover"
            eager
          />
        );
      }

      if (isUkraine) {
        return (
          <div
            className="w-full h-full flex items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(to right top, #e11d48, var(--nova-accent-color))' }}
          >
            {UKRAINE_TRIDENT_SVG}
          </div>
        );
      }

      // Fallback: initials with generated color
      return (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-semibold select-none"
          style={{
            backgroundColor: fallbackBgColor,
            color: 'var(--c-on-primary)',
            fontSize: `${fontSize}px`,
          } as React.CSSProperties}
        >
          {initials}
        </div>
      );
    };

    const renderGroupAvatars = () => (
      <div className="flex items-center" style={{ gap: groupGap }} role="img" aria-label={`Group: ${groupNames?.join(', ') || 'Multiple people'}`}>
        {groupAvatars.map((source, i) => (
          <div
            key={source}
            className="relative shrink-0 rounded-full overflow-hidden border-2 border-[var(--bg-surface)] shadow-sm"
            style={{
              width: sizePx,
              height: sizePx,
              zIndex: groupAvatars.length - i,
            }}
            aria-label={groupNames?.[i] || `Member ${i + 1}`}
          >
            <LazyMedia
              src={source}
              alt={groupNames?.[i] || `Member ${i + 1}`}
              className="w-full h-full object-cover"
              eager
            />
          </div>
        ))}
        {groupSources && groupSources.length > maxGroupAvatars && (
          <div
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--bg-surface)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] font-semibold"
            style={{
              width: sizePx,
              height: sizePx,
              fontSize: `${fontSize * 0.8}px`,
            }}
            aria-label={`${groupSources.length - maxGroupAvatars} more`}
          >
            +{groupSources.length - maxGroupAvatars}
          </div>
        )}
      </div>
    );

    const avatarContent = showGroup ? renderGroupAvatars() : renderSingleAvatar();

    return (
      <div
        ref={ref}
        data-testid="avatar-wrapper"
        className={`relative inline-flex shrink-0 ${className ?? ''}`}
        style={{
          width: sizePx,
          height: sizePx,
          ...(style as React.CSSProperties),
        } as React.CSSProperties}
        {...props}
      >
        <div className="relative w-full h-full rounded-full overflow-hidden">
          {avatarContent}
        </div>

        {shouldShowStatus && effectiveStatus !== 'offline' && !showGroup && (
          <span
            className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center"
            style={{
              width: statusDotSize,
              height: statusDotSize,
              backgroundColor:
                effectiveStatus === 'online' ? 'var(--online)' :
                effectiveStatus === 'busy' ? 'var(--danger)' :
                effectiveStatus === 'away' ? 'var(--warning)' :
                'var(--text-secondary)',
            } as React.CSSProperties}
            aria-label={`Status: ${effectiveStatus}`}
          />
        )}

        {props.children}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';