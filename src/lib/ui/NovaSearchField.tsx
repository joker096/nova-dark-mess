import { forwardRef, type HTMLAttributes, useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface NovaSearchFieldProps extends Omit<HTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  showCancel?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export const NovaSearchField = forwardRef<HTMLInputElement, NovaSearchFieldProps>(
  ({
    placeholder = 'Search',
    value,
    onChange,
    onFocus,
    onBlur,
    showCancel = false,
    cancelLabel = 'Cancel',
    onCancel,
    autoFocus = false,
    className,
    style,
    ...props
  }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }, [autoFocus]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.();
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.();
    };

    const handleClear = () => {
      onChange('');
      inputRef.current?.focus();
    };

    return (
      <div
        ref={wrapperRef}
        className={`relative flex items-center bg-[var(--bg-field)] rounded-[var(--radius-field)] transition-all duration-200 ${
          isFocused ? 'ring-2 ring-[var(--c-primary)]' : ''
        } ${className ?? ''}`}
        style={style}
      >
        <div className="absolute left-3 flex items-center justify-center pointer-events-none text-[var(--text-secondary)]">
          <Search className="w-5 h-5" aria-hidden="true" />
        </div>

        <input
          ref={(el) => {
            inputRef.current = el;
            if (ref) {
              if (typeof ref === 'function') ref(el);
              else ref.current = el;
            }
          }}
          type="search"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full bg-transparent py-2.5 pl-10 pr-10 text-[var(--text-primary)] placeholder-[var(--text-secondary)] text-[16px] leading-[24px] outline-none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          {...props}
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-0.5"
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-2 px-3 py-2 text-[16px] font-medium text-[var(--color-accent)] transition-colors hover:opacity-70"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    );
  }
);

NovaSearchField.displayName = 'NovaSearchField';

export type { NovaSearchFieldProps };