import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {IconLoader2 as Loader2} from '@tabler/icons-react';
import { useShortcutLabel } from '../../hooks/useShortcuts';
import { formatCount } from './formatCount';

export type IconButtonSize = 32 | 36 | 44;
export type IconButtonVariant = 'ghost' | 'subtle' | 'primary' | 'danger';

export interface NovaIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: icon-only buttons must be announced. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** Number shown in the corner badge; `0`/`undefined` hides it. */
  badge?: number;
  /** Test ID for the badge element (for testing). */
  badgeTestId?: string;
  /** Highlights the button as the current section. */
  active?: boolean;
  loading?: boolean;
  /** Shortcut combo such as `mod+k`, rendered for the current platform. */
  shortcut?: string;
  /** Renders the shortcut text next to the icon (wide layouts only). */
  showShortcut?: boolean;
}

const SIZES: Record<IconButtonSize, string> = {
  32: 'w-8 h-8 min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px]',
  36: 'w-9 h-9 min-w-[40px] min-h-[40px] sm:min-w-[36px] sm:min-h-[36px]',
  44: 'w-11 h-11 min-w-[44px] min-h-[44px]',
};

const ICON_SIZES: Record<IconButtonSize, string> = {
  32: 'w-4 h-4',
  36: 'w-[19px] h-[19px]',
  44: 'w-5 h-5',
};

const ICON_WRAPPERS: Record<IconButtonSize, string> = {
  32: '[&>svg]:w-4 [&>svg]:h-4',
  36: '[&>svg]:w-[19px] [&>svg]:h-[19px]',
  44: '[&>svg]:w-5 [&>svg]:h-5',
};

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--nova-overlay-medium)] active:bg-[var(--nova-overlay-strong)]',
  subtle:
    'bg-[var(--bg-surface-2)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
  primary:
    'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-lg shadow-[var(--nova-accent-color)]/30 hover:brightness-110',
  danger:
    'bg-transparent text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]',
};

export const NovaIconButton = forwardRef<HTMLButtonElement, NovaIconButtonProps>(function NovaIconButton(
  {
    label,
    icon,
    size = 36,
    variant = 'ghost',
    badge,
    badgeTestId,
    active = false,
    loading = false,
    shortcut,
    showShortcut = false,
    className = '',
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const shortcutLabel = useShortcutLabel(shortcut ?? '');
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={[
        'relative shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full',
        'transition cursor-pointer active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-canvas,#0c0d11)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        SIZES[size],
        VARIANTS[variant],
        active && size !== 44 ? 'text-[var(--text-primary)] bg-[var(--bg-surface-2)]' : '',
        showShortcut && shortcutLabel ? 'px-3 w-auto' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={`inline-flex items-center justify-center ${ICON_WRAPPERS[size]} ${loading ? 'opacity-0' : ''}`}>
        {icon}
      </span>
      {showShortcut && shortcutLabel && (
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{shortcutLabel}</span>
      )}
      {loading && <Loader2 className={`absolute animate-spin ${ICON_SIZES[size]}`} aria-hidden="true" />}
      {badge !== undefined && badge > 0 && (
        <span
          data-testid={badgeTestId}
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] text-[9px] font-bold leading-4 text-center shadow-sm"
          aria-hidden="true"
        >
          {formatCount(badge, { max: 99 })}
        </span>
      )}
    </button>
  );
});










