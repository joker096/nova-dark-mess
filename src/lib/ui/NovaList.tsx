import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { ChevronRight } from 'lucide-react';
import { NovaAvatar } from './NovaAvatar';
import { NovaBadge } from './NovaBadge';

interface NovaListGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'inset';
}

export const NovaListGroup = forwardRef<HTMLDivElement, NovaListGroupProps>(
  ({ children, variant = 'default', className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border-divider)] overflow-hidden ${
          variant === 'inset' ? 'mx-[var(--space-screen)]' : ''
        } ${className ?? ''}`}
        style={style}
        {...props}
      >
        {children}
      </div>
    );
  }
);

NovaListGroup.displayName = 'NovaListGroup';

interface NovaListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'ref'> {
  icon?: ReactNode;
  iconBgColor?: string;
  title?: string;
  subtitle?: string;
  rightContent?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  inset?: boolean;
  active?: boolean;
}

export const NovaListRow = ({
  icon,
  iconBgColor,
  title,
  subtitle,
  rightContent,
  chevron = false,
  onClick,
  destructive = false,
  inset = false,
  active = false,
  className,
  style,
  children,
  ref,
  ...props
}: NovaListRowProps & { ref?: Ref<HTMLDivElement | HTMLButtonElement> }) => {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-center gap-3 px-[var(--space-screen)] py-3.5 transition-colors ${
        inset ? 'border-t border-[var(--border-divider)]' : 'first:border-t-0 border-t border-[var(--border-divider)]'
      } ${
        onClick
          ? 'cursor-pointer active:bg-[var(--bg-field)]'
          : ''
      } ${destructive ? 'text-[var(--c-danger)]' : ''} ${active ? 'bg-[var(--bg-field)]' : ''} ${className ?? ''}`}
      style={{
        ...(style as React.CSSProperties),
        paddingLeft: inset ? 'calc(var(--space-screen) + 56px)' : 'var(--space-screen)',
      } as React.CSSProperties}
      {...props}
    >
        {icon && (
          <div
            className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0"
            style={{
              backgroundColor: iconBgColor ?? 'var(--c-icon-1)',
            } as React.CSSProperties}
          >
            {icon}
          </div>
        )}
        {!icon && <div className="w-7 shrink-0" />}

        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-medium leading-[24px] text-[var(--text-primary)] truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-[14px] font-normal leading-[20px] text-[var(--text-secondary)] truncate">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rightContent}
          {chevron && (
            <ChevronRight
              className="w-5 h-5 text-[var(--text-secondary)] shrink-0"
              aria-hidden="true"
            />
          )}
        </div>

        {children}
      </Tag>
    );
  };

NovaListRow.displayName = 'NovaListRow';

interface NovaListSectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  inset?: boolean;
  icon?: React.ReactNode;
}

export const NovaListSectionHeader = forwardRef<HTMLDivElement, NovaListSectionHeaderProps>(
  ({ title, inset = false, icon, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex items-center gap-2 px-[var(--space-screen)] py-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] bg-[var(--bg-field)] ${inset ? 'ml-[calc(var(--space-screen)+56px)]' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        {icon && <span className="w-5 h-5 text-[var(--c-primary)]">{icon}</span>}
        {title}
      </div>
    );
  }
);

NovaListSectionHeader.displayName = 'NovaListSectionHeader';

export type { NovaListGroupProps, NovaListRowProps, NovaListSectionHeaderProps };