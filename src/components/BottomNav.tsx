import React from 'react';
import { MessageSquare, Users, Radio, Settings, Sparkles, Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { NovaIconButton } from '../lib/ui';

interface BottomNavProps {
  activeTab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium';
  onTabChange: (tab: BottomNavProps['activeTab']) => void;
  fabSide: 'left' | 'right';
  onFabToggle?: () => void;
  onNewChat?: () => void;
  unreadChats?: number;
  unreadChannels?: number;
  unreadContacts?: number;
  premium?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  fabSide,
  onFabToggle,
  onNewChat,
  unreadChats = 0,
  unreadChannels = 0,
  unreadContacts = 0,
  premium = false,
}) => {
  const { t } = useLanguage();

  const tabs = [
    { id: 'chats' as const, icon: MessageSquare, label: t('common.chats'), unread: unreadChats },
    { id: 'contacts' as const, icon: Users, label: t('common.contacts'), unread: unreadContacts },
    { id: 'channels' as const, icon: Radio, label: t('common.channels'), unread: unreadChannels },
    { id: 'settings' as const, icon: Settings, label: t('settings.title'), unread: 0 },
    { id: 'premium' as const, icon: Sparkles, label: t('premium.title'), unread: 0 },
  ];

  const isCenterTab = activeTab === 'channels';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--nova-surface)] border-t border-[var(--nova-border-subtle)] safe-area-screen"
      role="navigation"
      aria-label={t('common.navigation')}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const isCenter = index === 2; // Center position (channels)

          if (isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 transition-all duration-200 cursor-pointer min-h-[44px] ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'}`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <tab.icon className={`w-6 h-6 ${isActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {tab.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 min-w-[18px] rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {tab.unread > 99 ? '99+' : tab.unread}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 transition-all duration-200 cursor-pointer min-h-[44px] ${isActive ? 'text-[var(--nova-accent-color)]' : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <tab.icon className={`w-6 h-6 ${isActive ? 'fill-[var(--nova-accent-color)]' : ''}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.unread > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 min-w-[18px] rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] text-[9px] font-bold flex items-center justify-center shadow-sm">
                  {tab.unread > 99 ? '99+' : tab.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;