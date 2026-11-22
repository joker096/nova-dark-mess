import { forwardRef, type HTMLAttributes, useMemo } from 'react';
import { LazyMedia } from '../../components/LazyMedia';

interface NovaAvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 's' | 'm' | 'l' | 'xl' | number;
  status?: 'online' | 'offline' | 'busy' | 'away';
  showStatus?: boolean;
  statusSize?: number;
  fallbackColor?: string;
}

const SIZE_MAP = {
  xs: 24,
  sm: 36,
  s: 36,
  m: 40,
  l: 100,
  xl: 120,
} as const;

const STATUS_SIZE_MAP = {
  24: 8,
  36: 10,
  40: 12,
  100: 24,
  120: 28,
} as const;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string): string {
  const colors = [
    'var(--c-name-1)',
    'var(--c-name-2)',
    'var(--c-name-3)',
    'var(--c-name-4)',
    'var(--c-name-5)',
    'var(--c-name-6)',
    'var(--c-name-7)',
    'var(--c-name-8)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const NovaAvatar = forwardRef<HTMLDivElement, NovaAvatarProps>(
  ({
    src,
    alt,
    name,
    size = 'm',
    status,
    showStatus = false,
    statusSize,
    fallbackColor,
    className,
    style,
    children,
    ...props
  }, ref) => {
    const sizePx = typeof size === 'number' ? size : SIZE_MAP[size];
    const statusDotSize = statusSize ?? STATUS_SIZE_MAP[sizePx as keyof typeof STATUS_SIZE_MAP] ?? 10;
    const fontSize = sizePx * 0.4;

    const fallbackBgColor = useMemo(() => {
      if (fallbackColor) return fallbackColor;
      if (name) return getColorFromName(name);
      return 'var(--c-primary)';
    }, [fallbackColor, name]);

    const initials = name ? getInitials(name) : '?';

    return (
      <div
        ref={ref}
        data-testid="avatar-wrapper"
        className={`relative inline-flex shrink-0 ${className ?? ''}`}
        style={{
          ...(style as React.CSSProperties),
          width: sizePx,
          height: sizePx,
        } as React.CSSProperties}
        {...props}
      >
        {src ? (
          <LazyMedia
            src={src}
            alt={alt ?? name ?? 'Avatar'}
            className="w-full h-full rounded-full object-cover"
            eager
          />
        ) : (
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
        )}

        {showStatus && status && status !== 'offline' && (
          <span
            className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--bg-screen)] flex items-center justify-center"
            style={{
              width: statusDotSize,
              height: statusDotSize,
              backgroundColor: status === 'online' ? 'var(--c-online)' : 'var(--text-secondary)',
            } as React.CSSProperties}
            aria-label={`Status: ${status}`}
          />
        )}

        {children}
      </div>
    );
  }
);

NovaAvatar.displayName = 'NovaAvatar';

export type { NovaAvatarProps };