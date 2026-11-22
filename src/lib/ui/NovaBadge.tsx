import { forwardRef, type HTMLAttributes } from 'react';

interface NovaBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  value: string | number;
  max?: number;
  variant?: 'default' | 'muted' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

function formatBadgeValue(value: string | number, max: number): string {
  if (typeof value === 'number') {
    if (value === 0) return '';
    if (value > max) {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return `${max}+`;
    }
    return String(value);
  }
  return String(value);
}

export const NovaBadge = forwardRef<HTMLSpanElement, NovaBadgeProps>(
  ({
    value,
    max = 99,
    variant = 'default',
    size = 'md',
    dot = false,
    className,
    style,
    children,
    ...props
  }, ref) => {
    const displayValue = formatBadgeValue(value, max);

    const variantClasses = {
      default: 'bg-[var(--accent)] text-[var(--text-on-accent)]',
      muted: 'bg-[var(--text-disabled)] text-[var(--text-primary)]',
      success: 'bg-[var(--success-soft)] text-[var(--success)]',
      warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
      danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
    };

    const sizeClasses = {
      sm: 'min-w-[16px] h-5 px-1 text-[10px]',
      md: 'min-w-[18px] h-5 px-1.5 text-[11px]',
      lg: 'min-w-[20px] h-6 px-2 text-[12px]',
    };

    const dotClasses = {
      sm: 'w-1.5 h-1.5',
      md: 'w-2 h-2',
      lg: 'w-2.5 h-2.5',
    };

    if (dot) {
      return (
        <span
          ref={ref}
          className={`inline-flex items-center justify-center rounded-full ${variantClasses[variant]} ${dotClasses[size]} ${className ?? ''}`}
          style={style}
          {...props}
        >
          {children}
        </span>
      );
    }

    return (
      <span
        ref={ref}
        className={`inline-flex items-center justify-center rounded-full font-bold ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ''}`}
        style={style}
        {...props}
      >
        {displayValue}
      </span>
    );
  },
);

NovaBadge.displayName = 'NovaBadge';

export type { NovaBadgeProps };
