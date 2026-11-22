import { forwardRef, type HTMLAttributes, useMemo } from 'react';

interface TabItem {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

interface NovaSegmentedTabsProps extends HTMLAttributes<HTMLDivElement> {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
  variant?: 'underline' | 'pill';
  fullWidth?: boolean;
}

export const NovaSegmentedTabs = forwardRef<HTMLDivElement, NovaSegmentedTabsProps>(
  ({
    tabs,
    activeTab,
    onTabChange,
    variant = 'underline',
    fullWidth = false,
    className,
    style,
    ...props
  }, ref) => {
    const tabElements = useMemo(() => tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-disabled={tab.disabled}
        onClick={() => !tab.disabled && onTabChange(tab.key)}
        disabled={tab.disabled}
        className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-[15px] font-medium transition-all duration-200 ${
          variant === 'underline'
            ? activeTab === tab.key
              ? 'text-[var(--c-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            : activeTab === tab.key
              ? 'bg-[var(--c-primary)] text-[var(--c-on-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-field)]'
        } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
          fullWidth ? 'flex-1' : ''
        }`}
      >
        {tab.label}
        {tab.count !== undefined && (
          <span className={`text-[12px] font-semibold rounded-full px-1.5 py-0.2 ${
            variant === 'underline'
              ? activeTab === tab.key
                ? 'bg-[var(--c-primary)] text-[var(--c-on-primary)]'
                : 'bg-[var(--bg-field)] text-[var(--text-secondary)]'
              : activeTab === tab.key
                ? 'bg-[var(--c-on-primary)]/20 text-[var(--c-on-primary)]'
                : 'bg-[var(--bg-field)] text-[var(--text-secondary)]'
          }`}>
            {tab.count}
          </span>
        )}
      </button>
    )), [tabs, activeTab, variant, fullWidth]);

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation="horizontal"
        className={`flex items-center gap-1 ${variant === 'pill' ? 'bg-[var(--bg-field)] rounded-[var(--radius-field)] p-1' : 'border-b border-[var(--border-divider)]'} ${fullWidth ? 'w-full' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        {variant === 'underline' && (
          <div className="relative h-0.5 w-full overflow-hidden">
            <div
              className="absolute bottom-0 h-[3px] bg-[var(--c-primary)] rounded-full transition-transform duration-200"
              style={{
                transform: `translateX(${tabs.findIndex(t => t.key === activeTab) * (100 / tabs.filter(t => !t.disabled).length)}%)`,
                width: `${100 / tabs.filter(t => !t.disabled).length}%`,
              } as React.CSSProperties}
              aria-hidden="true"
            />
          </div>
        )}
        <div className={`flex items-center ${fullWidth ? 'w-full' : ''}`} role="presentation">
          {tabElements}
        </div>
      </div>
    );
  }
);

NovaSegmentedTabs.displayName = 'NovaSegmentedTabs';

export type { NovaSegmentedTabsProps, TabItem };