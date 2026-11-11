import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

interface NovaCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const VARIANT_CONFIG: Record<string, string> = {
  default: 'bg-[#181921] border border-white/5',
  elevated: 'bg-[#181921] border border-white/5 shadow-lg shadow-black/40',
  outline: 'bg-transparent border border-white/10',
  accent: 'bg-[var(--nova-accent-color,#ff4e18)]/10 border border-[var(--nova-accent-color,#ff4e18)]/20',
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
    const hoverClasses = hover ? 'hover:border-white/10 hover:bg-[#20222a]' : '';

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
