import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface NovaInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  placeholder?: string;
  className?: string;
  helperText?: string;
}

const BASE_INPUT =
  'w-full bg-transparent text-white placeholder-white/35 focus:outline-none py-1 min-w-0';

const BASE_WRAPPER =
  'flex flex-col gap-1.5';

const BASE_FIELD =
  'flex items-center gap-2 rounded-lg border px-3 py-2 transition focus-within:border-[var(--nova-accent-color,#ff4e18)]/60 focus-within:ring-1 focus-within:ring-[var(--nova-accent-color,#ff4e18)]/30';

export const NovaInput = forwardRef<HTMLInputElement, NovaInputProps>(
  ({
    label,
    error,
    placeholder,
    helperText,
    className,
    id,
    ...props
  }, ref) => {
    const inputId = id || `nova-input-${Math.random().toString(36).slice(2)}`;

    return (
      <div className={BASE_WRAPPER}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-white/80"
          >
            {label}
          </label>
        )}
        <div
          className={`${BASE_FIELD} ${error ? 'border-red-500/50 focus-within:border-red-500/60' : 'border-white/10'} ${className ?? ''}`.trim()}
        >
          <input
            ref={ref}
            id={inputId}
            placeholder={placeholder}
            className={BASE_INPUT}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
        </div>
        {error && (
          <span id={`${inputId}-error`} className="text-xs text-red-400">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${inputId}-helper`} className="text-xs text-white/50">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

NovaInput.displayName = 'NovaInput';

export type { NovaInputProps };
