import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { getSettingsTabs } from './settings/SettingsRegistry';
import { SettingsTabs } from './settings/settingsPrimitives';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { useLanguage } from '../context/LanguageContext';
import { IconX as X, IconSettings as SettingsIcon } from '@tabler/icons-react';

interface SettingsModalOptimizedProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnalytics?: () => void;
  onOpenSites?: () => void;
  onOpenMeshMap?: () => void;
  getBotSession?: () => any;
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  onBotInstallHandled?: () => void;
  onOpenBotChat?: (botId: string) => void;
  navigate?: (screen: string, params?: any) => void;
}

const TabContent = React.memo(function TabContent({
  activeTab,
  onOpenAnalytics,
  onOpenSites,
  onOpenMeshMap,
  navigate,
}: {
  activeTab: string;
  onOpenAnalytics?: () => void;
  onOpenSites?: () => void;
  onOpenMeshMap?: () => void;
  navigate?: (screen: string, params?: any) => void;
}) {
  const tabs = getSettingsTabs();
  const tabConfig = tabs.find((t) => t.id === activeTab);

  if (!tabConfig) return null;

  const TabComponent = tabConfig.component;

  return (
    <div
      role="tabpanel"
      id={`settings-panel-${activeTab}`}
      aria-labelledby={`settings-tab-${activeTab}`}
      tabIndex={0}
    >
      <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--nova-accent-color)] border-t-transparent" /></div>}>
        <TabComponent
          onOpenAnalytics={onOpenAnalytics}
          onOpenSites={onOpenSites}
          onOpenMeshMap={onOpenMeshMap}
          navigate={navigate}
        />
      </Suspense>
    </div>
  );
});

function SettingsModalInner({
  isOpen,
  onClose,
  onOpenAnalytics,
  onOpenSites,
  onOpenMeshMap,
  getBotSession,
  navigate,
}: SettingsModalOptimizedProps) {
  const { t } = useLanguage();
  const { state, subscribe } = useSettings();
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusTrap = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<string>(() => {
    const tabs = getSettingsTabs();
    return tabs[0]?.id || 'general';
  });
  const [lastFocusedTab, setLastFocusedTab] = useState<string>(activeTab);

  useEffect(() => {
    const tabs = getSettingsTabs();
    const firstEnabled = tabs.find((t) => !t.enabled || t.enabled());
    if (firstEnabled) {
      setActiveTab(firstEnabled.id);
      setLastFocusedTab(firstEnabled.id);
    }
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    const tabConfig = getSettingsTabs().find((t) => t.id === tabId);
    if (tabConfig?.enabled && !tabConfig.enabled()) {
      return;
    }
    setLastFocusedTab(activeTab);
    setActiveTab(tabId);
  }, [activeTab]);

  const tabButtons = useMemo(() => {
    const tabs = getSettingsTabs();
    return tabs
      .filter((t) => !t.enabled || t.enabled())
      .map((tab) => ({
        key: tab.id,
        label: t(tab.label),
        icon: tab.icon,
      }));
  }, [t]);

  // Keep a lightweight marker in the DOM while closed so hosts and tests can
  // observe the modal state without mounting the whole settings tree.
  const stateAttrs = {
    'data-testid': 'settings-modal',
    'data-isopen': String(isOpen),
    'data-has-bot-session': String(Boolean(getBotSession)),
  } as const;

  if (!isOpen) return <div {...stateAttrs} hidden />;

  const portalContent = (
    <div
      {...stateAttrs}
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={(el) => {
          dialogRef.current = el;
          focusTrap.current = el;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[min(86dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface)] text-[var(--nova-text-primary)] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--nova-border-subtle)] p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <div>
                <h2 id="settings-modal-title" className="text-sm font-bold leading-tight">
                  {t('settings.title')}
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--nova-text-muted)]">
                  {t('settings.subtitle')}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-surface)]`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="shrink-0">
          <SettingsTabs
            tabs={tabButtons}
            active={activeTab}
            onChange={handleTabChange}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <TabContent
            activeTab={activeTab}
            onOpenAnalytics={onOpenAnalytics}
            onOpenSites={onOpenSites}
            onOpenMeshMap={onOpenMeshMap}
            navigate={navigate}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(portalContent, document.body);
}

export const SettingsModalOptimized: React.FC<SettingsModalOptimizedProps> = ({
  isOpen,
  onClose,
  onOpenAnalytics,
  onOpenSites,
  onOpenMeshMap,
  getBotSession,
  pendingBotInstall,
  onBotInstallHandled,
  onOpenBotChat,
  navigate,
}) => {
  return (
    <SettingsProvider>
      <SettingsModalInner
        isOpen={isOpen}
        onClose={onClose}
        onOpenAnalytics={onOpenAnalytics}
        onOpenSites={onOpenSites}
        onOpenMeshMap={onOpenMeshMap}
        getBotSession={getBotSession}
        navigate={navigate}
      />
    </SettingsProvider>
  );
};