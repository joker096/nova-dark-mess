import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface NovaToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export const NovaToggle = forwardRef<HTMLButtonElement, NovaToggleProps>(
  ({ label, checked = false, onChange, className, ...props }, ref) => {
    const handleClick = () => {
      const next = !checked;
      onChange?.(next);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleClick}
        className={`w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${className ?? ''}`.trim()}
        {...props}
      >
        {label && (
          <span className="text-[13px] text-white/90 group-hover:text-white transition">
            {label}
          </span>
        )}
        <span
          className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
            checked ? 'bg-[var(--nova-accent-color,#ff4e18)]' : 'bg-white/10'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    );
  },
);

NovaToggle.displayName = 'NovaToggle';

export type { NovaToggleProps };
