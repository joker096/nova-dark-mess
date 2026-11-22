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
  'w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none py-1 min-w-0';

const BASE_WRAPPER =
  'flex flex-col gap-1.5';

const BASE_FIELD =
  'flex items-center gap-2 rounded-lg border px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-[var(--focus-ring)]/35 focus-within:border-[var(--focus-ring)]/60 focus-within:bg-[var(--accent-soft)]/20';

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
            className="text-xs font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <div
          className={`${BASE_FIELD} ${error ? 'border-[var(--danger)] focus-within:border-[var(--danger)]/70' : 'border-[var(--border)]'} ${className ?? ''}`.trim()}
        >
          <input
            ref={ref}
            id={inputId}
            placeholder={placeholder}
            // The wrapper owns the focus ring; avoid a second rectangular one.
            data-inline-focus="true"
            className={BASE_INPUT}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
        </div>
        {error && (
          <span id={`${inputId}-error`} className="text-xs text-[var(--danger)]">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${inputId}-helper`} className="text-xs text-[var(--text-tertiary)]">
            {helperText}
          </span>
        )}
      </div>
    );
  },
);

NovaInput.displayName = 'NovaInput';

export type { NovaInputProps };
