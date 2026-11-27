import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconX as X,
  IconCheck as Check,
  IconBell as Bell,
  IconLock as Lock,
  IconDatabase as Database,
  IconPalette as Palette,
  IconInfoCircle as Info,
  IconLanguage as Language,
  IconDownload as Download,
  IconUpload as Upload,
  IconFileText as FileText,
  IconMoon as Moon,
  IconDeviceDesktop as Monitor,
  IconSun as Sun,
  IconCopy as Copy,
  IconAlertTriangle as AlertTriangle,
  IconSparkles as Sparkles,
  IconCurrencyDollar as DollarSign,
  IconSend as Send,
  IconChartBar as BarChart,
  IconChevronRight as ChevronRight,
  IconShieldHeart as ShieldHeart,
  IconSpeakerphone as Megaphone,
  IconRotate as Rotate,
  IconBan as Ban,
  IconSettings as Settings,
  IconHandClick as Hand,
  IconMapPin as MapPin,
  IconPlus as Plus,
  IconMovie as Film,
  IconRobot as Bot,
  IconCloud as Cloud,
  IconDeviceFloppy as HardDrive,
  IconTrashX as Trash2,
  IconTrash as Trash,
  IconGlobe as Globe,
  IconUser as User,
  IconUsers as Users,
  IconUserCircle as UserRound,
  IconPhone as Phone,
  IconClock as Clock,
  IconShieldCheck as ShieldCheck,
  IconMessageCircle as MessageCircle,
  IconVolumeOff as VolumeX,
  IconStar as Star,
  IconKey as Key,
  IconBug as Bug,
  IconChecks as CheckCheck2,
  IconChartBar as BarChart3,
  IconMessageCircle as MessageSquare,
  IconRotate as RotateCcw,
  IconShieldExclamation as ShieldExclamation,
  IconTrash as TrashX,
  IconUserCircle as UserCircle,
  IconSearch as Search,
} from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { pendingConsent, sanitizeManifest, type InstalledBot } from '../lib/bots/runtime';
import type { BotManifest, BotPermission } from '../lib/bots/types';
import { createAnonymousIdentity } from '../lib/crypto/identity';
import { usePremium } from '../hooks/usePremium';
import { resetOnboarding } from '../lib/onboarding';
import { PIN_HASH_KEY, PIN_ENABLED_KEY } from '../context/SecurityContext';
import { createKeychain } from '../lib/storage/keychain';
import { downloadEncryptedBackup, uploadEncryptedBackup } from '../lib/storage/cloudBackup';
import { downloadMyDataExport } from '../lib/dataExport';
import { localAnalytics } from '../lib/analytics/localAnalytics';
import {
  loadPrivacyPrefs,
  readBatteryStatus,
  savePrivacyPrefs,
  shouldEmitCoverTraffic,
  probeTor,
  type BatteryStatus,
  type PrivacyPrefs} from '../lib/network/privacyMode';
import { loadJoinOutbox, retryJoinOutboxNow } from '../lib/social/joinRequestRelay';
import {
  getSocialPrivacy,
  setSocialPrivacy,
  setContactBlocked,
  getBlockedContactsWithProfiles,
  getPhoneAccessContacts,
  grantPhoneAccess,
  revokePhoneAccess,
  type SocialPrivacySettings,
  type PrivacyScope} from '../lib/social/socialPrivacy';
import {
  clearLocalAdPrefs,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
  type LocalAdPreferences} from '../lib/ads/localAds';
import { loadSoundId, playSound, saveSoundId, SOUND_IDS, SOUNDS, type SoundId } from '../lib/notifications/sounds';
import {
  getNotificationPrefs,
  setNotificationPref,
  setNotificationException,
  setNotificationSound,
  muteContact,
  getMutedContacts,
  setPriorityContact,
  getPriorityContacts,
  type NotificationPrefs,
  type NotificationLevel,
  type MuteDurationKey} from '../lib/notifications/notificationPrefs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { CryptoCheckoutModal } from './CryptoCheckoutModal';
import { LegalModal } from './LegalModal';
import { SanctionScreen } from './SanctionScreen';
import { AccountSwitcher } from './AccountSwitcher';
import {
  SettingsSheet,
  SettingsTile,
  SettingsSection,
} from './settings/settingsPrimitives';
import {
  ACCENT_COLORS,
  APP_THEME_KEY,
  FONT_SIZE_KEY,
  FontSize,
  applyAppTheme,
  applyAccentColor,
  applyFontSize,
  readAppTheme,
  readFabSide,
  saveFabSide,
  isFabSide,
  FAB_SIDE_EVENT,
  type FabSide} from '../lib/ui/appearance';

import type { BotSession } from '../lib/bots/session';
import { movieCatalogBotManifest } from '../../examples/bots/movie-catalog/manifest';
import { novafatherManifest } from '../../examples/bots/novafather/manifest';
import { echoBotManifest } from '../../examples/bots/echo/manifest';

const AVAILABLE_BUILTIN_BOTS: BotManifest[] = [
  movieCatalogBotManifest,
  novafatherManifest,
  echoBotManifest,
];

type SettingsTab = 'general' | 'notifications' | 'privacy' | 'data' | 'advanced' | 'about';

interface SettingsModalTabbedProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnalytics?: () => void;
  onOpenSites?: () => void;
  getBotSession?: () => BotSession;
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  onBotInstallHandled?: () => void;
  onOpenBotChat?: (botId: string) => void;
  onOpenMeshMap?: () => void;
}

const SETTINGS_STORAGE_KEY = 'nova_messenger_settings';
const CLOUD_URL_STORAGE_KEY = 'nova_backup_cloud_url';

function loadSavedCloudUrl(): string {
  try { return localStorage.getItem(CLOUD_URL_STORAGE_KEY) ?? ''; } catch { return ''; }
}
function saveCloudUrl(url: string): void {
  try { if (url) localStorage.setItem(CLOUD_URL_STORAGE_KEY, url); else localStorage.removeItem(CLOUD_URL_STORAGE_KEY); } catch {}
}

interface Prefs {
  notificationSound: boolean;
  vibration: boolean;
  previewMessages: boolean;
  pushEnabled: boolean;
  autoDownload: boolean;
  fontSize: FontSize;
}
const DEFAULT_PREFS: Prefs = { notificationSound: true, vibration: false, previewMessages: true, pushEnabled: true, autoDownload: true, fontSize: 'medium' };
const CHAT_THEME_KEY = 'nova_chat_theme';

const THEME_OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; icon: React.ReactNode }> = [
  { value: 'light', icon: <Sun className="w-3 h-3" /> },
  { value: 'dark', icon: <Moon className="w-3 h-3" /> },
  { value: 'system', icon: <Monitor className="w-3 h-3" /> },
];

const CHAT_COLOR_OPTIONS: Array<{ value: 'default' | 'sapphire' | 'amethyst' | 'emerald'; grad: string }> = [
  { value: 'default', grad: 'from-[var(--nova-accent-color,#ff521a)] to-[var(--nova-accent-color,#ff3b00)]' },
  { value: 'sapphire', grad: 'from-[var(--chat-theme-sapphire-from)] to-[var(--chat-theme-sapphire-to)]' },
  { value: 'amethyst', grad: 'from-[var(--chat-theme-amethyst-from)] to-[var(--chat-theme-amethyst-to)]' },
  { value: 'emerald', grad: 'from-[var(--chat-theme-emerald-from)] to-[var(--chat-theme-emerald-to)]' },
];

function ChatColorOption({
  opt,
  chatColorTheme,
  premium,
  checkout,
  t,
  setChatColorTheme,
  CHAT_THEME_KEY,
}: {
  opt: { value: 'default' | 'sapphire' | 'amethyst' | 'emerald'; grad: string };
  chatColorTheme: string;
  premium: boolean;
  checkout: () => Promise<{ ok: boolean; error?: string }>;
  t: (...args: any[]) => any;
  setChatColorTheme: (value: 'default' | 'sapphire' | 'amethyst' | 'emerald') => void;
  CHAT_THEME_KEY: string;
}) {
  const label = opt.value === 'default'
    ? t('settings.chatColorDefault')
    : opt.value === 'sapphire'
    ? t('settings.chatColorSapphire')
    : opt.value === 'amethyst'
    ? t('settings.chatColorAmethyst')
    : t('settings.chatColorEmerald');
  const isSelected = chatColorTheme === opt.value;
  const isPremiumLocked = opt.value !== 'default' && !premium;
  const baseClass = 'flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition cursor-pointer relative overflow-hidden min-h-[44px]';
  const selectedClass = 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 shadow-sm shadow-[var(--nova-accent-color)]/25';
  const unselectedClass = 'bg-[var(--nova-overlay-weak)] border-transparent hover:bg-[var(--nova-overlay-weak)]';
  const disabledClass = isPremiumLocked ? ' opacity-60' : '';
  const className = `${baseClass} ${isSelected ? selectedClass : unselectedClass}${disabledClass}`;

  const handleClick = () => {
    if (isPremiumLocked) {
      checkout();
      return;
    }
    setChatColorTheme(opt.value);
    try { localStorage.setItem(CHAT_THEME_KEY, opt.value); } catch {}
  };

  return (
    <button
      key={opt.value}
      type="button"
      aria-disabled={isPremiumLocked}
      aria-label={label}
      onClick={handleClick}
      className={className}
    >
      <div className="relative w-8 h-8 rounded-full border border-[var(--nova-border-color)] shadow-sm overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-tr ${opt.grad}`} />
        <div className="absolute inset-1 rounded-full bg-[var(--nova-overlay-strong)]" />
        {isPremiumLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Lock className="w-4 h-4 text-[var(--nova-text-primary)]" />
          </div>
        )}
      </div>
      <span className={`text-[11px] font-medium ${isPremiumLocked ? 'text-[var(--nova-text-muted)]' : ''}`}>
        {label}
      </span>
      {isPremiumLocked && (
        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-accent-color)] flex items-center justify-center text-[11px] font-bold">
          <Lock className="w-3 h-3 fill-[var(--nova-text-primary)]" />
        </span>
      )}
    </button>
  );
}

const loadPrefs = (): Prefs => {
  try { const saved = localStorage.getItem(SETTINGS_STORAGE_KEY); if (saved) return { ...DEFAULT_PREFS, ...JSON.parse(saved) }; } catch {}
  return DEFAULT_PREFS;
};

const TAB_CONFIG: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'general', icon: <Settings className="w-4 h-4" /> },
  { id: 'notifications', label: 'notifications', icon: <Bell className="w-4 h-4" /> },
  { id: 'privacy', label: 'privacy', icon: <Lock className="w-4 h-4" /> },
  { id: 'data', label: 'data', icon: <Database className="w-4 h-4" /> },
  { id: 'advanced', label: 'advanced', icon: <ShieldExclamation className="w-4 h-4" /> },
  { id: 'about', label: 'about', icon: <Info className="w-4 h-4" /> },
];

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 px-1 pt-3 pb-1 first:pt-0">
    <div className="w-6 h-6 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">{icon}</div>
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">{title}</span>
  </div>
);

const ToggleRow: React.FC<{ label: string; enabled: boolean; onToggle: () => void }> = ({ label, enabled, onToggle }) => (
  <button type="button" role="switch" aria-checked={enabled} onClick={onToggle} className="w-full flex items-center justify-between py-3 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer min-h-[44px]">
    <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{label}</span>
    <span className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${enabled ? 'bg-[var(--nova-accent-color)]' : 'bg-[var(--nova-overlay-medium)]'}`}>
      <span className={`w-5 h-5 rounded-full bg-[var(--nova-on-accent)] shadow-md transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  </button>
);

const PrivacyScopeSelector: React.FC<{ value: PrivacyScope; onChange: (v: PrivacyScope) => void }> = ({ value, onChange }) => {
  const scopes: { value: PrivacyScope; label: string }[] = [{ value: 'everyone', label: 'Everyone' }, { value: 'contacts', label: 'My Contacts' }, { value: 'nobody', label: 'Nobody' }];
  return (
    <div className="flex items-center gap-1">
      {scopes.map((s) => (
        <button key={s.value} type="button" onClick={() => onChange(s.value)} className={`px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${value === s.value ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm' : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]'}`}>{s.label}</button>
      ))}
    </div>
  );
};

const NotificationLevelSelector: React.FC<{ value: NotificationLevel; onChange: (v: NotificationLevel) => void }> = ({ value, onChange }) => {
  const levels: { value: NotificationLevel; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'All', icon: <Bell className="w-3.5 h-3.5" /> },
    { value: 'mentions', label: 'Mentions', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { value: 'none', label: 'None', icon: <VolumeX className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="flex items-center gap-1">
      {levels.map((l) => (
        <button key={l.value} type="button" onClick={() => onChange(l.value)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${value === l.value ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm' : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]'}`} aria-label={l.label}>{l.icon}{l.label}</button>
      ))}
    </div>
  );
};

const PanelErrorBoundary = React.memo(({ name, children }: { name: string; children: React.ReactNode }) => {
  const [error, setError] = useState<Error | null>(null);
  if (error) return <div role="alert" data-testid={`${name}-error`} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 text-left"><pre className="max-h-full max-w-2xl overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--nova-surface)] p-4 text-xs text-red-400">{`${name}: ${error.message}\n${error.stack}`}</pre></div>;
  return <>{children}</>;
});

export const SettingsModalTabbed: React.FC<SettingsModalTabbedProps> = ({
  isOpen,
  onClose,
  onOpenAnalytics,
  onOpenSites,
  getBotSession,
  pendingBotInstall,
  onBotInstallHandled,
  onOpenBotChat,
  onOpenMeshMap,
}) => {
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const { t, language } = useLanguage();
  const { isInitialized, identity, clearLocalEncryptedData, verifyPin, setPin, removePin, pinHash, pinEnabled } = useSecurity();
  const { premium, checkout, minSubscriptionCost, freeDaysRemaining, loading } = usePremium();
  const { account } = (() => ({ account: { id: 'me', displayName: 'You', nickname: 'You', avatar: undefined } }))();
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusTrap = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'system'>(() => { try { return (localStorage.getItem(APP_THEME_KEY) as 'light' | 'dark' | 'system') ?? 'system'; } catch { return 'system'; } });
  const [chatColorTheme, setChatColorTheme] = useState<'default' | 'sapphire' | 'amethyst' | 'emerald'>(() => { try { return (localStorage.getItem(CHAT_THEME_KEY) as any) ?? 'default'; } catch { return 'default'; } });
  const [soundId, setSoundId] = useState<SoundId>(() => loadSoundId());
  const [fabSide, setFabSideState] = useState<FabSide>(() => readFabSide());
  const [privacyPrefs, setPrivacyPrefs] = useState<PrivacyPrefs>(loadPrivacyPrefs);
  const [socialPrivacy, setSocialPrivacyState] = useState<SocialPrivacySettings>(() => getSocialPrivacy());
  const [phoneAccessSheetOpen, setPhoneAccessSheetOpen] = useState(false);
  const [battery, setBattery] = useState<BatteryStatus>({ level: null, charging: true });
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearDataPin, setClearDataPin] = useState('');
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const [seedPhraseCopied, setSeedPhraseCopied] = useState(false);
  const [adPrefs, setAdPrefs] = useState<LocalAdPreferences>(() => loadAdPreferences());
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(() => getNotificationPrefs());
  const [joinOutbox, setJoinOutbox] = useState<any[]>(() => loadJoinOutbox());
  const [isRetryingJoin, setIsRetryingJoin] = useState(false);

  const fontSizeOptions: { value: Prefs['fontSize']; label: string }[] = [
    { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
  ];
  const fabSideOptions: { value: FabSide; label: string }[] = [
    { value: 'right', label: t('settings.fabHandRight', { defaultValue: 'Right hand' }) },
    { value: 'left', label: t('settings.fabHandLeft', { defaultValue: 'Left hand' }) },
  ];
  const updateFabSide = (side: FabSide) => { setFabSideState(side); saveFabSide(side); };
  const updatePref = (key: keyof Prefs, value: any) => { const next = { ...prefs, [key]: value }; setPrefs(next); try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next)); } catch {} };
  const updatePrivacyPref = (metadataMinimization: boolean) => { const next = { ...privacyPrefs, metadataMinimization }; setPrivacyPrefs(next); savePrivacyPrefs(next); };
  const updatePresencePref = (patch: Partial<PrivacyPrefs>) => { const next = { ...privacyPrefs, ...patch }; setPrivacyPrefs(next); savePrivacyPrefs(next); };

  useEffect(() => { if (appTheme) { setAppTheme(appTheme); applyAppTheme(appTheme); try { localStorage.setItem(APP_THEME_KEY, appTheme); } catch {} } }, [appTheme]);
  useEffect(() => { if (chatColorTheme) { applyAccentColor(ACCENT_COLORS[chatColorTheme]); try { localStorage.setItem(CHAT_THEME_KEY, chatColorTheme); } catch {} } }, [chatColorTheme]);
  useEffect(() => { if (prefs.fontSize) { applyFontSize(prefs.fontSize); } }, [prefs.fontSize]);
  useEffect(() => { const sync = (e: Event) => { const d = (e as CustomEvent<unknown>).detail; setFabSideState(isFabSide(d) ? d : readFabSide()); }; window.addEventListener(FAB_SIDE_EVENT, sync); window.addEventListener('storage', () => setFabSideState(readFabSide())); return () => { window.removeEventListener(FAB_SIDE_EVENT, sync); window.removeEventListener('storage', () => setFabSideState(readFabSide())); }; }, []);
  useEffect(() => { setSocialPrivacyState(getSocialPrivacy()); }, [t]);
  useEffect(() => {
    let cancelled = false;
    const refreshBattery = () => {
      void readBatteryStatus().then((b) => { if (!cancelled) setBattery(b); }).catch(() => {});
    };
    refreshBattery();
    const i = window.setInterval(refreshBattery, 30_000);
    return () => { cancelled = true; window.clearInterval(i); };
  }, []);
  useEffect(() => { if (isOpen && !isInitialized) { const t = window.setTimeout(() => setAboutMsg('Initializing security…'), 3000); return () => window.clearTimeout(t); } }, [isOpen, isInitialized]);

  const handleExportMyData = async () => { try { const fn = await downloadMyDataExport(); setAboutMsg(`Exported: ${fn}`); } catch { setAboutMsg('Export failed'); } };
  const eraseAllData = async () => { await clearLocalEncryptedData(); };
  const handleClearAllData = async () => { if (!clearDataConfirm) { setClearDataConfirm(true); setClearDataPin(''); return; } if (pinEnabled && clearDataPin.length < 4) return; const ok = await verifyPin(clearDataPin); if (!ok) { setClearDataPin(''); return; } await eraseAllData(); setClearDataConfirm(false); setClearDataPin(''); onClose(); };
  const handleCopySeedPhrase = async () => { const phrase = identity?.mnemonic ?? ''; if (!phrase) return; try { await navigator.clipboard.writeText(phrase); setSeedPhraseCopied(true); setTimeout(() => setSeedPhraseCopied(false), 2000); } catch {} };
  const retryJoinOutboxNow = async () => { setIsRetryingJoin(true); await import('../lib/social/joinRequestRelay').then(m => m.retryJoinOutboxNow()); setJoinOutbox(loadJoinOutbox()); setIsRetryingJoin(false); };

  const renderTab = (tab: SettingsTab) => {
    switch (tab) {
      case 'general': return (
        <>
          <SectionHeader icon={<Language className="w-3.5 h-3.5" />} title={t('settings.language')} />
          <LanguageSwitcher />
          <SectionHeader icon={<Palette className="w-3.5 h-3.5" />} title={t('settings.appearance')} />
          <div className="py-1"><div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">{t('settings.theme')}</div>
            <div className="flex gap-1">{THEME_OPTIONS.map((opt) => (<button key={opt.value} onClick={() => setAppTheme(opt.value)} className={`flex-1 flex items-center gap-2 py-2 px-2.5 rounded-xl border transition cursor-pointer ${appTheme === opt.value ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm' : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'}`}><span className="text-[12px] font-medium">{opt.value === 'light' ? t('settings.themeLight') : opt.value === 'dark' ? t('settings.themeDark') : t('settings.themeSystem')}</span></button>))}</div></div>
          <div className="py-1"><div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">{t('settings.fontSize')}</div>
            <div className="flex gap-1.5">{fontSizeOptions.map((opt) => (<button key={opt.value} onClick={() => updatePref('fontSize', opt.value)} className={`flex-1 flex flex-col items-center py-2 rounded-xl border transition cursor-pointer ${prefs.fontSize === opt.value ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm' : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'}`}><span className={opt.value === 'small' ? 'text-[11px] font-bold' : opt.value === 'medium' ? 'text-[14px] font-bold' : 'text-[18px] font-bold'}>A</span><span className="text-[9px] uppercase tracking-wider mt-0.5">{opt.label}</span></button>))}</div></div>
          <div className="py-1"><div className="flex items-center justify-between mb-1.5 px-1"><div className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.fabSide', { defaultValue: 'One-handed button' })}</div><span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.fabSideDesc', { defaultValue: 'Side of the New Action button' })}</span></div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('settings.fabSide', { defaultValue: 'One-handed button' })}>{fabSideOptions.map((opt) => (<button key={opt.value} type="button" role="radio" aria-checked={fabSide === opt.value} onClick={() => updateFabSide(opt.value)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border transition cursor-pointer text-[12px] ${fabSide === opt.value ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm' : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'}`}><Hand className={`w-3.5 h-3.5 ${opt.value === 'left' ? '-scale-x-100' : ''}`} /><span>{opt.label}</span></button>))}</div></div>
          <div className="py-1"><div className="flex items-center justify-between mb-1.5 px-1"><div className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.chatColors')}</div><span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.chatColorsDesc')}</span></div>
            <div className="flex gap-1">{CHAT_COLOR_OPTIONS.map((opt) => (
              <ChatColorOption
                key={opt.value}
                opt={opt}
                chatColorTheme={chatColorTheme}
                premium={premium}
                checkout={checkout}
                t={t}
                setChatColorTheme={setChatColorTheme}
                CHAT_THEME_KEY={CHAT_THEME_KEY}
              />
            ))}</div></div>
          <SectionHeader icon={<Sparkles className="w-3.5 h-3.5" />} title={t('settings.premium')} />
          <div className="py-1"><div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">{t('settings.premiumDesc')}</div>
            {freeDaysRemaining() > 0 && (<div className="mb-2 px-1 py-1.5 rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 text-xs text-[var(--nova-accent-color)]">{t('settings.premiumFreeTrial', { days: freeDaysRemaining() })}</div>)}
            <button onClick={async () => { const r = await checkout(); if (!r.ok && r.error) alert(r.error); }} className={`w-full py-2.5 px-4 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-md ${premium ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] border-[var(--nova-accent-color)] shadow-lg shadow-[var(--nova-accent-color)]/25' : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:border-[var(--nova-accent-color)]/30'}`} disabled={loading || premium}><Sparkles className="w-4 h-4" /> <span>{premium ? t('settings.premiumActive') : `${t('settings.premiumUpgrade')} • ${minSubscriptionCost / 100} ${t('settings.premiumCurrency')}`}</span></button>
            <button type="button" onClick={() => setCryptoModalOpen(true)} disabled={premium} className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"><DollarSign className="w-3.5 h-3.5 mr-1.5" />{t('premium.cryptoTitle')}</button></div>
        </>
      );
      case 'notifications': return (
        <>
          <SectionHeader icon={<Bell className="w-3.5 h-3.5" />} title={t('settings.notifications')} />
          <ToggleRow label={t('settings.notificationSound')} enabled={prefs.notificationSound} onToggle={() => updatePref('notificationSound', !prefs.notificationSound)} />
          {prefs.notificationSound && (<div className="flex flex-wrap gap-1.5 px-1 py-1">{SOUND_IDS.map((id) => (<button key={id} onClick={() => { saveSoundId(id); setSoundId(id); if (id !== 'silent') playSound('notification', id); }} className={`px-3 py-2 rounded-full text-[11px] border transition cursor-pointer min-h-[44px] flex items-center ${soundId === id ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-[var(--nova-text-primary)]' : 'border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'}`}>{id === 'silent' ? t('settings.soundSilent') : SOUNDS[id].label}</button>))}</div>)}
          <ToggleRow label={t('settings.vibration')} enabled={prefs.vibration} onToggle={() => updatePref('vibration', !prefs.vibration)} />
          <ToggleRow label={t('settings.previewMessages')} enabled={prefs.previewMessages} onToggle={() => updatePref('previewMessages', !prefs.previewMessages)} />
          <ToggleRow label={t('settings.pushNotifications')} enabled={prefs.pushEnabled} onToggle={() => updatePref('pushEnabled', !prefs.pushEnabled)} />
          {prefs.pushEnabled && (<div className="px-1 py-2 space-y-2"><p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">{t('settings.pushNotificationsDesc')}</p><div className="flex items-center gap-2 flex-wrap"><button onClick={async () => { const { registerForPush, unregisterFromPush, getPushToken } = await import('../lib/notifications/push'); if (prefs.pushEnabled) { const token = await registerForPush(); if (token) {} }}} className="px-3 py-1.5 text-sm font-medium text-[var(--nova-accent-color)] hover:text-[var(--nova-accent-color)]/80 border border-[var(--nova-accent-color)]/30 rounded-xl transition">{t('settings.registerPush')}</button><button onClick={async () => { const { unregisterFromPush } = await import('../lib/notifications/push'); await unregisterFromPush(); }} className="px-3 py-1.5 text-sm font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] border border-[var(--nova-border-subtle)] rounded-xl transition">{t('settings.unregisterPush')}</button></div></div>)}
          <SectionHeader icon={<Bell className="w-3.5 h-3.5" />} title={t('settings.notificationSettings')} />
          <div className="px-1 pb-2 space-y-2"><p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">{t('settings.notificationSettingsDesc')}</p>
            <div className="space-y-2"><p className="text-[11px] font-medium text-[var(--nova-text-secondary)]">{t('settings.defaultNotifications')}</p>
              {[{ key: 'privateChats', label: t('settings.privateChats'), icon: <MessageSquare className="w-3.5 h-3.5" /> }, { key: 'groups', label: t('settings.groups'), icon: <Users className="w-3.5 h-3.5" /> }, { key: 'channels', label: t('settings.channels'), icon: <Megaphone className="w-3.5 h-3.5" /> }, { key: 'bots', label: t('settings.bots'), icon: <Bot className="w-3.5 h-3.5" /> }].map((item) => (<div key={item.key} className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">{item.icon}</div><span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{item.label}</span></div><NotificationLevelSelector value={notificationPrefs[item.key as keyof NotificationPrefs] as NotificationLevel} onChange={(v) => { setNotificationPref(item.key as keyof NotificationPrefs, v); setNotificationPrefsState(getNotificationPrefs()); }} /></div>))}</div>
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]"><div className="flex items-center justify-between py-2 px-1"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400"><VolumeX className="w-3.5 h-3.5" /></div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.mutedContacts')}</span></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></div></div>
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]"><div className="flex items-center justify-between py-2 px-1"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400"><Star className="w-3.5 h-3.5" /></div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.priorityContacts')}</span></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></div></div></div>
        </>
      );
      case 'privacy': return (
        <>
          <SectionHeader icon={<Lock className="w-3.5 h-3.5" />} title={t('settings.privacy')} />
          <ToggleRow label={t('settings.metadataMinimization')} enabled={privacyPrefs.metadataMinimization} onToggle={() => updatePrivacyPref(!privacyPrefs.metadataMinimization)} />
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1">{t('settings.metadataMinimizationDesc')}</p>
          <div className="space-y-2"><p className="text-[11px] font-medium text-[var(--nova-text-secondary)] px-1">{t('settings.presenceSharing')}</p>
            <ToggleRow label={t('settings.presenceShare')} enabled={privacyPrefs.presenceSharing} onToggle={() => updatePresencePref({ presenceSharing: !privacyPrefs.presenceSharing })} />
            {privacyPrefs.presenceSharing && (<div className="px-1 py-1 space-y-2"><ToggleRow label={t('settings.presenceHashing')} enabled={privacyPrefs.presenceHashing} onToggle={() => updatePresencePref({ presenceHashing: !privacyPrefs.presenceHashing })} /><p className="text-[10px] text-[var(--nova-text-muted)] px-1">{t('settings.presenceHashingDesc')}</p><ToggleRow label={t('settings.presenceTtl')} enabled={privacyPrefs.presenceTtl === 'short'} onToggle={() => updatePresencePref({ presenceTtl: privacyPrefs.presenceTtl === 'short' ? 'normal' : 'short' })} /><p className="text-[10px] text-[var(--nova-text-muted)] px-1">{t('settings.presenceTtlDesc')}</p></div>)}
          </div>
          <SectionHeader icon={<ShieldCheck className="w-3.5 h-3.5" />} title={t('settings.socialPrivacy')} />
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1 mb-2">{t('settings.socialPrivacyDesc')}</p>
          <div className="space-y-2">{[
            { key: 'phoneNumber', label: t('settings.phoneNumber'), icon: <Phone className="w-3.5 h-3.5" /> },
            { key: 'lastSeen', label: t('settings.lastSeen'), icon: <Clock className="w-3.5 h-3.5" /> },
            { key: 'profilePhoto', label: t('settings.profilePhoto'), icon: <UserCircle className="w-3.5 h-3.5" /> },
            { key: 'about', label: t('settings.about'), icon: <Info className="w-3.5 h-3.5" /> },
            { key: 'groups', label: t('settings.groups'), icon: <Users className="w-3.5 h-3.5" /> },
            { key: 'calls', label: t('settings.calls'), icon: <Phone className="w-3.5 h-3.5" /> },
            { key: 'readReceipts', label: t('settings.readReceipts'), icon: <CheckCheck2 className="w-3.5 h-3.5" /> },
          ].map((item) => {
            if (item.key === 'phoneNumber') {
              const grantedCount = getPhoneAccessContacts().filter(c => c.hasAccess).length;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPhoneAccessSheetOpen(true)}
                  className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer"
                  data-testid="settings-who-sees-phoneNumber"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                      {item.icon}
                    </div>
                    <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.phoneAccessCount', { count: grantedCount })}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 text-[10px] font-medium text-[var(--nova-accent-color)]">{grantedCount}</span>
                  </div>
                </button>
              );
            }
            return (
              <div key={item.key} className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                    {item.icon}
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{item.label}</span>
                </div>
                <PrivacyScopeSelector value={socialPrivacy[item.key as keyof SocialPrivacySettings] as PrivacyScope} onChange={(v) => { setSocialPrivacy(item.key as keyof SocialPrivacySettings, v); setSocialPrivacyState(getSocialPrivacy()); }} />
              </div>
            );
          })}
          </div>
          <SectionHeader icon={<ShieldExclamation className="w-3.5 h-3.5" />} title={t('settings.blockedContacts')} />
          <div className="px-1 py-2 space-y-2">{/* Blocked contacts list - placeholder */}<p className="text-[11px] text-[var(--nova-text-muted)]">Blocked contacts management coming soon</p></div>
          <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} title={t('settings.torRouting')} />
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1 mb-2">{t('settings.torRoutingDesc')}</p>
          <ToggleRow label={t('settings.torEnabled')} enabled={privacyPrefs.torEnabled} onToggle={() => updatePresencePref({ torEnabled: !privacyPrefs.torEnabled })} />
          {privacyPrefs.torEnabled && (<div className="px-1 py-1 space-y-2"><button onClick={async () => { const result = await probeTor(privacyPrefs.torSocksPort); setAboutMsg(result.ok ? 'Tor reachable' : 'Tor not reachable'); }} className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-xs font-medium transition cursor-pointer">{t('settings.torTest')}</button><p className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.torTestDesc')}</p></div>)}
          <SectionHeader icon={<RotateCcw className="w-3.5 h-3.5" />} title="TURN Servers for IP-Privacy Calls" />
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1 mb-2">Configure TURN servers for WebRTC IP masking during calls.</p>
          <div className="px-1 py-1 space-y-2">{/* TURN config placeholder */}<p className="text-[11px] text-[var(--nova-text-muted)]">TURN server configuration coming soon</p></div>
        </>
      );
      case 'data': return (
        <>
          <SectionHeader icon={<Database className="w-3.5 h-3.5" />} title={t('settings.dataExport')} />
          <div className="px-1 py-2 space-y-2"><button onClick={handleExportMyData} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><FileText className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.exportMyData')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.exportMyDataDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
          <SectionHeader icon={<Database className="w-3.5 h-3.5" />} title={t('settings.dataBackup')} />
          <div className="px-1 py-2 space-y-2"><button onClick={() => setAboutMsg('Cloud backup is not configured yet')} disabled={!identity} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer disabled:opacity-50"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Upload className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.backupNow')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.backupNowDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button><button onClick={() => setAboutMsg('Cloud backup is not configured yet')} disabled={!identity} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer disabled:opacity-50"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Download className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.restoreBackup')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.restoreBackupDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
          <SectionHeader icon={<Cloud className="w-3.5 h-3.5" />} title="Google Drive" />
          <div className="px-1 py-2 space-y-2"><div className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Cloud className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">Google Drive Sync</span><span className="text-[10px] text-[var(--nova-text-muted)] block">Sync settings & backups to Google Drive</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></div></div>
          <SectionHeader icon={<AlertTriangle className="w-3.5 h-3.5" />} title={t('settings.dangerZone')} />
          <div className="px-1 py-2 space-y-2"><button onClick={handleClearAllData} disabled={clearDataConfirm} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-red-500/10 border border-red-500/20 transition cursor-pointer disabled:opacity-50"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center text-red-400"><TrashX className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-red-400">{t('settings.clearAllData')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.clearAllDataDesc')}</span></div></div></button>{clearDataConfirm && (<div className="space-y-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5"><input type="password" placeholder="Enter PIN to confirm" value={clearDataPin} onChange={(e) => setClearDataPin(e.target.value.replace(/\D/g, ''))} className="w-full px-3 py-2 rounded-xl border border-red-500/30 bg-[var(--nova-surface)] text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:border-red-500/60 focus:outline-none" maxLength={6} /><button onClick={handleClearAllData} disabled={pinEnabled && clearDataPin.length < 4} className="w-full py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition cursor-pointer disabled:opacity-50">{t('settings.confirmClearAll')}</button><button type="button" onClick={() => { setClearDataConfirm(false); setClearDataPin(''); }} className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] text-xs font-medium transition cursor-pointer">{t('common.cancel')}</button></div>)}</div>
        </>
      );
      case 'advanced': return (
        <>
          <SectionHeader icon={<Megaphone className="w-3.5 h-3.5" />} title={t('settings.advertising')} />
          <div className="px-1 py-2 space-y-2"><div className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400"><Megaphone className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.adPreferences')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.adPreferencesDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></div></div>
          <SectionHeader icon={<Send className="w-3.5 h-3.5" />} title={t('settings.joinOutbox')} />
          <div className="px-1 py-2 space-y-2">{joinOutbox.length === 0 ? <p className="text-[11px] text-[var(--nova-text-muted)] text-center py-4">{t('settings.joinOutboxEmpty')}</p> : joinOutbox.map((item) => (<div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--nova-overlay-weak)]"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]"><Send className="w-3 h-3" /></div><div><span className="text-[12px] font-medium text-[var(--nova-text-primary)]">{item.groupName}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">Retry: {item.retryCount}/{item.maxRetries}</span></div></div><span className="text-[10px] text-[var(--nova-text-muted)]">Next: {new Date(item.nextRetryAt).toLocaleTimeString()}</span></div>))}<button onClick={retryJoinOutboxNow} disabled={isRetryingJoin} className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] text-xs font-medium transition cursor-pointer disabled:opacity-50">{isRetryingJoin ? t('settings.retrying') : t('settings.retryAll')}</button></div>
          <SectionHeader icon={<Lock className="w-3.5 h-3.5" />} title={t('settings.security')} />
          <div className="px-1 py-2 space-y-2"><ToggleRow label={t('settings.pinEnabled')} enabled={pinEnabled} onToggle={async () => { if (pinEnabled) { await removePin(); return; } const pin = window.prompt('Set a 4-digit PIN'); if (pin && /^\d{4}$/.test(pin)) await setPin(pin); }} /><p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1">{t('settings.pinDesc')}</p>
            <button onClick={handleCopySeedPhrase} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Key className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.showSeedPhrase')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{seedPhraseCopied ? t('settings.copied') : t('settings.showSeedPhraseDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
          <SectionHeader icon={<ShieldExclamation className="w-3.5 h-3.5" />} title={t('bot.title')} />
          <div className="px-1 py-2 space-y-2">{/* Bot management placeholder */}<p className="text-[11px] text-[var(--nova-text-muted)]">Bot management UI coming soon</p></div>
          <SectionHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title={t('analytics.title')} />
          <div className="px-1 py-2 space-y-2"><button onClick={onOpenAnalytics} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><BarChart3 className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('analytics.title')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('analytics.openDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
          <SectionHeader icon={<Globe className="w-3.5 h-3.5" />} title={t('sites.title')} />
          <div className="px-1 py-2 space-y-2"><button onClick={onOpenSites} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Globe className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('sites.title')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('sites.openDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
          <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} title={t('meshMap.title')} />
          <div className="px-1 py-2 space-y-2"><button onClick={onOpenMeshMap} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><MapPin className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('meshMap.title')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('meshMap.openDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
        </>
      );
      case 'about': return (
        <>
          <SectionHeader icon={<Info className="w-3.5 h-3.5" />} title={t('settings.about')} />
          <div className="px-1 py-2 space-y-2"><div className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Info className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.version')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">v1.0.59</span></div></div></div>
            <button onClick={() => { try { navigator.clipboard.writeText(window.location.href); setAboutMsg('Link copied'); } catch {} }} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Copy className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.copyAppLink')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.copyAppLinkDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button>
            <button onClick={() => setAboutMsg('Debug info copied')} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Bug className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.copyDebugInfo')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.copyDebugInfoDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button>
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]"><button onClick={resetOnboarding} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400"><RotateCcw className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.resetOnboarding')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.resetOnboardingDesc')}</span></div></div></button></div>
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]"><button onClick={() => { try { navigator.clipboard.writeText(JSON.stringify({ version: '1.0.59', fingerprint: identity?.fingerprint, premium, language })); setAboutMsg('Debug info copied'); } catch {} }} className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]"><Bug className="w-3.5 h-3.5" /></div><div><span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.copyDebugInfo')}</span><span className="text-[10px] text-[var(--nova-text-muted)] block">{t('settings.copyDebugInfoDesc')}</span></div></div><ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" /></button></div>
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]"><p className="text-center text-[10px] text-[var(--nova-text-muted)]">Nova Dark Messenger • Open Source • Privacy First</p></div>
            {aboutMsg && <p className="text-center text-[11px] text-[var(--nova-accent-color)] mt-2">{aboutMsg}</p>}
          </div>
        </>
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 pt-[max(0.75rem,var(--nova-safe-top))] pb-[max(0.75rem,var(--nova-safe-bottom))] animate-in fade-in duration-200">
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md text-[var(--nova-text-primary)] shadow-2xl max-h-[calc(100dvh-2rem-var(--nova-safe-top)-var(--nova-safe-bottom))] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-3 border-b border-[var(--nova-border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5 flex-1"><div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]"><Palette className="w-4 h-4" /></div><div><h3 id="settings-title" className="font-bold text-sm text-[var(--nova-text-primary)] leading-tight">{t('settings.title')}</h3><p className="text-[10.5px] text-[var(--nova-text-muted)]">{t('app.name')}</p></div></div>
          <div className="flex gap-1">
            {TAB_CONFIG.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition cursor-pointer min-h-[44px] ${activeTab === tab.id ? 'bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] font-semibold' : 'text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'} min-w-[80px]`}>{tab.icon}<span className="text-[11px]">{t(`settings.tab${tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}`)}</span></button>
            ))}
          </div>
        </div>
        {/* Settings Search Bar */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative flex items-center">
            <div className="absolute left-3 text-[var(--nova-accent-color)] pointer-events-none flex items-center justify-center">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={settingsSearchQuery}
              onChange={(e) => setSettingsSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSettingsSearchQuery("");
              }}
              placeholder={t('settings.searchPlaceholder', { defaultValue: 'Search settings...' })}
              className="w-full bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-xs rounded-full pl-9 pr-9 py-2 transition-all shadow-inner focus:outline-none"
              data-inline-focus
            />
            {settingsSearchQuery && (
              <button
                onClick={() => setSettingsSearchQuery("")}
                className="absolute right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={t("common.close")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-4 py-3 space-y-1 flex-1 min-h-0">{renderTab(activeTab)}</div>
      </div>
        {/* Phone Access Sheet */}
        <SettingsSheet
          open={phoneAccessSheetOpen}
          onClose={() => setPhoneAccessSheetOpen(false)}
          title={t('settings.phoneAccessTitle', { defaultValue: 'Who can see your phone number' })}
          description={t('settings.phoneAccessDesc', { defaultValue: 'Only people you explicitly grant access can see your phone number. Contacts do not get access automatically.' })}
          testId="settings-phone-access-sheet"
        >
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(() => {
              const contacts = getPhoneAccessContacts();
              if (contacts.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 text-[var(--nova-text-muted)] text-[11px]">
                    {t('settings.noContactsWithPhone', { defaultValue: 'No contacts with phone numbers' })}
                  </div>
                );
              }
              return (
                <div className="space-y-1.5">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--nova-overlay-weak)] flex items-center justify-center shrink-0">
                          {contact.avatar ? (
                            <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-xs font-bold text-[var(--nova-accent-color)]">
                              {contact.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-[var(--nova-text-primary)] truncate">{contact.name}</p>
                          {contact.nickname && <p className="text-[10px] text-[var(--nova-text-muted)] truncate">@{contact.nickname}</p>}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={contact.hasAccess}
                          onChange={(e) => {
                            if (e.target.checked) {
                              grantPhoneAccess(contact.id);
                            } else {
                              revokePhoneAccess(contact.id);
                            }
                            setSocialPrivacyState(getSocialPrivacy());
                          }}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 rounded-full border-2 transition-colors ${
                          contact.hasAccess
                            ? 'bg-[var(--nova-accent-color)] border-[var(--nova-accent-color)]'
                            : 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)]'
                        }`}>
                          <span className={`inline-block w-5 h-5 rounded-full bg-white transform transition-transform ${
                            contact.hasAccess ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="shrink-0 border-t border-[var(--nova-border-subtle)] p-4">
            <button
              type="button"
              onClick={() => setPhoneAccessSheetOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] font-medium hover:opacity-90 transition cursor-pointer"
            >
              {t('common.done', { defaultValue: 'Done' })}
            </button>
          </div>
        </SettingsSheet>

      {cryptoModalOpen && (
        <CryptoCheckoutModal
          isOpen={cryptoModalOpen}
          onClose={() => setCryptoModalOpen(false)}
          onSuccess={() => setCryptoModalOpen(false)}
        />
      )}
    </div>
  );
};

export default SettingsModalTabbed;
























