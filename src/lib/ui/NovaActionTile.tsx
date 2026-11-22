import { forwardRef, type HTMLAttributes } from 'react';

interface NovaActionTileProps extends HTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: number;
  iconSize?: number;
}

export const NovaActionTile = forwardRef<HTMLButtonElement, NovaActionTileProps>(
  ({
    icon,
    label,
    onClick,
    disabled = false,
    size = 38,
    iconSize = 22,
    className,
    style,
    ...props
  }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl transition-all duration-150 ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-[var(--bg-field)] active:scale-95 cursor-pointer'
        } ${className ?? ''}`}
        style={{
          ...(style as React.CSSProperties),
          width: size,
          height: size + 30,
        } as React.CSSProperties}
        {...props}
      >
        <div
          className="flex items-center justify-center text-[var(--text-primary)]"
          style={{ width: iconSize, height: iconSize } as React.CSSProperties}
        >
          {icon}
        </div>
        <span className="text-[12px] font-medium text-[var(--text-primary)] text-center leading-tight max-w-full truncate">
          {label}
        </span>
      </button>
    );
  }
);

NovaActionTile.displayName = 'NovaActionTile';

export type { NovaActionTileProps };