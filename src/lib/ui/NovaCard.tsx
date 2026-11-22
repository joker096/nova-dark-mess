import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

interface NovaCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const VARIANT_CONFIG: Record<string, string> = {
  default: 'bg-[var(--bg-surface)] border border-[var(--border)]',
  elevated: 'bg-[var(--bg-surface)] border border-[var(--border)] shadow-[var(--shadow-2)]',
  outline: 'bg-transparent border border-[var(--border-strong)]',
  accent: 'bg-[var(--accent-soft)] border border-[var(--accent)]',
};

const PADDING_CONFIG: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const BASE = 'rounded-2xl transition-colors duration-200';

export const NovaCard = forwardRef<HTMLDivElement, NovaCardProps>(
  ({ variant = 'default', padding = 'md', hover = false, className, children, ...props }, ref) => {
    const variantClasses = VARIANT_CONFIG[variant];
    const paddingClasses = PADDING_CONFIG[padding];
    const hoverClasses = hover ? 'hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]' : '';

    return (
      <div
        ref={ref}
        className={`${BASE} ${variantClasses} ${paddingClasses} ${hoverClasses} ${className ?? ''}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  },
);

NovaCard.displayName = 'NovaCard';

export type { NovaCardProps };
