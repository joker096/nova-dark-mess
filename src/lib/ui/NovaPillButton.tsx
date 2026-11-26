import { forwardRef, type HTMLAttributes } from 'react';
import {IconCheck as Check} from '@tabler/icons-react';

interface NovaPillButtonProps extends HTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'invited';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export const NovaPillButton = forwardRef<HTMLButtonElement, NovaPillButtonProps>(
  ({
    variant = 'default',
    children,
    onClick,
    disabled = false,
    loading = false,
    className,
    style,
    ...props
  }, ref) => {
    const isInvited = variant === 'invited';

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-medium text-[14px] transition-all duration-150 ${
          isInvited
            ? 'bg-[var(--c-primary-soft)] text-[var(--c-primary)]'
            : 'bg-[var(--bg-field)] text-[var(--text-primary)]'
        } ${
          disabled || loading
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:opacity-80 active:scale-95 cursor-pointer'
        } ${className ?? ''}`}
        style={style}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isInvited ? (
          <Check className="w-4 h-4" />
        ) : null}
        {children}
      </button>
    );
  }
);

NovaPillButton.displayName = 'NovaPillButton';

export type { NovaPillButtonProps };









