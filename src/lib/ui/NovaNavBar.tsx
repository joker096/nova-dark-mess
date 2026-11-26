import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { IconArrowLeft as ArrowLeft } from '@tabler/icons-react';

interface NovaNavBarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  subtitle?: string;
  showDivider?: boolean;
}

export const NovaNavBar = forwardRef<HTMLDivElement, NovaNavBarProps>(
  ({
    left,
    center,
    right,
    showBack = false,
    onBack,
    backLabel = 'Back',
    title,
    subtitle,
    showDivider = true,
    className,
    children,
    style,
    ...props
  }, ref) => {
    const backButton = showBack && (
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--nova-overlay-medium)] active:scale-95 transition cursor-pointer"
        aria-label={backLabel}
        title={backLabel}
      >
        <ArrowLeft className="w-5 h-5 shrink-0" />
      </button>
    );

    const titleElement = title && (
      <div className="min-w-0 flex flex-col">
        <h1 className="text-[16px] font-semibold leading-tight tracking-tight text-[var(--text-primary)] truncate">
          {title}
        </h1>
        {subtitle && (
          <span className="text-[11px] leading-tight text-[var(--text-tertiary)] truncate">
            {subtitle}
          </span>
        )}
      </div>
    );

    return (
      <header
        ref={ref}
        className={`flex items-center justify-between gap-2 h-[52px] px-3 sm:px-4 bg-[var(--bg-screen)]/90 backdrop-blur-xl shrink-0 ${showDivider ? 'border-b border-[var(--border-divider)]' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {backButton}
          {left}
          {!center && titleElement}
        </div>

        {center && (
          <div className="flex items-center justify-center min-w-0 px-2">
            {center}
          </div>
        )}

        <div className="flex items-center gap-0.5 shrink-0 justify-end">
          {right}
        </div>

        {children}
      </header>
    );
  }
);

NovaNavBar.displayName = 'NovaNavBar';

export type { NovaNavBarProps };









