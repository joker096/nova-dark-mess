import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { Lock } from 'lucide-react';

interface NovaColorChipProps extends HTMLAttributes<HTMLButtonElement> {
  gradient?: string;
  selected?: boolean;
  locked?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

const BASE =
  'flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition cursor-pointer relative overflow-hidden disabled:opacity-60 disabled:pointer-events-none';

const VARIANT_CONFIG: Record<string, string> = {
  selected: 'bg-[var(--nova-accent-color,#ff4e18)]/10 border-[var(--nova-accent-color,#ff4e18)]/40 shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/25',
  unselected: 'bg-white/[0.03] border-transparent hover:bg-white/[0.06]',
  disabled: 'opacity-60 pointer-events-none',
};

export const NovaColorChip = forwardRef<HTMLButtonElement, NovaColorChipProps>(
  ({
    gradient,
    selected = false,
    locked = false,
    label,
    className,
    children,
    disabled = false,
    ...props
  }, ref) => {
    const variantClasses = selected
      ? VARIANT_CONFIG.selected
      : disabled
      ? VARIANT_CONFIG.disabled
      : VARIANT_CONFIG.unselected;

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        aria-disabled={disabled || locked ? true : undefined}
        className={`${BASE} ${variantClasses} ${className ?? ''}`.trim()}
        {...props}
      >
        <div className="relative w-6 h-6 rounded-full border border-white/20 shadow-sm overflow-hidden">
          {gradient && (
            <div className={`absolute inset-0 bg-gradient-to-tr ${gradient}`} />
          )}
          <div className="absolute inset-1 rounded-full bg-white/30" />
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <Lock className="w-3 h-3 text-white/90" />
            </div>
          )}
        </div>
        <span
          className={`text-[11px] font-medium ${locked ? 'text-[#8c919d]' : ''}`}
        >
          {label}
        </span>
        {locked && (
          <span
            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-[var(--nova-accent-color,#ff4e18)] flex items-center justify-center text-[10px] font-bold"
          >
            <Lock className="w-2 h-2 fill-white" />
          </span>
        )}
        {children}
      </button>
    );
  },
);

NovaColorChip.displayName = 'NovaColorChip';

export type { NovaColorChipProps };
