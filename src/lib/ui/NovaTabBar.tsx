import { forwardRef, type HTMLAttributes, useMemo } from 'react';

interface TabItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeMuted?: boolean;
  disabled?: boolean;
}

interface NovaTabBarProps extends HTMLAttributes<HTMLDivElement> {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
  fabSide?: 'left' | 'right';
}

export const NovaTabBar = forwardRef<HTMLDivElement, NovaTabBarProps>(
  ({ tabs, activeTab, onTabChange, fabSide = 'right', className, ...props }, ref) => {
    const tabElements = useMemo(() => tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-label={tab.label}
        onClick={() => onTabChange(tab.key)}
        className={`flex flex-col items-center gap-1 px-3 py-2.5 min-w-[60px] transition-all duration-200 cursor-pointer ${
          activeTab === tab.key
            ? 'text-[var(--c-primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
        style={{
          position: 'relative',
        } as React.CSSProperties}
      >
        <span className="relative flex items-center justify-center" style={{ width: 27, height: 27 }}>
          {tab.icon}
          {tab.badge !== undefined && tab.badge !== '' && (
            <span
              className={`absolute -top-1 -right-1 min-w-[16px] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                tab.badgeMuted
                  ? 'bg-[var(--c-badge-muted)] text-white'
                  : 'bg-[var(--c-badge)] text-[var(--c-on-primary)]'
              }`}
            >
              {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
            </span>
          )}
        </span>
        <span className="text-[12px] font-medium leading-tight whitespace-nowrap">
          {tab.label}
        </span>
      </button>
    )), [tabs, activeTab]);

    const activeTabIndex = tabs.findIndex(t => t.key === activeTab);
    const indicatorStyle = useMemo(() => ({
      transform: `translateX(${activeTabIndex * (100 / tabs.length)}%)`,
      width: `${100 / tabs.length}%`,
    }), [activeTabIndex, tabs.length]);

    return (
      <div
        ref={ref}
        role="tablist"
        className={`fixed bottom-0 left-[var(--space-screen)] right-[var(--space-screen)] z-40 mx-[var(--space-screen)] mb-[calc(var(--space-screen) + var(--safe-bottom))] bg-[var(--bg-card)] border border-[var(--border-divider)] rounded-full p-1 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-card)]/80 flex items-center justify-between ${className ?? ''}`}
        style={{ ...(props.style as React.CSSProperties), paddingBottom: `calc(1px + var(--safe-bottom))` } as React.CSSProperties}
        {...props}
      >
        <div className="relative flex items-center justify-between w-full" aria-orientation="horizontal">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="h-[44px] rounded-full bg-[var(--c-primary)] opacity-15 transition-transform duration-200"
              style={indicatorStyle}
              aria-hidden="true"
            />
          </div>
          <div className="relative flex items-center justify-between w-full z-10" role="presentation">
            {tabElements}
          </div>
        </div>
      </div>
    );
  }
);

NovaTabBar.displayName = 'NovaTabBar';

export type { NovaTabBarProps, TabItem };