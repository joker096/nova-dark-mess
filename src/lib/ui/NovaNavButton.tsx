import React, { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

interface NovaNavButtonProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ReactNode;
  label?: string;
}

const BASE =
  'flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition';

const ACTIVE_STYLE =
  'text-[var(--nova-accent-color,#ff4e18)] font-bold';

const INACTIVE_STYLE =
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

const ICON_ACTIVE = 'fill-current';
const ICON_INACTIVE = 'fill-[var(--text-secondary)]';

export const NovaNavButton = forwardRef<HTMLButtonElement, NovaNavButtonProps>(
  ({ active = false, icon, label, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active}
        className={`${BASE} ${active ? ACTIVE_STYLE : INACTIVE_STYLE} ${className ?? ''}`.trim()}
        {...props}
      >
        {icon && (
          <span className={`w-5 h-5 ${active ? ICON_ACTIVE : ICON_INACTIVE}`}>{icon}</span>
        )}
        {children ?? (label && <span className={`text-[9px] font-${active ? 'bold' : 'normal'}`}>{label}</span>)}
      </button>
    );
  },
);

NovaNavButton.displayName = 'NovaNavButton';

export type { NovaNavButtonProps };
