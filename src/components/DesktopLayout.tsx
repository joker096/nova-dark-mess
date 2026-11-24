import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LayoutDashboard, Users, MessageSquare, Settings, ChevronLeft, ChevronRight, Sparkles, FolderPlus, Folder, X, Plus, Search, MapPin, Megaphone, BarChart3, Globe, Palette, Shield, Bell, Database, Send, Archive, Clock, Check, BellOff, VolumeX, Pin as PinIcon, Trash2, UserRound, Upload, Hand, Cloud, Hand as HandIcon, Sparkles as SparklesIcon } from 'lucide-react';
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
  type PrivacyPrefs,
} from '../lib/network/privacyMode';
import { loadJoinOutbox, retryJoinOutboxNow } from '../lib/social/joinRequestRelay';
import {
  getSocialPrivacy,
  setSocialPrivacy,
  setContactBlocked,
  getBlockedContactsWithProfiles,
  type SocialPrivacySettings,
  type PrivacyScope,
} from '../lib/social/socialPrivacy';
import {
  clearLocalAdPrefs,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
  type LocalAdPreferences,
} from '../lib/ads/localAds';
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
  type MuteDurationKey,
} from '../lib/notifications/notificationPrefs';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { CryptoCheckoutModal } from './CryptoCheckoutModal';
import { LegalModal } from './LegalModal';
import { SanctionScreen } from './SanctionScreen';
import { AccountSwitcher } from './AccountSwitcher';
import { BottomNav } from './BottomNav';
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
  type FabSide,
} from '../lib/ui/appearance';

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

interface DesktopLayoutProps {
  currentScreen: string;
  activeChatId: string | null;
  activeProfileId: string | null;
  activeChannelId: string | null;
  onNavigate: (screen: string, opts?: { chatId?: string; profileId?: string; channelId?: string }) => void;
  onGoBack: () => void;
  getBotSession?: () => any;
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  onBotInstallHandled?: () => void;
  onOpenBotChat?: (botId: string) => void;
  onOpenMeshMap?: () => void;
}

const TAB_CONFIG: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'general', icon: <Settings className="w-4 h-4" /> },
  { id: 'notifications', label: 'notifications', icon: <Bell className="w-4 h-4" /> },
  { id: 'privacy', label: 'privacy', icon: <Lock className="w-4 h-4" /> },
  { id: 'data', label: 'data', icon: <Database className="w-4 h-4" /> },
  { id: 'advanced', label: 'advanced', icon: <Shield className="w-4 h-4" /> },
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

export const DesktopLayout: React.FC<DesktopLayoutProps> = ({
  currentScreen,
  activeChatId,
  activeProfileId,
  activeChannelId,
  onNavigate,
  onGoBack,
  getBotSession,
  pendingBotInstall,
  onBotInstallHandled,
  onOpenBotChat,
  onOpenMeshMap,
}) => {
  const { t, language } = useLanguage();
  const { isInitialized, identity, clearLocalEncryptedData, verifyPinWithFeedback, pinHash, pinEnabled } = useSecurity();
  const { premium, checkout, minSubscriptionCost, freeDaysRemaining, setCryptoModalOpen, loading } = usePremium();
  const { account } = (() => ({ account: { id: 'me', displayName: 'You', nickname: 'You', avatar: undefined } }))();
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusTrap = useFocusTrap<HTMLDivElement>(false, () => {});

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [prefs, setPrefs] = useState<any>(() => { try { const saved = localStorage.getItem('nova_messenger_settings'); if (saved) return { ...{ notificationSound: true, vibration: false, previewMessages: true, pushEnabled: true, autoDownload: true, fontSize: 'medium' }, ...JSON.parse(saved) }; } catch {} return { notificationSound: true, vibration: false, previewMessages: true, pushEnabled: true, autoDownload: true, fontSize: 'medium' }; });
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'system'>(() => { try { return (localStorage.getItem('nova_app_theme') as 'light' | 'dark' | 'system') ?? 'system'; } catch { return 'system'; } });
  const [chatColorTheme, setChatColorTheme] = useState<'default' | 'sapphire' | 'amethyst' | 'emerald'>(() => { try { return (localStorage.getItem('nova_chat_theme') as any) ?? 'default'; } catch { return 'default'; } });
  const [soundId, setSoundId] = useState<any>(() => loadSoundId());
  const [fabSide, setFabSideState] = useState<any>(() => readFabSide());
  const [privacyPrefs, setPrivacyPrefs] = useState<any>(loadPrivacyPrefs);
  const [socialPrivacy, setSocialPrivacyState] = useState<any>(() => getSocialPrivacy());
  const [battery, setBattery] = useState<any>({ level: null, charging: true });
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearDataPin, setClearDataPin] = useState('');
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);
  const [seedPhraseCopied, setSeedPhraseCopied] = useState(false);
  const [adPrefs, setAdPrefs] = useState<any>(() => loadAdPreferences());
  const [notificationPrefs, setNotificationPrefsState] = useState<any>(() => getNotificationPrefs());
  const [joinOutbox, setJoinOutbox] = useState<any[]>(() => loadJoinOutbox());
  const [isRetryingJoin, setIsRetryingJoin] = useState(false);

  const fontSizeOptions: { value: any; label: string }[] = [
    { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
  ];
  const fabSideOptions: { value: any; label: string }[] = [
    { value: 'right', label: t('settings.fabHandRight', { defaultValue: 'Right hand' }) },
    { value: 'left', label: t('settings.fabHandLeft', { defaultValue: 'Left hand' }) },
  ];
  const updateFabSide = (side: any) => { setFabSideState(side); saveFabSide(side); };
  const updatePref = (key: string, value: any) => { const next = { ...prefs, [key]: value }; setPrefs(next); try { localStorage.setItem('nova_messenger_settings', JSON.stringify(next)); } catch {} };
  const updatePrivacyPref = (metadataMinimization: boolean) => { const next = { ...privacyPrefs, metadataMinimization }; setPrivacyPrefs(next); savePrivacyPrefs(next); };
  const updatePresencePref = (patch: any) => { const next = { ...privacyPrefs, ...patch }; setPrivacyPrefs(next); savePrivacyPrefs(next); };

  useEffect(() => { if (appTheme) { setAppTheme(appTheme); applyAppTheme(appTheme); try { localStorage.setItem('nova_app_theme', appTheme); } catch {} } }, [appTheme]);
  useEffect(() => { if (chatColorTheme) { applyAccentColor(ACCENT_COLORS[chatColorTheme]); try { localStorage.setItem('nova_chat_theme', chatColorTheme); } catch {} } }, [chatColorTheme]);
  useEffect(() => { if (prefs.fontSize) { applyFontSize(prefs.fontSize); } }, [prefs.fontSize]);
  useEffect(() => { const sync = (e: Event) => { const d = (e as CustomEvent<unknown>).detail; setFabSideState(isFabSide(d) ? d : readFabSide()); }; window.addEventListener(FAB_SIDE_EVENT, sync); window.addEventListener('storage', () => setFabSideState(readFabSide())); return () => { window.removeEventListener(FAB_SIDE_EVENT, sync); window.removeEventListener('storage', () => setFabSideState(readFabSide())); }; }, []);
  useEffect(() => { setSocialPrivacyState(getSocialPrivacy()); }, [t]);
  useEffect(() => { const b = readBatteryStatus(); setBattery(b); const i = window.setInterval(() => setBattery(readBatteryStatus()), 30_000); return () => window.clearInterval(i); }, []);
  useEffect(() => { if (false && !isInitialized) { const t = window.setTimeout(() => setAboutMsg('Initializing security…'), 3000); return () => window.clearTimeout(t); } }, [false, isInitialized]);

  const handleExportMyData = async () => { try { const fn = await downloadMyDataExport(); setAboutMsg(`Exported: ${fn}`); } catch { setAboutMsg('Export failed'); } };
  const eraseAllData = async () => { await clearLocalEncryptedData(); };
  const handleClearAllData = async () => { if (!clearDataConfirm) { setClearDataConfirm(true); setClearDataPin(''); return; } if (pinEnabled && clearDataPin.length < 4) return; const ok = await verifyPinWithFeedback(clearDataPin); if (!ok) { setClearDataPin(''); return; } await eraseAllData(); setClearDataConfirm(false); setClearDataPin(''); onGoBack(); };
  const handleCopySeedPhrase = async () => { const phrase = identity?.mnemonic ?? ''; if (!phrase) return; try { await navigator.clipboard.writeText(phrase); setSeedPhraseCopied(true); setTimeout(() => setSeedPhraseCopied(false), 2000); } catch {} };
  const retryJoinOutboxNow = async () => { setIsRetryingJoin(true); await import('../lib/social/joinRequestRelay').then(m => m.retryJoinOutboxNow()); setJoinOutbox(loadJoinOutbox()); setIsRetryingJoin(false); };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-app)]">
      {/* Desktop implementation would go here - this is a placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center text-[var(--nova-text-muted)]">
          <LayoutDashboard className="w-16 h-16 mx-auto mb-4 text-[var(--nova-text-muted)]/30" />
          <h2 className="text-xl font-semibold text-[var(--nova-text-primary)] mb-2">Desktop Layout</h2>
          <p>Navigation Provider and Desktop Layout components created. Integration needed.</p>
          <p className="text-sm mt-2">Current screen: {currentScreen}</p>
        </div>
      </div>
    </div>
  );
};

export default DesktopLayout;