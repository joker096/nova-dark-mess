import { forwardRef, type HTMLAttributes } from 'react';

interface NovaBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  value: string | number;
  max?: number;
  variant?: 'default' | 'muted' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
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
    const displayValue = typeof value === 'number' && value > max ? `${max}+` : String(value);

    const variantClasses = {
      default: 'bg-[var(--c-badge)] text-[var(--c-on-primary)]',
      muted: 'bg-[var(--c-badge-muted)] text-white',
      success: 'bg-emerald-500 text-white',
      warning: 'bg-amber-500 text-white',
      danger: 'bg-red-500 text-white',
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
  }
);

NovaBadge.displayName = 'NovaBadge';

export type { NovaBadgeProps };