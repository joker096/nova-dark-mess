import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface NovaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'accent' | 'accent-ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  badge?: React.ReactNode;
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const SIZE_CONFIG: Record<string, { btn: string; icon: string }> = {
  sm: { btn: 'w-7 h-7', icon: 'w-3 h-3' },
  md: { btn: 'w-8 h-8', icon: 'w-4 h-4' },
  lg: { btn: 'w-10 h-10', icon: 'w-5 h-5' },
};

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color,#ff4e18)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-canvas,#0c0d11)]';

const VARIANT_CONFIG: Record<string, string> = {
  ghost:
    'bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]',
  // `text-[#ffffff]` (not `text-white`) on purpose: the light theme remaps
  // `text-white` to dark ink, and the accent-fill exception only matches the
  // accent class without its fallback value.
  accent:
    'bg-[var(--nova-accent-color,#ff4e18)] text-[#ffffff] border border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 hover:brightness-110 hover:shadow-lg active:brightness-95',
  'accent-ghost':
    'bg-[var(--nova-accent-color,#ff4e18)]/20 border border-[var(--nova-accent-color,#ff4e18)]/50 text-[var(--nova-accent-color,#ff4e18)] hover:bg-[var(--nova-accent-color,#ff4e18)]/30',
  danger:
    'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:border-red-500/50',
};

const BASE =
  'flex items-center justify-center cursor-pointer select-none transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-out active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed';

export const NovaButton = forwardRef<HTMLButtonElement, NovaButtonProps>(
  ({ variant = 'ghost', size = 'sm', badge, block = false, className, children, ...props }, ref) => {
    const { btn } = SIZE_CONFIG[size];
    const variantClasses = VARIANT_CONFIG[variant];
    const blockClasses = block
      ? 'w-full rounded-xl px-4 py-2.5 text-left'
      : 'rounded-full';

    return (
      <button
        ref={ref}
        className={`${BASE} ${FOCUS} ${btn} ${blockClasses} ${variantClasses} ${className ?? ''}`.trim()}
        {...props}
      >
        {children}
        {badge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-sm">
            {badge}
          </span>
        )}
      </button>
    );
  },
);

NovaButton.displayName = 'NovaButton';

export type { NovaButtonProps };
