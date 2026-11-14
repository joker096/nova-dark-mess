import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

interface NovaSelectableButtonProps extends HTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label?: string;
  accent?: boolean;
}

const BASE =
  'flex-1 flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition rounded-lg border px-2 py-1.5 text-xs';

const VARIANT_CONFIG: Record<string, string> = {
  selected: 'bg-[var(--nova-accent-color,#ff4e18)]/10 border-[var(--nova-accent-color,#ff4e18)]/40 text-white shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/25',
  unselected: 'bg-white/[0.03] border-transparent text-white/60 hover:bg-white/[0.06]',
  disabled: 'opacity-60 pointer-events-none',
};

export const NovaSelectableButton = forwardRef<HTMLButtonElement, NovaSelectableButtonProps>(
  ({ selected = false, disabled = false, icon, label, accent: _accent = true, className, children, ...props }, ref) => {
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
        className={`${BASE} ${variantClasses} ${className ?? ''}`.trim()}
        {...props}
      >
        {icon && <span className="w-5 h-5 shrink-0">{icon}</span>}
        {label && <span className="text-[9px] font-medium">{label}</span>}
        {children}
      </button>
    );
  },
);

NovaSelectableButton.displayName = 'NovaSelectableButton';

export type { NovaSelectableButtonProps };
