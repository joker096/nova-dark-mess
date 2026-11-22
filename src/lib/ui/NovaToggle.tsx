import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface NovaToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-7 h-4',
  md: 'w-9 h-5',
  lg: 'w-11 h-6',
};

const THUMB_SIZES: Record<string, string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const TRACK_PADDING: Record<string, string> = {
  sm: 'px-0.5',
  md: 'px-0.5',
  lg: 'px-1',
};

export const NovaToggle = forwardRef<HTMLButtonElement, NovaToggleProps>(
  ({ label, checked = false, onChange, size = 'md', className, ...props }, ref) => {
    const handleClick = () => {
      const next = !checked;
      onChange?.(next);
    };

    const trackSize = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
    const thumbSize = THUMB_SIZES[size] ?? THUMB_SIZES.md;
    const trackPadding = TRACK_PADDING[size] ?? TRACK_PADDING.md;

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
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
          className={`relative ${trackSize} rounded-full transition-colors duration-200 flex items-center ${trackPadding} ${
            checked ? 'bg-[var(--nova-accent-color,#ff4e18)]' : 'bg-white/10'
          }`}
        >
          <span
            className={`${thumbSize} rounded-full bg-white shadow-md transition-transform duration-200 ${
              checked ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
        </span>
      </button>
    );
  },
);

NovaToggle.displayName = 'NovaToggle';

export type { NovaToggleProps };
