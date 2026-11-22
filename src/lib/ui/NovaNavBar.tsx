import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface NovaNavBarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  title?: string;
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
        className="flex items-center gap-1.5 px-2 py-2 text-[var(--color-accent)] text-sm font-medium transition-colors hover:opacity-70 active:opacity-50"
        aria-label={backLabel}
      >
        <ChevronLeft className="w-5 h-5 shrink-0" />
        <span>{backLabel}</span>
      </button>
    );

    const titleElement = title && (
      <h1 className="text-[17px] font-semibold leading-[22px] tracking-[-0.011em] text-[var(--text-primary)] truncate">
        {title}
      </h1>
    );

    return (
      <header
        ref={ref}
        className={`flex items-center justify-between h-[44px] px-[var(--space-screen)] bg-[var(--bg-screen)] ${showDivider ? 'border-b border-[var(--border-divider)]' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        <div className="flex items-center gap-2 min-w-0">
          {backButton}
          {left}
        </div>

        <div className="flex items-center justify-center flex-1 min-w-0 px-4">
          {center ?? titleElement}
        </div>

        <div className="flex items-center gap-2 min-w-0 justify-end">
          {right}
        </div>

        {children}
      </header>
    );
  }
);

NovaNavBar.displayName = 'NovaNavBar';

export type { NovaNavBarProps };