import React, { useCallback, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import { usePremium } from '../../../hooks/usePremium';
import {
  ACCENT_COLORS,
  applyAccentColor,
  applyFontSize,
  FontSize,
} from '../../../lib/ui/appearance';
import {
  SettingsSection,
  SettingsTile,
  IconSegmented,
  type IconSegmentOption,
} from '../settingsPrimitives';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';
import { CryptoCheckoutModal } from '../../../components/CryptoCheckoutModal';
import {
  IconSun as SunIcon,
  IconMoon as MoonIcon,
  IconDeviceDesktop as MonitorIcon,
  IconLanguage as LanguageIcon,
  IconPalette as PaletteIcon,
  IconSparkles as SparklesIcon,
  IconHandClick as HandIcon,
  IconLock as LockIcon,
} from '@tabler/icons-react';

const THEME_OPTIONS: IconSegmentOption<'light' | 'dark' | 'system'>[] = [
  { value: 'light', label: 'Light', icon: <SunIcon className="w-4 h-4" /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon className="w-4 h-4" /> },
  { value: 'system', label: 'System', icon: <MonitorIcon className="w-4 h-4" /> },
];

const FONT_SIZE_OPTIONS: IconSegmentOption<FontSize>[] = [
  { value: 'small', label: 'Small', icon: <span className="text-[11px] font-bold">A</span> },
  { value: 'medium', label: 'Medium', icon: <span className="text-[14px] font-bold">A</span> },
  { value: 'large', label: 'Large', icon: <span className="text-[18px] font-bold">A</span> },
];

const FAB_SIDE_OPTIONS: IconSegmentOption<'left' | 'right'>[] = [
  { value: 'left', label: 'Left hand', icon: <HandIcon className="w-4 h-4 -scale-x-100" /> },
  { value: 'right', label: 'Right hand', icon: <HandIcon className="w-4 h-4" /> },
];

const CHAT_COLOR_OPTIONS: Array<{
  value: 'default' | 'sapphire' | 'amethyst' | 'emerald';
  label: string;
  gradient: string;
}> = [
  { value: 'default', label: 'Default', gradient: 'from-[var(--nova-accent-color,#ff521a)] to-[var(--nova-accent-color,#ff3b00)]' },
  { value: 'sapphire', label: 'Sapphire', gradient: 'from-[var(--chat-theme-sapphire-from)] to-[var(--chat-theme-sapphire-to)]' },
  { value: 'amethyst', label: 'Amethyst', gradient: 'from-[var(--chat-theme-amethyst-from)] to-[var(--chat-theme-amethyst-to)]' },
  { value: 'emerald', label: 'Emerald', gradient: 'from-[var(--chat-theme-emerald-from)] to-[var(--chat-theme-emerald-to)]' },
];

interface ChatColorOptionProps {
  opt: (typeof CHAT_COLOR_OPTIONS)[0];
  isSelected: boolean;
  isPremiumLocked: boolean;
  onSelect: () => void;
  t: (...args: any[]) => any;
}

const ChatColorOption = React.memo(function ChatColorOption({
  opt,
  isSelected,
  isPremiumLocked,
  onSelect,
  t,
}: ChatColorOptionProps) {
  const label = opt.value === 'default'
    ? t('settings.chatColorDefault')
    : opt.value === 'sapphire'
    ? t('settings.chatColorSapphire')
    : opt.value === 'amethyst'
    ? t('settings.chatColorAmethyst')
    : t('settings.chatColorEmerald');

  const baseClass = 'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition cursor-pointer relative overflow-hidden min-h-[44px]';
  const selectedClass = 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 text-[var(--nova-accent-color)] font-semibold shadow-sm shadow-[var(--nova-accent-color)]/25';
  const unselectedClass = 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]';
  const disabledClass = isPremiumLocked ? ' opacity-60' : '';
  const className = `${baseClass} ${isSelected ? selectedClass : unselectedClass}${disabledClass}`;

  return (
    <button
      key={opt.value}
      type="button"
      aria-disabled={isPremiumLocked}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={className}
    >
      <div className="relative w-8 h-8 rounded-full border border-[var(--nova-border-color)] shadow-sm overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-tr ${opt.gradient}`} />
        <div className="absolute inset-1 rounded-full bg-[var(--nova-overlay-strong)]" />
        {isPremiumLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <LockIcon className="w-4 h-4 text-[var(--nova-text-primary)]" />
          </div>
        )}
      </div>
      <span className={`text-[11px] font-medium ${isPremiumLocked ? 'text-[var(--nova-text-muted)]' : ''}`}>
        {label}
      </span>
      {isPremiumLocked && (
        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-accent-color)] flex items-center justify-center text-[11px] font-bold">
          <LockIcon className="w-3 h-3 fill-[var(--nova-text-primary)]" />
        </span>
      )}
    </button>
  );
});

export const GeneralTab = React.memo(function GeneralTab() {
  const { t } = useLanguage();
  const { state, updateAppSetting } = useSettings();
  const { premium, checkout, minSubscriptionCost, freeDaysRemaining, loading } = usePremium();
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);

  const handleThemeChange = useCallback((value: 'light' | 'dark' | 'system') => {
    updateAppSetting('appTheme', value);
    applyAccentColor(ACCENT_COLORS[state.app.chatColorTheme]);
  }, [updateAppSetting, state.app.chatColorTheme]);

  const handleFontSizeChange = useCallback((value: FontSize) => {
    updateAppSetting('fontSize', value);
    applyFontSize(value);
  }, [updateAppSetting]);

  const handleFabSideChange = useCallback((value: 'left' | 'right') => {
    updateAppSetting('fabSide', value);
  }, [updateAppSetting]);

  const handleChatColorChange = useCallback((value: 'default' | 'sapphire' | 'amethyst' | 'emerald') => {
    if (value !== 'default' && !premium) {
      checkout();
      return;
    }
    updateAppSetting('chatColorTheme', value);
    applyAccentColor(ACCENT_COLORS[value]);
  }, [updateAppSetting, premium, checkout]);

  const freeDays = freeDaysRemaining();

  return (
    <>
      <SettingsSection
        title={t('settings.language')}
        icon={<LanguageIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1" role="region" aria-label={t('settings.language')}>
          <LanguageSwitcher />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.appearance')}
        icon={<PaletteIcon className="w-3.5 h-3.5" />}
      >
        <div className="space-y-4 px-1">
          <div>
            <label className="block text-[13px] text-[var(--nova-text-primary)] mb-1.5">{t('settings.theme')}</label>
            <IconSegmented
              options={THEME_OPTIONS}
              value={state.app.appTheme}
              onChange={handleThemeChange}
              ariaLabel={t('settings.theme')}
              testId="settings-theme-segmented"
            />
          </div>

          <div>
            <label className="block text-[13px] text-[var(--nova-text-primary)] mb-1.5">{t('settings.fontSize')}</label>
            <IconSegmented
              options={FONT_SIZE_OPTIONS}
              value={state.app.fontSize}
              onChange={handleFontSizeChange}
              ariaLabel={t('settings.fontSize')}
              testId="settings-font-size-segmented"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.fabSide', { defaultValue: 'One-handed button' })}</label>
              <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.fabSideDesc', { defaultValue: 'Side of the New Action button' })}</span>
            </div>
            <IconSegmented
              options={FAB_SIDE_OPTIONS}
              value={state.app.fabSide}
              onChange={handleFabSideChange}
              ariaLabel={t('settings.fabSide', { defaultValue: 'One-handed button' })}
              testId="settings-fab-side-segmented"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.chatColors')}</label>
              <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.chatColorsDesc')}</span>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={t('settings.chatColors')}>
              {CHAT_COLOR_OPTIONS.map((opt) => (
                <ChatColorOption
                  key={opt.value}
                  opt={opt}
                  isSelected={state.app.chatColorTheme === opt.value}
                  isPremiumLocked={opt.value !== 'default' && !premium}
                  onSelect={() => handleChatColorChange(opt.value)}
                  t={t}
                />
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.premium')}
        icon={<SparklesIcon className="w-3.5 h-3.5" />}
      >
        <div className="space-y-3 px-1">
          <p className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.premiumDesc')}</p>
          {freeDays > 0 && (
            <div className="px-1 py-1.5 rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 text-xs text-[var(--nova-accent-color)]">
              {t('settings.premiumFreeTrial', { days: freeDays })}
            </div>
          )}
          <button
            onClick={async () => {
              const r = await checkout();
              if (!r.ok && r.error) alert(r.error);
            }}
            disabled={loading || premium}
            className={`w-full py-2.5 px-4 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-md ${
              premium
                ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] border-[var(--nova-accent-color)] shadow-lg shadow-[var(--nova-accent-color)]/25'
                : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:border-[var(--nova-accent-color)]/30'
            }`}
          >
            <SparklesIcon className="w-4 h-4" />
            <span>
              {premium
                ? t('settings.premiumActive')
                : `${t('settings.premiumUpgrade')} • ${minSubscriptionCost / 100} ${t('settings.premiumCurrency')}`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCryptoModalOpen(true)}
            disabled={premium}
            className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            <IconCurrencyDollar className="w-3.5 h-3.5 mr-1.5" />
            {t('premium.cryptoTitle')}
          </button>
        </div>
      </SettingsSection>

      <CryptoCheckoutModal
        isOpen={cryptoModalOpen}
        onClose={() => setCryptoModalOpen(false)}
        onSuccess={() => setCryptoModalOpen(false)}
      />
    </>
  );
});

import { IconCurrencyDollar } from '@tabler/icons-react';