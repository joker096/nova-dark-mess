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
  IconChartBar as BarChart3,
  IconChevronRight as ChevronRight,
  IconShieldHeart as ShieldHeart,
  IconSpeakerphone as Megaphone,
  IconRotate as Rotate,
  IconRotateClockwise as RotateCcw,
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
  IconUserCircle as UserCircle,
  IconPhone as Phone,
  IconClock as Clock,
  IconShieldCheck as ShieldCheck,
  IconMessageCircle as MessageCircle,
  IconVolumeOff as VolumeX,
  IconStar as Star,
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconTypography as Type,
  IconDeviceMobileVibration as Vibrate,
  IconBellRinging as BellRing,
  IconBellOff as BellOff,
  IconEye as Eye,
  IconShield as Shield,
  IconShieldHalf as ShieldHalf,
  IconShieldExclamation as ShieldExclamation,
  IconWifi as Wifi,
  IconHash as Hash,
  IconHelpCircle as HelpCircle,
  IconKey as KeyRound,
  IconVolume2 as Volume2,
  IconCrown as Crown,
  IconLayoutGrid as LayoutGrid,
  IconFingerprint as Fingerprint,
  IconChecks as CheckCheck2,
  IconAlertCircle as AlertCircle,
  IconLink as Link,
  IconMessageCircle as MessageSquare,
  IconMovie as Movie,
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
  getSocialEngineeringSettings,
  setSocialEngineeringSetting,
  type SocialEngineeringSettings} from '../lib/security/socialEngineering';
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
import { useSettings } from '../context/SettingsContext';
import { GeneralTab } from './settings/tabs/GeneralTab';
import { NotificationsTab } from './settings/tabs/NotificationsTab';
import { PrivacyTab } from './settings/tabs/PrivacyTab';
import { DataTab } from './settings/tabs/DataTab';
import { AdvancedTab } from './settings/tabs/AdvancedTab';
import { AboutTab } from './settings/tabs/AboutTab';
import {
  SettingsTabs,
  SettingsTile,
  IconCycleButton,
  IconToggle,
  IconSegmented,
  InfoHint,
  SettingsSheet,
  HoldToConfirm,
  SettingsSection} from './settings/settingsPrimitives';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnalytics?: () => void;
  onOpenSites?: () => void;
  /** Bot session for Settings → Bots management (Phase B3). */
  getBotSession?: () => BotSession;
  /** Pending bot install from deep link (Phase B3). */
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  /** Called when the bot install flow is handled (dismissed or completed). */
  onBotInstallHandled?: () => void;
  /** Opens (or starts) a conversation with an installed bot. */
  onOpenBotChat?: (botId: string) => void;
  /** Opens the Mesh Map screen. */
  onOpenMeshMap?: () => void;
}

const SETTINGS_STORAGE_KEY = 'nova_messenger_settings';

const CLOUD_URL_STORAGE_KEY = 'nova_backup_cloud_url';

function loadSavedCloudUrl(): string {
  try {
    return localStorage.getItem(CLOUD_URL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveCloudUrl(url: string): void {
  try {
    if (url) localStorage.setItem(CLOUD_URL_STORAGE_KEY, url);
    else localStorage.removeItem(CLOUD_URL_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

interface Prefs {
  notificationSound: boolean;
  vibration: boolean;
  previewMessages: boolean;
  pushEnabled: boolean;
  autoDownload: boolean;
  fontSize: FontSize;
}

const DEFAULT_PREFS: Prefs = {
  notificationSound: true,
  vibration: false,
  previewMessages: true,
  pushEnabled: true,
  autoDownload: true,
  fontSize: 'medium',
};

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

const loadPrefs = (): Prefs => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    }
  } catch { void 0; }
  return DEFAULT_PREFS;
};

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 px-1 pt-3 pb-1 first:pt-0">
    <div className="w-6 h-6 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
      {icon}
    </div>
    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">{title}</span>
  </div>
);

const ToggleRow: React.FC<{ label: string; enabled: boolean; onToggle: () => void }> = ({
  label,
  enabled,
  onToggle,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={onToggle}
    className="w-full flex items-center justify-between py-3 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer min-h-[44px]"
  >
    <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{label}</span>
    <span
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
        enabled ? 'bg-[var(--nova-accent-color)]' : 'bg-[var(--nova-overlay-medium)]'
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full bg-[var(--nova-on-accent)] shadow-md transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);

const PrivacyScopeSelector: React.FC<{ value: PrivacyScope; onChange: (v: PrivacyScope) => void }> = ({
  value,
  onChange,
}) => {
  const scopes: { value: PrivacyScope; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'contacts', label: 'My Contacts' },
    { value: 'nobody', label: 'Nobody' },
  ];

  return (
    <div className="flex items-center gap-1">
      {scopes.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${
            value === s.value
              ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm'
              : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
};

const NotificationLevelSelector: React.FC<{ value: NotificationLevel; onChange: (v: NotificationLevel) => void }> = ({
  value,
  onChange,
}) => {
  const levels: { value: NotificationLevel; label: string }[] = [
    { value: 'all', label: 'All Messages' },
    { value: 'mentions', label: 'Mentions Only' },
    { value: 'none', label: 'None' },
  ];

  return (
    <div className="flex items-center gap-1">
      {levels.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => onChange(l.value)}
          className={`px-2 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer ${
            value === l.value
              ? 'bg-[var(--nova-accent-color)] text-[var(--text-on-accent)] shadow-sm'
              : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)]'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
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
  const { t, language, changeLanguage } = useLanguage();
  const { state, updateAppSetting } = useSettings();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  const { premium, loading, checkout, canUse, freeDaysRemaining, minSubscriptionCost } = usePremium();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const {
    identity,
    is2FAEnabled,
    totpSecret,
    enable2FA,
    disable2FA,
    exportEncryptedBackup,
    importEncryptedBackup,
    pinEnabled,
    setPin,
    verifyPin,
    removePin,
    clearLocalEncryptedData,
    pinLength,
    setPinLength,
    lockOnHide,
    setLockOnHide,
    biometricSupported,
    biometricEnabled,
    enableBiometric,
    disableBiometric,
    secureStorage,
    dbAvailable,
  } = useSecurity();
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'system'>(readAppTheme);
  const [chatColorTheme, setChatColorTheme] = useState<'default' | 'sapphire' | 'amethyst' | 'emerald'>(() => {
    try {
      const saved = localStorage.getItem(CHAT_THEME_KEY);
      return saved === 'default' || saved === 'sapphire' || saved === 'amethyst' || saved === 'emerald' ? saved : 'default';
    } catch {
      return 'default';
    }
  });
  const [backupModal, setBackupModal] = useState<{ open: boolean; mode: 'export' | 'import' } | null>(null);
  const [cryptoModalOpen, setCryptoModalOpen] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCloudBlob, setImportCloudBlob] = useState<Blob | null>(null);
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudToken, setCloudToken] = useState('');
  const [privacyPrefs, setPrivacyPrefs] = useState<PrivacyPrefs>(loadPrivacyPrefs);
  const [socialPrivacy, setSocialPrivacyState] = useState<SocialPrivacySettings>(() => getSocialPrivacy());
  const [socialEngineering, setSocialEngineeringState] = useState<SocialEngineeringSettings>(() => getSocialEngineeringSettings());
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(() => getNotificationPrefs());
  const [torStatus, setTorStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [newRelayOperator, setNewRelayOperator] = useState('');
  const [newTurnServerUrl, setNewTurnServerUrl] = useState('');
  const [newTurnServerUsername, setNewTurnServerUsername] = useState('');
  const [newTurnServerPassword, setNewTurnServerPassword] = useState('');
  const [newTurnServerRealm, setNewTurnServerRealm] = useState('');
  const [joinOutboxCount, setJoinOutboxCount] = useState<number>(() => loadJoinOutbox().length);
  const [adPrefs, setAdPrefs] = useState<LocalAdPreferences>(() => loadAdPreferences());
  const [adPrefsMsg, setAdPrefsMsg] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState(() => localAnalytics.getCrashes().length);
  const [crashMsg, setCrashMsg] = useState<string | null>(null);
  const [soundId, setSoundId] = useState<SoundId>(loadSoundId);
  const [fabSide, setFabSideState] = useState<FabSide>(() => readFabSide());

  // Relay queue length and local ad preferences can change while the modal is closed.
  useEffect(() => {
    if (!isOpen) return;
    setJoinOutboxCount(loadJoinOutbox().length);
    setAdPrefs(loadAdPreferences());
    setAdPrefsMsg(null);
    setCrashCount(localAnalytics.getCrashes().length);
    setCrashMsg(null);
    setSocialPrivacyState(getSocialPrivacy());
    setNotificationPrefsState(getNotificationPrefs());
  }, [isOpen]);

  const [battery, setBattery] = useState<BatteryStatus>({ level: null, charging: true });
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [isRemovingPin, setIsRemovingPin] = useState(false);
  const [showSeedPhraseModal, setShowSeedPhraseModal] = useState(false);
  const [seedPhraseCopied, setSeedPhraseCopied] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearDataPin, setClearDataPin] = useState('');
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageUsage, setStorageUsage] = useState<{ category: string; bytes: number }[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [aboutMsg, _setAboutMsg] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  // Google Drive backup state
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveLinking, setGdriveLinking] = useState(false);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveBackups, setGdriveBackups] = useState<{ id: string; name: string; size: number; createdAt: number }[]>([]);
  const [gdriveMsg, setGdriveMsg] = useState<string | null>(null);

  // --- Bots (Phase B3) ---
  const [botsOpen, setBotsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installingBot, setInstallingBot] = useState<{ manifest: InstalledBot['manifest']; granted: BotPermission[] } | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  /** Developer registry: create a local L1 bot manifest + keypair in the vault. */
  const [devRegistryOpen, setDevRegistryOpen] = useState(false);
  const [devName, setDevName] = useState('');
  const [devUsername, setDevUsername] = useState('');
  const [devDesc, setDevDesc] = useState('');
  const [devCreating, setDevCreating] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  /** Install from a local manifest file. */
  const [installFromFile, setInstallFromFile] = useState(false);
  const [fileManifest, setFileManifest] = useState<BotManifest | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // New tabbed settings state
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'privacy' | 'advanced' | 'data' | 'about'>('general');
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [melodySheetOpen, setMelodySheetOpen] = useState(false);
  const [premiumSheetOpen, setPremiumSheetOpen] = useState(false);
  const [privacyPresetSheetOpen, setPrivacyPresetSheetOpen] = useState(false);
  const [whoSeesSheetOpen, setWhoSeesSheetOpen] = useState<string | null>(null);
  const [phoneAccessSheetOpen, setPhoneAccessSheetOpen] = useState(false);
  const [relaysSheetOpen, setRelaysSheetOpen] = useState(false);
  const [turnSheetOpen, setTurnSheetOpen] = useState(false);
  const [torSheetOpen, setTorSheetOpen] = useState(false);
  const [presenceSheetOpen, setPresenceSheetOpen] = useState(false);
  const [analyticsSheetOpen, setAnalyticsSheetOpen] = useState(false);
  const [adsSheetOpen, setAdsSheetOpen] = useState(false);
  const [driveSheetOpen, setDriveSheetOpen] = useState(false);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [twoFactorSheetOpen, setTwoFactorSheetOpen] = useState(false);
  const [recoveryGateOpen, setRecoveryGateOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [storageExpanded, setStorageExpanded] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2200);
  };

  // Handle pending bot install from deep link
  useEffect(() => {
    if (!isOpen) return;
    if (pendingBotInstall && getBotSession) {
      const session = getBotSession();
      const bot = session.listBots().find((b) => b.manifest.id === pendingBotInstall.id);
      if (!bot) {
        // Bot not installed - open bots modal to install it
        setBotsOpen(true);
        // Show a toast or notification that the bot needs to be installed first
        showToast(`${t('bot.notInstalled', { defaultValue: 'Bot not installed. Please install it first.' })}: ${pendingBotInstall.id}`);
      }
    }
    onBotInstallHandled?.();
  }, [isOpen, pendingBotInstall, getBotSession, onBotInstallHandled]);

  // The registry is mutable; this counter forces a re-render after
  // enable/block/install actions so the list reflects the new state.
  const [, setBotsVersion] = useState(0);
  const getBots = useCallback(() => {
    const session = getBotSession?.();
    return session ? session.listBots() : [];
  }, [getBotSession]);

  const toggleBot = useCallback(
    (botId: string, enabled: boolean) => {
      const session = getBotSession?.();
      if (!session) return;
      void session
        .setBotEnabled(botId, enabled)
        .then(() => setBotsVersion((version) => version + 1))
        .catch((err) => {
          console.error('Failed to toggle bot:', err);
        });
    },
    [getBotSession],
  );

  const setBotBlocked = useCallback(
    (botId: string, blocked: boolean) => {
      const session = getBotSession?.();
      if (!session) return;
      void session
        .setBlocked(botId, blocked)
        .then(() => setBotsVersion((version) => version + 1))
        .catch((err) => {
          console.error('Failed to update bot block:', err);
        });
    },
    [getBotSession],
  );

  const uninstallBot = useCallback(
    (botId: string) => {
      const session = getBotSession?.();
      if (!session) return;
      void session
        .uninstallBot(botId)
        .then(() => setBotsVersion((version) => version + 1))
        .catch((err) => {
          console.error('Failed to uninstall bot:', err);
        });
    },
    [getBotSession],
  );

  const requestInstall = useCallback(
    (manifest: import('../lib/bots/runtime').InstalledBot['manifest']) => {
      const session = getBotSession?.();
      if (!session) return;
      const installed = session.listBots().find((b) => b.manifest.id === manifest.id);
      if (installed) {
        setInstallingBot(null);
        return;
      }
      const requested = manifest.requestedPermissions.slice();
      setInstallingBot({ manifest, granted: [] });
      setInstallOpen(true);
      setInstallError(null);
      // Pre-select all requested permissions; user can toggle below.
      setInstallingBot((prev) => (prev ? { ...prev, granted: requested } : null));
    },
    [getBotSession],
  );

  const confirmInstall = useCallback(async () => {
    if (!installingBot) return;
    const session = getBotSession?.();
    if (!session) return;
    setInstallError(null);
    try {
      await session.installBot(installingBot.manifest, installingBot.granted);
      setInstallOpen(false);
      setInstallingBot(null);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed');
    }
  }, [installingBot, getBotSession]);

  /** Create a local L1 bot: generate a keypair in the vault, build a manifest,
   *  and install it with the developer-selected permissions. */
  const createLocalBot = useCallback(async () => {
    const session = getBotSession?.();
    if (!session) return;
    setDevError(null);
    setDevCreating(true);
    try {
      const identity = await createAnonymousIdentity();
      const manifest: BotManifest = {
        id: `bot_local_${identity.fingerprint.slice(0, 8)}`,
        name: devName.trim() || 'Local Bot',
        username: devUsername.trim() || `local_${identity.fingerprint.slice(0, 8)}bot`,
        description: devDesc.trim() || undefined,
        version: '1.0.0',
        entryPoint: undefined,
        gatewayUrl: undefined,
        commands: [],
        requestedPermissions: ['send_messages'],
      };
      await session.installBot(manifest, ['send_messages']);
      setDevName('');
      setDevUsername('');
      setDevDesc('');
      setDevRegistryOpen(false);
    } catch (err) {
      setDevError(err instanceof Error ? err.message : 'Failed to create local bot');
    } finally {
      setDevCreating(false);
    }
  }, [devName, devUsername, devDesc, getBotSession]);

  /** Read a manifest from a local file and queue it for the install consent flow. */
  const readFileManifest = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const manifest = sanitizeManifest(raw);
        setFileManifest(manifest);
        setInstallFromFile(false);
        // Open the same consent flow used for links.
        setInstallingBot({ manifest, granted: [...manifest.requestedPermissions] });
        setInstallOpen(true);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Invalid manifest file');
      }
    };
    reader.onerror = () => setFileError('Failed to read file');
    reader.readAsText(file);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (backupModal) {
        setBackupModal(null);
        return;
      }
      if (showSeedPhraseModal) {
        setShowSeedPhraseModal(false);
        return;
      }
      if (botsOpen) {
        setBotsOpen(false);
        return;
      }
      if (installOpen) {
        setInstallOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, backupModal, showSeedPhraseModal, botsOpen, installOpen, onClose]);

  useEffect(() => {
    applyAppTheme(appTheme);
    applyFontSize(prefs.fontSize);
    applyAccentColor(ACCENT_COLORS[chatColorTheme]);
    try {
      localStorage.setItem(APP_THEME_KEY, appTheme);
      localStorage.setItem(FONT_SIZE_KEY, prefs.fontSize);
    } catch { void 0; }
  }, [appTheme, chatColorTheme, prefs.fontSize]);

  useEffect(() => {
    if (!isOpen || !privacyPrefs.metadataMinimization) return;
    let cancelled = false;
    void readBatteryStatus().then((status) => {
      if (!cancelled) setBattery(status);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, privacyPrefs.metadataMinimization]);

  // Initialize localAnalytics consent from stored privacy prefs.
  useEffect(() => {
    localAnalytics.setAnalyticsConsent(privacyPrefs.analyticsConsent);
    localAnalytics.setCrashReportsConsent(privacyPrefs.crashReports);
  }, [privacyPrefs.analyticsConsent, privacyPrefs.crashReports]);

  useEffect(() => {
    if (!cacheMsg) return;
    const timer = setTimeout(() => setCacheMsg(null), 2000);
    return () => clearTimeout(timer);
  }, [cacheMsg]);

  useEffect(() => {
    if (!adPrefsMsg) return;
    const timer = setTimeout(() => setAdPrefsMsg(null), 2500);
    return () => clearTimeout(timer);
  }, [adPrefsMsg]);

  useEffect(() => {
    if (!crashMsg) return;
    const timer = setTimeout(() => setCrashMsg(null), 2500);
    return () => clearTimeout(timer);
  }, [crashMsg]);

  /** Approximate byte size of localStorage, grouped by category. */
  const computeStorageUsage = useCallback(() => {
    const categories: Record<string, number> = {};
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key);
        if (value === null) continue;
        const bytes = new Blob([key + value]).size;
        total += bytes;

        let category = 'other';
        if (key.startsWith('nova_backup_') || key.startsWith('nova_cloud_')) category = 'backup';
        else if (key.startsWith('nova_ads_')) category = 'ads';
        else if (key.startsWith('nova_local_analytics')) category = 'analytics';
        else if (key.startsWith('nova_account_') || key.startsWith('nova_pk_') || key.startsWith('nova_identity_')) category = 'identity';
        else if (key.startsWith('nova_created_groups') || key.startsWith('nova_created_group_') || key.startsWith('nova_messenger_chat_cache')) category = 'chats';
        else if (key.startsWith('nova_contact_')) category = 'contacts';
        else if (key.startsWith('nova_sticker_')) category = 'stickers';
        else if (key.startsWith('nova_premium_')) category = 'premium';
        else if (key.startsWith('nova_chat_theme') || key.startsWith('nova_wallpaper') || key === 'nova_messenger_settings' || key.startsWith('nova_messenger_settings')) category = 'settings';
        else if (key.startsWith('nova_notification_')) category = 'notifications';
        else if (key.startsWith('nova_onboarding_')) category = 'onboarding';
        else if (key.startsWith('nova_messenger_chat_')) category = 'messages';
        else category = 'other';

        categories[category] = (categories[category] || 0) + bytes;
      }
    } catch { void 0; }

    const result = Object.entries(categories)
      .map(([category, bytes]) => ({ category, bytes }))
      .sort((a, b) => b.bytes - a.bytes);

    setStorageUsage(result);
    setTotalStorageBytes(total);
    setStorageLoading(false);
  }, []);

  useEffect(() => {
    void computeStorageUsage();
  }, [computeStorageUsage]);

  // Google Drive backup handlers
  const handleGDriveConnect = useCallback(async () => {
    setGdriveLinking(true);
    setGdriveMsg(null);
    try {
      // In a real app, this would initiate OAuth flow
      await new Promise(resolve => setTimeout(resolve, 1000));
      setGdriveConnected(true);
      setGdriveMsg('Google Drive connected successfully');
    } catch (error) {
      setGdriveMsg('Failed to connect: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLinking(false);
    }
  }, []);

  const handleGDriveDisconnect = useCallback(async () => {
    setGdriveLoading(true);
    setGdriveMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setGdriveConnected(false);
      setGdriveBackups([]);
      setGdriveMsg('Google Drive disconnected');
    } catch (error) {
      setGdriveMsg('Failed to disconnect: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLoading(false);
    }
  }, []);

  const handleGDriveBackup = useCallback(async () => {
    if (!gdriveConnected) return;
    setGdriveLoading(true);
    setGdriveMsg(null);
    try {
      // In a real app, this would upload encrypted backup to Google Drive
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newBackup = {
        id: `backup_${Date.now()}`,
        name: `Nova Backup ${new Date().toLocaleDateString()}`,
        size: Math.floor(Math.random() * 5000000) + 1000000,
        createdAt: Date.now(),
      };
      setGdriveBackups(prev => [newBackup, ...prev]);
      setGdriveMsg('Backup uploaded successfully');
    } catch (error) {
      setGdriveMsg('Backup failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLoading(false);
    }
  }, [gdriveConnected]);

  const handleGDriveRefresh = useCallback(async () => {
    if (!gdriveConnected) return;
    setGdriveLoading(true);
    setGdriveMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      // In a real app, this would list backups from Google Drive
      setGdriveMsg('Backup list refreshed');
    } catch (error) {
      setGdriveMsg('Refresh failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLoading(false);
    }
  }, [gdriveConnected]);

  const handleGDriveRestore = useCallback(async (backupId: string) => {
    if (!gdriveConnected) return;
    setGdriveLoading(true);
    setGdriveMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setGdriveMsg('Backup restored successfully');
    } catch (error) {
      setGdriveMsg('Restore failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLoading(false);
    }
  }, [gdriveConnected]);

  const handleGDriveDelete = useCallback(async (backupId: string) => {
    if (!gdriveConnected) return;
    setGdriveLoading(true);
    setGdriveMsg(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setGdriveBackups(prev => prev.filter(b => b.id !== backupId));
      setGdriveMsg('Backup deleted');
    } catch (error) {
      setGdriveMsg('Delete failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGdriveLoading(false);
    }
  }, [gdriveConnected]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  const updatePrivacyPref = (metadataMinimization: boolean) => {
    const next = { ...privacyPrefs, metadataMinimization };
    setPrivacyPrefs(next);
    savePrivacyPrefs(next);
  };

  const updatePresencePref = (patch: Partial<PrivacyPrefs>) => {
    const next = { ...privacyPrefs, ...patch };
    setPrivacyPrefs(next);
    savePrivacyPrefs(next);
  };

  const addRelay = () => {
    const url = newRelayUrl.trim();
    const operator = newRelayOperator.trim() || undefined;
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      showToast('Relay URL must start with http:// or https://');
      return;
    }
    const id = 'relay_' + Math.random().toString(36).slice(2, 10);
    const next = [...privacyPrefs.relayEndpoints, { id, url, operator }];
    setPrivacyPrefs((prev) => ({ ...prev, relayEndpoints: next }));
    savePrivacyPrefs({ ...privacyPrefs, relayEndpoints: next });
    setNewRelayUrl('');
    setNewRelayOperator('');
  };

  const removeRelay = (id: string) => {
    const next = privacyPrefs.relayEndpoints.filter((r) => r.id !== id);
    setPrivacyPrefs((prev) => ({ ...prev, relayEndpoints: next }));
    savePrivacyPrefs({ ...privacyPrefs, relayEndpoints: next });
  };

  const addTurnServer = () => {
    const url = newTurnServerUrl.trim();
    const username = newTurnServerUsername.trim() || undefined;
    const password = newTurnServerPassword.trim() || undefined;
    if (!url) return;
    if (!/^turn(s)?:\/\//i.test(url)) {
      showToast(t('settings.turnServerInvalid'));
      return;
    }
    const server: RTCIceServer = { urls: url };
    if (username) server.username = username;
    if (password) server.credential = password;
    // Note: RTCIceServer doesn't have 'realm' property in TypeScript's lib.dom.d.ts
    // but some implementations support it. Using credential for password.
    // realm is not part of standard RTCIceServer type
    const next = [...privacyPrefs.turnServers, server];
    setPrivacyPrefs((prev) => ({ ...prev, turnServers: next }));
    savePrivacyPrefs({ ...privacyPrefs, turnServers: next });
    setNewTurnServerUrl('');
    setNewTurnServerUsername('');
    setNewTurnServerPassword('');
    setNewTurnServerRealm('');
    showToast(t('settings.turnServerSaved'));
  };

  const removeTurnServer = (index: number) => {
    const next = privacyPrefs.turnServers.filter((_, i) => i !== index);
    setPrivacyPrefs((prev) => ({ ...prev, turnServers: next }));
    savePrivacyPrefs({ ...privacyPrefs, turnServers: next });
    showToast(t('settings.turnServerRemoved'));
  };

  const toggleTor = () => {
    setPrivacyPrefs((prev) => {
      const next = { ...prev, torEnabled: !prev.torEnabled };
      savePrivacyPrefs(next);
      return next;
    });
  };

  const checkTor = async () => {
    if (!privacyPrefs.torEnabled) return;
    setTorStatus('checking');
    try {
      const result = await probeTor(privacyPrefs.torSocksPort);
      setTorStatus(result.ok ? 'connected' : 'error');
      showStatus(result.ok ? t('settings.torConnected') : t('settings.torNotConnected'));
    } catch {
      setTorStatus('error');
      showStatus(t('settings.torNotConnected'));
    }
  };

  const showStatus = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const coverTrafficActive = shouldEmitCoverTraffic(privacyPrefs, battery);

  const updatePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch { void 0; }
      return next;
    });
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('nova_messenger_chat_cache');
    } catch { void 0; }
    setCacheMsg(t('settings.cacheCleared'));
    // Recompute storage usage after clearing
    void computeStorageUsage();
  };

  const handleExportMyData = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const fileName = await downloadMyDataExport();
      setExportMsg(t('settings.exportDone', { fileName }));
    } catch {
      setExportMsg(t('settings.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportCrashReports = () => {
    const reports = localAnalytics.getCrashes();
    if (reports.length === 0) return;
    const payload = { generatedAt: new Date().toISOString(), reports };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-crash-reports-${new Date().toISOString().slice(0, 10)}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setCrashMsg(t('analytics.crashReportsExported'));
  };

  const handleClearCrashReports = () => {
    localAnalytics.clearCrashes();
    setCrashCount(0);
    setCrashMsg(t('analytics.crashReportsCleared'));
  };

  const handleResetAdPrefs = () => {
    clearLocalAdPrefs();
    setAdPrefs(loadAdPreferences());
    setAdPrefsMsg(t('settings.adsResetDone'));
  };

  const handleRestoreAd = (campaignId: string) => {
    restoreHiddenAd(campaignId);
    setAdPrefs(loadAdPreferences());
    setAdPrefsMsg(t('settings.adsPreferenceUpdated'));
  };

  const handleUnblockAdvertiser = (advertiserId: string) => {
    unblockAdvertiser(advertiserId);
    setAdPrefs(loadAdPreferences());
    setAdPrefsMsg(t('settings.adsPreferenceUpdated'));
  };

  const readableAdId = (id: string) => {
    const label = id.replace(/^(cmp|adv)_/, '').replace(/^demo_/, '').replace(/_/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const cloudTarget = () => ({
    url: cloudUrl.trim(),
    headers: cloudToken.trim() ? { Authorization: `Bearer ${cloudToken.trim()}` } : undefined,
  });

  const handleExportBackup = async () => {
    if (!identity) {
      setBackupMsg(t('settings.identityNotReady'));
      return;
    }
    if (exportPassphrase.trim().length < 8) {
      setBackupMsg(t('settings.passphraseTooShort'));
      return;
    }
    if (cloudUrl.trim() && !/^https?:\/\//i.test(cloudUrl.trim())) {
      setBackupMsg('Cloud URL must start with http:// or https://');
      return;
    }
    saveCloudUrl(cloudUrl.trim());
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const chatList = [] as Array<{ id: string; name: string; isEncrypted: boolean }>;
      const blob = await exportEncryptedBackup(exportPassphrase, chatList);
      if (cloudUrl.trim()) {
        await uploadEncryptedBackup(cloudTarget(), blob);
        setBackupMsg('Encrypted backup uploaded to cloud');
        setBackupModal(null);
        setExportPassphrase('');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova_backup_${new Date().toISOString().slice(0, 10)}.nova-backup`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking immediately can cancel the download before the browser reads it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupMsg('Backup exported');
      setBackupModal(null);
      setExportPassphrase('');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDownloadFromCloud = async () => {
    if (!cloudUrl.trim()) {
      setBackupMsg('Enter the cloud backup URL first');
      return;
    }
    if (!/^https?:\/\//i.test(cloudUrl.trim())) {
      setBackupMsg('Cloud URL must start with http:// or https://');
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      saveCloudUrl(cloudUrl.trim());
      const blob = await downloadEncryptedBackup(cloudTarget());
      setImportCloudBlob(blob);
      setImportFile(null);
      setBackupMsg(`Downloaded ${Math.max(1, Math.round(blob.size / 1024))} KB from cloud`);
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    const source = importFile ?? importCloudBlob;
    if (!source) {
      setBackupMsg('Choose a .nova-backup file');
      return;
    }
    if (importPassphrase.length < 8) {
      setBackupMsg(t('settings.passphraseTooShort'));
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const text = await source.text();
      if (!text.includes('NOVA_BACKUP')) {
        throw new Error('This is not a .nova-backup file');
      }
      await importEncryptedBackup(text, importPassphrase);
      setBackupMsg('Backup imported');
      setBackupModal(null);
      setImportFile(null);
      setImportCloudBlob(null);
      setImportPassphrase('');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const handle2FAToggle = async () => {
    if (is2FAEnabled) {
      await disable2FA();
      setShow2FASetup(false);
      setOtpInput('');
      setOtpMsg(null);
      return;
    }
    setShow2FASetup(true);
    setOtpMsg(null);
  };

  const handleActivate2FA = async () => {
    if (!totpSecret) {
      setOtpMsg('No TOTP secret available');
      return;
    }
    setOtpMsg(null);
    const ok = await enable2FA(totpSecret, otpInput);
    if (ok) {
      setShow2FASetup(false);
      setOtpInput('');
      setOtpMsg('2FA activated');
      setTimeout(() => setOtpMsg(null), 2000);
    } else {
      setOtpMsg('Invalid code');
    }
  };

  const handleTogglePin = async () => {
    setPinMsg(null);
    if (pinEnabled) {
      setIsRemovingPin(true);
      setIsCreatingPin(false);
      setPinInput('');
      return;
    }
    setIsCreatingPin(true);
    setIsRemovingPin(false);
    setPinInput('');
  };

  const verifyPinWithFeedback = async (value: string): Promise<boolean | null> => {
    try {
      return await verifyPin(value);
    } catch (error) {
      setPinMsg(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const handleConfirmPin = async () => {
    if (pinInput.length < pinLength) {
      setPinMsg(t('settings.passcodeTooShort'));
      return;
    }
    if (isRemovingPin) {
      const ok = await verifyPinWithFeedback(pinInput);
      if (ok === null) return;
      if (ok) {
        try {
          await removePin();
        } catch (error) {
          setPinMsg(error instanceof Error ? error.message : String(error));
          return;
        }
        setPinInput('');
        setIsRemovingPin(false);
        setPinMsg(t('settings.passcodeRemoved'));
        setTimeout(() => setPinMsg(null), 2000);
      } else {
        setPinMsg(t('settings.incorrectPasscode'));
        setPinInput('');
      }
      return;
    }
    if (!pinEnabled) {
      try {
        await setPin(pinInput);
      } catch (error) {
        setPinMsg(error instanceof Error ? error.message : String(error));
        return;
      }
      // Keep the stored length in sync with the PIN that was actually chosen;
      // otherwise a 6-digit PIN could never be typed again on a 4-digit profile.
      setPinLength(pinInput.length);
      setPinInput('');
      setIsCreatingPin(false);
      setPinMsg(t('settings.passcodeSet'));
      setTimeout(() => setPinMsg(null), 2000);
    } else {
      const ok = await verifyPinWithFeedback(pinInput);
      if (ok === null) return;
      if (ok) {
        setPinInput('');
        setPinMsg(t('settings.passcodeVerified'));
        setTimeout(() => setPinMsg(null), 2000);
      } else {
        setPinMsg(t('settings.incorrectPasscode'));
        setPinInput('');
      }
    }
  };

  const handleCancelPin = () => {
    setPinInput('');
    setPinMsg(null);
    setIsCreatingPin(false);
    setIsRemovingPin(false);
  };

  const handleToggleBiometric = async () => {
    if (biometricEnabled) {
      disableBiometric();
      setPinMsg(t('settings.biometricDisabled'));
      setTimeout(() => setPinMsg(null), 2200);
      return;
    }
    const enabled = await enableBiometric();
    setPinMsg(t(enabled ? 'settings.biometricEnabled' : 'settings.biometricUnavailable'));
    setTimeout(() => setPinMsg(null), 2600);
  };

  const eraseAllData = async () => {
    await clearLocalEncryptedData();
    // The PIN lives in the keychain after the F2.2 migration; drop both copies
    // so "erase all data" cannot leave a usable lock behind.
    const kc = createKeychain();
    await kc.remove('nova-dark-messenger', PIN_HASH_KEY).catch(() => undefined);
    await kc.remove('nova-dark-messenger', PIN_ENABLED_KEY).catch(() => undefined);
    try {
      localStorage.removeItem(PIN_HASH_KEY);
      localStorage.removeItem(PIN_ENABLED_KEY);
    } catch { void 0; }
    onClose();
  };

  const handleClearAllData = async () => {
    if (!clearDataConfirm) {
      setClearDataConfirm(true);
      setClearDataPin('');
      setPinMsg(null);
      return;
    }
    if (pinEnabled) {
      const ok = await verifyPinWithFeedback(clearDataPin);
      if (ok === null) return;
      if (!ok) {
        setPinMsg(t('settings.incorrectPasscode'));
        setClearDataPin('');
        return;
      }
    }
    await eraseAllData();
  };

  const handleShowSeedPhrase = () => {
    setSeedPhraseCopied(false);
    setShowSeedPhraseModal(true);
  };

  const handleCopySeedPhrase = async () => {
    const phrase = identity?.mnemonic ?? '';
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setSeedPhraseCopied(true);
      setTimeout(() => setSeedPhraseCopied(false), 2000);
    } catch { void 0; }
  };

  const fontSizeOptions: { value: Prefs['fontSize']; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ];

  const fabSideOptions: { value: FabSide; label: string }[] = [
    { value: 'right', label: t('settings.fabHandRight', { defaultValue: 'Right hand' }) },
    { value: 'left', label: t('settings.fabHandLeft', { defaultValue: 'Left hand' }) },
  ];
  const updateFabSide = (side: FabSide) => {
    setFabSideState(side);
    saveFabSide(side);
  };

  // ---- New tabbed settings helpers ----

  // Privacy preset derivation
  const derivePrivacyPreset = (prefs: PrivacyPrefs, social: SocialPrivacySettings): 'basic' | 'enhanced' | 'maximum' | 'custom' => {
    const isBasic = !prefs.metadataMinimization && !prefs.presenceSharing && prefs.webrtcRelayOnly === false &&
      social.lastSeen === 'contacts' && social.profilePhoto === 'contacts' && social.calls === 'contacts' &&
      social.groupsAndChannels === 'contacts' && social.phoneNumber === 'nobody' &&
      !prefs.torEnabled && prefs.relayEndpoints.length === 0 && prefs.turnServers.length === 0;
    const isEnhanced = prefs.metadataMinimization && prefs.presenceSharing === false && prefs.webrtcRelayOnly === true &&
      social.lastSeen === 'contacts' && social.profilePhoto === 'contacts' && social.calls === 'contacts' &&
      social.groupsAndChannels === 'contacts' && social.phoneNumber === 'nobody' &&
      !prefs.torEnabled && prefs.relayEndpoints.length > 0;
    const isMaximum = prefs.metadataMinimization && prefs.presenceSharing === false && prefs.webrtcRelayOnly === true &&
      social.lastSeen === 'nobody' && social.profilePhoto === 'nobody' && social.calls === 'nobody' &&
      social.groupsAndChannels === 'contacts' && social.phoneNumber === 'nobody' &&
      prefs.torEnabled && prefs.relayEndpoints.length > 0 && prefs.turnServers.length > 0;
    if (isBasic) return 'basic';
    if (isEnhanced) return 'enhanced';
    if (isMaximum) return 'maximum';
    return 'custom';
  };

  const applyPrivacyPreset = (name: 'basic' | 'enhanced' | 'maximum') => {
    if (name === 'basic') {
      const nextPrefs = { ...privacyPrefs, metadataMinimization: false, webrtcRelayOnly: false, torEnabled: false, relayEndpoints: [], turnServers: [] };
      setPrivacyPrefs(nextPrefs);
      savePrivacyPrefs(nextPrefs);
      const nextSocial = { lastSeen: 'contacts' as PrivacyScope, profilePhoto: 'contacts' as PrivacyScope, calls: 'contacts' as PrivacyScope, groupsAndChannels: 'contacts' as PrivacyScope, phoneNumber: 'nobody' as PrivacyScope, phoneAccess: [] as string[], blockedUsers: [] as string[], exceptions: {} as Record<string, PrivacyScope> };
      setSocialPrivacyState(nextSocial);
      setSocialPrivacy('lastSeen', 'contacts');
      setSocialPrivacy('profilePhoto', 'contacts');
      setSocialPrivacy('calls', 'contacts');
      setSocialPrivacy('groupsAndChannels', 'contacts');
      setSocialPrivacy('phoneNumber', 'nobody');
      setSocialPrivacy('phoneAccess', []);
    } else if (name === 'enhanced') {
      const nextPrefs = { ...privacyPrefs, metadataMinimization: true, webrtcRelayOnly: true, torEnabled: false, relayEndpoints: [{ id: 'relay_default', url: 'https://relay.example.com', operator: 'Example' }], turnServers: [] };
      setPrivacyPrefs(nextPrefs);
      savePrivacyPrefs(nextPrefs);
      const nextSocial = { lastSeen: 'contacts' as PrivacyScope, profilePhoto: 'contacts' as PrivacyScope, calls: 'contacts' as PrivacyScope, groupsAndChannels: 'contacts' as PrivacyScope, phoneNumber: 'nobody' as PrivacyScope, phoneAccess: [] as string[], blockedUsers: [] as string[], exceptions: {} as Record<string, PrivacyScope> };
      setSocialPrivacyState(nextSocial);
      setSocialPrivacy('lastSeen', 'contacts');
      setSocialPrivacy('profilePhoto', 'contacts');
      setSocialPrivacy('calls', 'contacts');
      setSocialPrivacy('groupsAndChannels', 'contacts');
      setSocialPrivacy('phoneNumber', 'nobody');
      setSocialPrivacy('phoneAccess', []);
    } else if (name === 'maximum') {
      const nextPrefs = { ...privacyPrefs, metadataMinimization: true, webrtcRelayOnly: true, torEnabled: true, relayEndpoints: [{ id: 'relay_default', url: 'https://relay.example.com', operator: 'Example' }], turnServers: [{ urls: 'turn:relay.example.com' }] };
      setPrivacyPrefs(nextPrefs);
      savePrivacyPrefs(nextPrefs);
      const nextSocial = { lastSeen: 'nobody' as PrivacyScope, profilePhoto: 'nobody' as PrivacyScope, calls: 'nobody' as PrivacyScope, groupsAndChannels: 'contacts' as PrivacyScope, phoneNumber: 'nobody' as PrivacyScope, phoneAccess: [] as string[], blockedUsers: [] as string[], exceptions: {} as Record<string, PrivacyScope> };
      setSocialPrivacyState(nextSocial);
      setSocialPrivacy('lastSeen', 'nobody');
      setSocialPrivacy('profilePhoto', 'nobody');
      setSocialPrivacy('calls', 'nobody');
      setSocialPrivacy('groupsAndChannels', 'contacts');
      setSocialPrivacy('phoneNumber', 'nobody');
      setSocialPrivacy('phoneAccess', []);
    }
    setPrivacyPresetSheetOpen(false);
    showToast(t('settings.presetApplied', { name: t(`settings.preset${name.charAt(0).toUpperCase() + name.slice(1)}`) }));
  };

  // Notification helpers
  const setAllNotificationLevels = (level: NotificationLevel) => {
    setNotificationPref('privateChats', level);
    setNotificationPref('groups', level);
    setNotificationPref('channels', level);
    setNotificationPref('bots', level);
    setNotificationPrefsState(getNotificationPrefs());
    showToast(t('settings.notificationsApplyAll', { level: t(`settings.notifications${level.charAt(0).toUpperCase() + level.slice(1)}`) }));
  };

  const cycleNotificationLevel = (current: NotificationLevel): NotificationLevel => {
    if (current === 'all') return 'mentions';
    if (current === 'mentions') return 'none';
    return 'all';
  };

  const cycleSoundMode = () => {
    // Determine current mode: sound, vibration, or silent
    let current: 'sound' | 'vibration' | 'silent';
    if (prefs.notificationSound && !prefs.vibration) current = 'sound';
    else if (!prefs.notificationSound && prefs.vibration) current = 'vibration';
    else current = 'silent'; // both false or both true (silent)

    if (current === 'silent') {
      updatePref('notificationSound', true);
      updatePref('vibration', false);
    } else if (current === 'sound') {
      updatePref('notificationSound', false);
      updatePref('vibration', true);
    } else {
      updatePref('notificationSound', false);
      updatePref('vibration', false);
    }
  };

  const getSoundModeLabel = () => {
    if (!prefs.notificationSound && !prefs.vibration) return t('settings.soundModeSilent');
    if (!prefs.notificationSound && prefs.vibration) return t('settings.soundModeVibration');
    return t('settings.soundModeSound');
  };

  const cycleTheme = () => {
    if (appTheme === 'light') setAppTheme('dark');
    else if (appTheme === 'dark') setAppTheme('system');
    else setAppTheme('light');
  };

  const cycleFontSize = () => {
    if (prefs.fontSize === 'small') updatePref('fontSize', 'medium');
    else if (prefs.fontSize === 'medium') updatePref('fontSize', 'large');
    else updatePref('fontSize', 'small');
  };

  const cycleFabSide = () => {
    updateFabSide(fabSide === 'right' ? 'left' : 'right');
  };

  // Push notification handler
  const handlePushToggle = async () => {
    const { registerForPush, unregisterFromPush, getPushToken } = await import('../lib/notifications/push');
    if (prefs.pushEnabled) {
      // Currently enabled, disable it
      await unregisterFromPush();
      updatePref('pushEnabled', false);
      setPushMsg(t('settings.pushDisabled'));
    } else {
      // Currently disabled, enable it
      updatePref('pushEnabled', true);
      try {
        const token = await registerForPush();
        if (token) {
          setPushMsg(t('settings.pushRegistered', { token: token.slice(0, 8) + '…' }));
        } else {
          setPushMsg(t('settings.pushPermissionDenied'));
          updatePref('pushEnabled', false); // Revert if permission denied
        }
      } catch {
        setPushMsg(t('settings.pushError'));
        updatePref('pushEnabled', false);
      }
    }
    setTimeout(() => setPushMsg(null), 3000);
  };

  // Handle melody selection
  const selectMelody = (id: SoundId) => {
    saveSoundId(id);
    setSoundId(id);
    if (id !== 'silent') playSound('notification', id);
    setMelodySheetOpen(false);
  };

  // Muted/Priority contacts - just show counts, tap opens existing screens
  const openMutedContacts = () => {
    showToast(t('settings.mutedContactsCount', { count: getMutedContacts().length }));
  };
  const openPriorityContacts = () => {
    showToast(t('settings.priorityContactsCount', { count: getPriorityContacts().length }));
  };

  // Analytics counts
  const analyticsCounts = localAnalytics.getEventCountsByType();
  const analyticsMessageCount =
    (analyticsCounts.message_send ?? 0) +
    (analyticsCounts.message_receive ?? 0) +
    (analyticsCounts.voice_message_send ?? 0) +
    (analyticsCounts.voice_message_receive ?? 0);
  const analyticsActiveChats = Object.keys(localAnalytics.getMessagesByChat()).length;

  // Privacy preset for header chip
  const currentPrivacyPreset = derivePrivacyPreset(privacyPrefs, socialPrivacy);

  // Header premium chip content
  const premiumChipLabel = premium
    ? t('settings.premiumActive')
    : freeDaysRemaining() > 0
    ? t('settings.premiumFreeTrialShort', { days: freeDaysRemaining() })
    : t('settings.premiumUpgrade');

  // Tab config
  const tabs = [
    { key: 'general' as const, label: t('settings.tabGeneral'), icon: <SlidersHorizontal className="w-4 h-4" /> },
    { key: 'notifications' as const, label: t('settings.tabNotifications'), icon: <Bell className="w-4 h-4" /> },
    { key: 'privacy' as const, label: t('settings.tabPrivacy'), icon: <Shield className="w-4 h-4" /> },
    { key: 'advanced' as const, label: t('settings.tabAdvanced'), icon: <LayoutGrid className="w-4 h-4" /> },
    { key: 'data' as const, label: t('settings.tabData'), icon: <Database className="w-4 h-4" /> },
    { key: 'about' as const, label: t('settings.tabAbout'), icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 pt-[max(0.75rem,var(--nova-safe-top))] pb-[max(0.75rem,var(--nova-safe-bottom))] animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md text-[var(--nova-text-primary)] shadow-2xl max-h-[calc(100dvh-2rem-var(--nova-safe-top)-var(--nova-safe-bottom))] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
      >
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-[var(--nova-border-subtle)] px-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
              <Palette className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="settings-title" className="font-bold text-sm text-[var(--nova-text-primary)] leading-tight truncate">{t('settings.title')}</h3>
              <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('app.name')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Premium chip */}
            <button
              type="button"
              onClick={() => setPremiumSheetOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[10px] font-medium transition hover:bg-[var(--nova-accent-color)]/25 hover:border-[var(--nova-accent-color)]/50 cursor-pointer active:scale-[0.98]"
              aria-label={t('settings.premiumChipAria', { status: premiumChipLabel })}
            >
              <Crown className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{premiumChipLabel}</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <SettingsTabs
          tabs={tabs}
          active={activeTab}
          onChange={(key) => setActiveTab(key as any)}
          className="border-b border-[var(--nova-border-subtle)] shrink-0"
        />

        {/* Tab Panels - Fixed height, scroll inside */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <GeneralTab />
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <NotificationsTab />
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <PrivacyTab />
            </div>
          )}

          {/* Advanced Tab (replaces Security + More) */}
          {activeTab === 'advanced' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <AdvancedTab
                onOpenAnalytics={onOpenAnalytics}
                onOpenSites={onOpenSites}
                onOpenMeshMap={onOpenMeshMap}
              />
            </div>
          )}

          {/* About Tab */}
          {activeTab === 'about' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <AboutTab />
            </div>
          )}
                {!secureStorage && (
                  <div role="alert" className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                    <div className="font-semibold">{t('settings.secureStorageUnavailable')}</div>
                    <div className="mt-0.5 text-amber-200/80">{t('settings.secureStorageUnavailableHint')}</div>
                  </div>
                )}
                {!dbAvailable && (
                  <div role="alert" className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                    {t('settings.encryptedStorageUnavailable')}
                  </div>
                )}

                {/* Lock & Auth - 2 column grid */}
                <div className="grid grid-cols-2 gap-2 overflow-x-auto no-scrollbar min-w-0" role="group" aria-label={t('settings.lockAuth')}>
                  <IconToggle
                    icon={<Lock className="w-5 h-5" />}
                    label={t('settings.passcodeLock')}
                    checked={pinEnabled}
                    onChange={() => { void handleTogglePin(); setPinSheetOpen(true); }}
                    ariaLabel={t('settings.passcodeLockAria', { value: pinEnabled ? t('common.on') : t('common.off') })}
                    testId="settings-pin-toggle"
                  />

                  <IconToggle
                    icon={<Fingerprint className="w-5 h-5" />}
                    label={t('settings.biometricUnlock', { defaultValue: 'Fingerprint/Face unlock' })}
                    checked={biometricEnabled}
                    disabled={!biometricSupported || !pinEnabled}
                    onChange={() => { if (pinEnabled) handleToggleBiometric(); }}
                    ariaLabel={t('settings.biometricUnlockAria', { value: biometricEnabled ? t('common.on') : t('common.off') })}
                    badge={!pinEnabled && biometricSupported && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    testId="settings-biometric-toggle"
                  />
                </div>
                {!pinEnabled && biometricSupported && (
                  <p className="text-[11px] text-amber-400/80 pl-2">{t('settings.biometricNeedsPin')}</p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 overflow-x-auto no-scrollbar min-w-0" role="group" aria-label={t('settings.auth')}>
                  <IconToggle
                    icon={<ShieldCheck className="w-5 h-5" />}
                    label={t('settings.twoFactorAuth')}
                    checked={is2FAEnabled}
                    onChange={() => setTwoFactorSheetOpen(true)}
                    ariaLabel={t('settings.twoFactorAuthAria', { value: is2FAEnabled ? t('common.on') : t('common.off') })}
                    testId="settings-2fa-toggle"
                  />
                  <IconCycleButton
                    icon={<KeyRound className="w-5 h-5" />}
                    label={t('settings.showSeedPhrase')}
                    onClick={() => setRecoveryGateOpen(true)}
                    disabled={!identity}
                    testId="settings-recovery-tile"
                  />
                </div>

                {/* Accounts - full width navigation tile */}
                <div className="pt-2">
                  <SettingsTile
                    icon={<Users className="w-5 h-5" />}
                    label={t('settings.accounts.manage')}
                    badge={<span className="px-2 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] text-[11px] font-medium text-[var(--nova-text-secondary)]">{t('settings.accountsCount')}</span>}
                    onClick={() => setAccountSwitcherOpen(true)}
                    testId="settings-accounts-tile"
                  />
                </div>
              {activeTab === 'data' && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-4">
              <DataTab />
            </div>
          )}

        </div>

        {/* Sheets / Sub-screens */}
        {/* Language Sheet */}
        <SettingsSheet
          open={languageSheetOpen}
          onClose={() => setLanguageSheetOpen(false)}
          title={t('settings.language')}
          testId="settings-language-sheet"
        >
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[
              { code: 'en', flag: '🇺🇸', name: 'English', native: 'English' },
              { code: 'ru', flag: '🇷🇺', name: 'Russian', native: 'Русский' },
              { code: 'uk', flag: '🇺🇦', name: 'Ukrainian', native: 'Українська' },
            ].map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => { changeLanguage(lang.code as any); setLanguageSheetOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/10 border border-[var(--nova-border-subtle)] text-left transition cursor-pointer"
              >
                <span className="text-2xl">{lang.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--nova-text-primary)] truncate">{lang.name}</p>
                  <p className="text-[11px] text-[var(--nova-text-muted)] truncate">{lang.native}</p>
                </div>
                {language === lang.code && <Check className="w-5 h-5 text-[var(--nova-accent-color)] shrink-0" />}
              </button>
            ))}
          </div>
        </SettingsSheet>

        {/* Melody Sheet */}
        <SettingsSheet
          open={melodySheetOpen}
          onClose={() => setMelodySheetOpen(false)}
          title={t('settings.melody')}
          description={t('settings.melodyHint')}
          testId="settings-melody-sheet"
        >
          <div className="space-y-2">
            {SOUND_IDS.filter(id => id !== 'silent').map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => selectMelody(id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border transition cursor-pointer ${soundId === id ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/40' : 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] hover:bg-[var(--nova-overlay-weak)]'}`}
              >
                <span className="text-[13px] text-[var(--nova-text-primary)]">{SOUNDS[id].label}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); playSound('notification', id); }}
                  className="p-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 text-[var(--nova-text-secondary)] hover:text-[var(--nova-accent-color)] transition"
                  aria-label={t('settings.previewSound', { name: SOUNDS[id].label })}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </button>
            ))}
          </div>
        </SettingsSheet>

        {/* Premium Sheet */}
        <SettingsSheet
          open={premiumSheetOpen}
          onClose={() => setPremiumSheetOpen(false)}
          title={t('settings.premium')}
          testId="settings-premium-sheet"
        >
          <div className="space-y-4">
            <div className="text-center py-2">
              <Crown className="w-12 h-12 mx-auto text-[var(--nova-accent-color)]" />
              <h4 className="mt-2 text-lg font-bold text-[var(--nova-text-primary)]">{premium ? t('settings.premiumActive') : t('settings.premiumTitle')}</h4>
              <p className="mt-1 text-[13px] text-[var(--nova-text-secondary)]">{premium ? t('settings.premiumActiveDesc') : t('settings.premiumDesc')}</p>
              {freeDaysRemaining() > 0 && !premium && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-xs font-medium">
                  <Clock className="w-3 h-3" />
                  <span>{t('settings.premiumFreeTrial', { days: freeDaysRemaining() })}</span>
                </div>
              )}
            </div>
            <button
              onClick={async () => { const r = await checkout(); if (!r.ok && r.error) alert(r.error); }}
              disabled={loading || premium}
              className="w-full py-3 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-md text-base font-medium disabled:opacity-50"
            >
              {loading ? <span className="animate-pulse">Loading...</span> : premium ? (
                <> <Check className="w-5 h-5" /> <span>{t('settings.premiumActive')}</span> </>
              ) : (
                <> <Sparkles className="w-5 h-5" /> <span>{t('settings.premiumUpgrade')} • {minSubscriptionCost / 100} {t('settings.premiumCurrency')}</span> </>
              )}
            </button>
            <button onClick={() => { setPremiumSheetOpen(false); setCryptoModalOpen(true); }} disabled={premium} className="w-full py-2.5 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
              <DollarSign className="w-4 h-4" /> {t('premium.cryptoTitle')}
            </button>
          </div>
        </SettingsSheet>

        {/* Privacy Preset Sheet */}
        <SettingsSheet
          open={privacyPresetSheetOpen}
          onClose={() => setPrivacyPresetSheetOpen(false)}
          title={t('settings.privacyPreset')}
          description={t('settings.privacyPresetDesc')}
          testId="settings-privacy-preset-sheet"
        >
          <div className="space-y-2">
            {['basic', 'enhanced', 'maximum'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPrivacyPreset(p as 'basic' | 'enhanced' | 'maximum')}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition cursor-pointer ${currentPrivacyPreset === p ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/40' : 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] hover:bg-[var(--nova-overlay-weak)]'}`}
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                  {p === 'basic' ? <Shield className="w-5 h-5" /> : p === 'enhanced' ? <ShieldHalf className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--nova-text-primary)] truncate">{t(`settings.preset${p.charAt(0).toUpperCase() + p.slice(1)}`)}</p>
                  <p className="text-[11px] text-[var(--nova-text-muted)] truncate">{t(`settings.preset${p.charAt(0).toUpperCase() + p.slice(1)}Desc`)}</p>
                </div>
                {currentPrivacyPreset === p && <Check className="w-5 h-5 text-[var(--nova-accent-color)] shrink-0" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPrivacyPresetSheetOpen(false); showToast(t('settings.presetCustomInfo')); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] flex items-center justify-center text-[var(--nova-text-muted)] shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--nova-text-primary)] truncate">{t('settings.presetCustom')}</p>
                <p className="text-[11px] text-[var(--nova-text-muted)] truncate">{t('settings.presetCustomDesc')}</p>
              </div>
              {currentPrivacyPreset === 'custom' && <Check className="w-5 h-5 text-[var(--nova-accent-color)] shrink-0" />}
            </button>
          </div>
        </SettingsSheet>

        {/* Relays Sheet */}
        <SettingsSheet
          open={relaysSheetOpen}
          onClose={() => setRelaysSheetOpen(false)}
          title={t('settings.relays')}
          description={t('settings.relayScreenDesc')}
          testId="settings-relays-sheet"
        >
          <div className="space-y-3">
            {privacyPrefs.relayEndpoints.length === 0 ? (
              <p className="text-[13px] text-[var(--nova-text-muted)] text-center py-8">{t('settings.noRelays')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {privacyPrefs.relayEndpoints.map((relay) => (
                  <div key={relay.id} className="flex items-center gap-2 px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--nova-text-primary)] truncate">{relay.url}</p>
                      {relay.operator && <p className="text-[11px] text-[var(--nova-text-muted)] truncate">{relay.operator}</p>}
                    </div>
                    <button type="button" onClick={() => removeRelay(relay.id)} className="p-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-red-500/20 text-[var(--nova-text-muted)] hover:text-red-400 transition" aria-label={t('settings.removeRelay')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-[var(--nova-border-subtle)] space-y-2">
              <input type="url" placeholder={t('settings.relayUrl')} value={newRelayUrl} onChange={(e) => setNewRelayUrl(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
              <input type="text" placeholder={t('settings.relayOperator')} value={newRelayOperator} onChange={(e) => setNewRelayOperator(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
              <button type="button" onClick={addRelay} disabled={!newRelayUrl.trim()} className="w-full py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[12px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{t('settings.addRelay')}</button>
            </div>
          </div>
        </SettingsSheet>

        {/* TURN Sheet */}
        <SettingsSheet
          open={turnSheetOpen}
          onClose={() => setTurnSheetOpen(false)}
          title={t('settings.turnServers')}
          description={t('settings.turnScreenDesc')}
          testId="settings-turn-sheet"
        >
          <div className="space-y-3">
            {privacyPrefs.turnServers.length === 0 ? (
              <p className="text-[13px] text-[var(--nova-text-muted)] text-center py-8">{t('settings.turnServersEmpty')}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {privacyPrefs.turnServers.map((server, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--nova-text-primary)] truncate">{typeof server.urls === 'string' ? server.urls : Array.isArray(server.urls) ? server.urls.join(', ') : 'TURN'}</p>
                      {server.username && <p className="text-[11px] text-[var(--nova-text-muted)] truncate">{server.username}</p>}
                    </div>
                    <button type="button" onClick={() => removeTurnServer(idx)} className="p-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-red-500/20 text-[var(--nova-text-muted)] hover:text-red-400 transition" aria-label={t('settings.removeTurnServer')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <InfoHint label={t('settings.turnWarning')} className="text-amber-400/80" />
            <div className="pt-2 border-t border-[var(--nova-border-subtle)] space-y-2">
              <input type="text" placeholder={t('settings.turnServerUrlPlaceholder')} value={newTurnServerUrl} onChange={(e) => setNewTurnServerUrl(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
              <input type="text" placeholder={t('settings.turnUsernameLabel')} value={newTurnServerUsername} onChange={(e) => setNewTurnServerUsername(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
              <input type="password" placeholder={t('settings.turnPasswordLabel')} value={newTurnServerPassword} onChange={(e) => setNewTurnServerPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
              <button type="button" onClick={addTurnServer} disabled={!newTurnServerUrl.trim()} className="w-full py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[12px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{t('settings.addTurnServerBtn')}</button>
            </div>
          </div>
        </SettingsSheet>

        {/* Tor Sheet */}
        <SettingsSheet
          open={torSheetOpen}
          onClose={() => setTorSheetOpen(false)}
          title={t('settings.torMode')}
          description={t('settings.torDetails')}
          testId="settings-tor-sheet"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                {privacyPrefs.torEnabled ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[var(--nova-text-primary)]">{t('settings.torMode')}</p>
                <p className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.torModeHint')}</p>
              </div>
              <IconToggle
                icon={<Monitor className="w-5 h-5" />}
                label=""
                checked={privacyPrefs.torEnabled}
                onChange={() => toggleTor()}
              />
            </div>
            {privacyPrefs.torEnabled && (
              <div className="space-y-3 pt-2 border-t border-[var(--nova-border-subtle)]">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--nova-text-secondary)] w-24">{t('settings.torSocksPort')}</span>
                  <input type="number" min="1" max="65535" value={privacyPrefs.torSocksPort} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 65535) { setPrivacyPrefs((prev) => { const next = { ...prev, torSocksPort: v }; savePrivacyPrefs(next); return next; }); } }} className="flex-1 px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" />
                </div>
                <button type="button" onClick={checkTor} disabled={torStatus === 'checking'} className="w-full py-2 rounded-xl border text-[12px] font-medium transition ${torStatus === 'checking' ? 'border-[#8c919d]/40 text-[var(--nova-text-muted)] cursor-wait bg-[var(--nova-overlay-weak)]' : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)]'}">
                  {torStatus === 'checking' ? t('settings.torCheck') + '…' : t('settings.torCheck')}
                </button>
                <p className="text-center text-[12px] font-medium ${torStatus === 'connected' ? 'text-emerald-400' : torStatus === 'error' ? 'text-red-400' : 'text-[var(--nova-text-muted)]'}">
                  {torStatus === 'connected' ? t('settings.torConnected') : torStatus === 'error' ? t('settings.torNotConnected') : '—'}
                </p>
              </div>
            )}
          </div>
        </SettingsSheet>

        {/* Presence Sheet */}
        <SettingsSheet
          open={presenceSheetOpen}
          onClose={() => setPresenceSheetOpen(false)}
          title={t('settings.presenceSharing')}
          description={t('settings.presenceDetails')}
          testId="settings-presence-sheet"
        >
          <div className="space-y-3">
            <IconToggle
              icon={<Hash className="w-5 h-5" />}
              label={t('settings.presenceHashing')}
              checked={privacyPrefs.presenceHashing}
              onChange={(v) => updatePresencePref({ presenceHashing: v })}
            />
            <div>
              <p className="text-[12px] font-medium text-[var(--nova-text-secondary)] mb-2">{t('settings.presenceTtl')}</p>
              <div className="flex gap-2">
                {(['short', 'normal', 'long'] as const).map((ttl) => (
                  <button key={ttl} type="button" onClick={() => updatePresencePref({ presenceTtl: ttl })} className={`flex-1 py-2 rounded-xl border text-[11px] font-medium transition cursor-pointer active:scale-[0.98] ${privacyPrefs.presenceTtl === ttl ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-[var(--nova-text-primary)]' : 'border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'}`}>
                    {t(`settings.presenceTtl_${ttl}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsSheet>

        {/* Analytics Sheet */}
        <SettingsSheet
          open={analyticsSheetOpen}
          onClose={() => setAnalyticsSheetOpen(false)}
          title={t('settings.analytics')}
          description={t('settings.analyticsDiagnostics')}
          testId="settings-analytics-sheet"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-center overflow-x-auto no-scrollbar min-w-0">
              <div className="p-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)]">
                <p className="text-2xl font-bold text-[var(--nova-text-primary)]">{analyticsMessageCount}</p>
                <p className="text-[11px] text-[var(--nova-text-muted)]">{t('analytics.totalMessages')}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)]">
                <p className="text-2xl font-bold text-[var(--nova-text-primary)]">{analyticsActiveChats}</p>
                <p className="text-[11px] text-[var(--nova-text-muted)]">{t('analytics.activeChats')}</p>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--nova-border-subtle)]">
              <IconToggle
                icon={<BarChart3 className="w-5 h-5" />}
                label={t('analytics.consent')}
                checked={privacyPrefs.analyticsConsent}
                onChange={(v) => { const next = v; setPrivacyPrefs((prev) => { const p = { ...prev, analyticsConsent: next }; savePrivacyPrefs(p); return p; }); localAnalytics.setAnalyticsConsent(next); }}
              />
              <IconToggle
                icon={<AlertTriangle className="w-5 h-5" />}
                label={t('analytics.crashReports')}
                checked={privacyPrefs.crashReports}
                onChange={(v) => { const next = v; setPrivacyPrefs((prev) => { const p = { ...prev, crashReports: next }; savePrivacyPrefs(p); return p; }); localAnalytics.setCrashReportsConsent(next); setCrashCount(localAnalytics.getCrashes().length); }}
              />
              {privacyPrefs.crashReports && (
                <div className="space-y-2 pl-10">
                  <p className="text-[11px] text-[var(--nova-text-secondary)]">{t('analytics.crashReportsCount', { count: crashCount })}</p>
                  <div className="flex gap-2">
                    <button onClick={handleExportCrashReports} disabled={crashCount === 0} className="flex-1 py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition disabled:opacity-40">{t('analytics.exportCrashReports')}</button>
                    <button onClick={handleClearCrashReports} disabled={crashCount === 0} className="flex-1 py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition disabled:opacity-40">{t('analytics.clearCrashReports')}</button>
                  </div>
                </div>
              )}
            </div>
            <button type="button" data-testid="open-analytics" onClick={() => { setAnalyticsSheetOpen(false); onClose(); onOpenAnalytics?.(); }} className="w-full py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[12px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95">{t('analytics.openFullAnalytics')}</button>
          </div>
        </SettingsSheet>

        {/* Ads Sheet */}
        <SettingsSheet
          open={adsSheetOpen}
          onClose={() => setAdsSheetOpen(false)}
          title={t('settings.advertising')}
          testId="settings-ads-sheet"
        >
          <div className="space-y-4" data-testid="ad-preferences">
            <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">{t('settings.adsPrivacyHint')}</p>
            {canUse('ads_free') && <p className="flex items-start gap-1.5 rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 px-2 py-1.5 text-[11px] font-medium text-[var(--nova-text-secondary)]" data-testid="ads-premium-off"><Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--nova-accent-color)]" /><span>{t('settings.adsPremiumOff')}</span></p>}
            <div className="grid grid-cols-2 gap-2 overflow-x-auto no-scrollbar min-w-0">
              <div className="rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] p-2"><span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.adsHidden')}</span><span className="mt-0.5 block text-sm font-bold text-[var(--nova-text-primary)]" data-testid="ad-prefs-hidden">{adPrefs.hiddenAds.length}</span></div>
              <div className="rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] p-2"><span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.adsBlocked')}</span><span className="mt-0.5 block text-sm font-bold text-[var(--nova-text-primary)]" data-testid="ad-prefs-blocked">{adPrefs.blockedAdvertisers.length}</span></div>
            </div>
            {adPrefs.hiddenAds.length > 0 && <div className="space-y-1 max-h-48 overflow-y-auto">{adPrefs.hiddenAds.map((id) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-1"><span className="truncate text-[10.5px] text-[var(--nova-text-secondary)]" title={id}>{readableAdId(id)}</span><button type="button" onClick={() => handleRestoreAd(id)} className="inline-flex shrink-0 items-center gap-1 rounded-2xl px-1.5 py-0.5 text-[10px] font-medium text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] active:bg-[var(--nova-overlay-medium)]"><RotateCcw className="h-2.5 w-2.5" />{t('settings.adsRestore')}</button></div>)}</div>}
            {adPrefs.blockedAdvertisers.length > 0 && <div className="space-y-1 max-h-48 overflow-y-auto">{adPrefs.blockedAdvertisers.map((id) => <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-1"><span className="truncate text-[10.5px] text-[var(--nova-text-secondary)]" title={id}>{readableAdId(id)}</span><button type="button" onClick={() => handleUnblockAdvertiser(id)} className="inline-flex shrink-0 items-center gap-1 rounded-2xl px-1.5 py-0.5 text-[10px] font-medium text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] active:bg-[var(--nova-overlay-medium)]"><Ban className="h-2.5 w-2.5" />{t('settings.adsUnblock')}</button></div>)}</div>}
            <button type="button" onClick={handleResetAdPrefs} disabled={adPrefs.hiddenAds.length === 0 && adPrefs.blockedAdvertisers.length === 0} className="w-full py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer disabled:opacity-35">{t('settings.adsReset')}</button>
            {adPrefsMsg && <p className="text-[11px] text-[var(--nova-accent-color)]" role="status">{adPrefsMsg}</p>}
          </div>
        </SettingsSheet>

        {/* Google Drive Sheet */}
        <SettingsSheet
          open={driveSheetOpen}
          onClose={() => setDriveSheetOpen(false)}
          title={t('settings.googleDrive')}
          testId="settings-gdrive-sheet"
        >
          <div className="space-y-4">
            {!gdriveConnected ? (
              <button onClick={handleGDriveConnect} disabled={gdriveLinking} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer disabled:opacity-50"><HardDrive className="w-5 h-5" /><span>{gdriveLinking ? t('settings.gdriveConnecting') : t('settings.gdriveConnect')}</span></button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)]"><div className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-[var(--nova-accent-color)]" /><span className="text-[12px] font-medium text-[var(--nova-text-secondary)]">{t('settings.gdriveConnected')}</span><span className="w-2 h-2 rounded-full bg-green-400" /></div><button onClick={handleGDriveDisconnect} disabled={gdriveLoading} className="text-[12px] text-red-400 hover:text-red-300 disabled:opacity-50">{t('settings.gdriveDisconnect')}</button></div>
                <div className="space-y-3">
                  <div><label className="block text-[11px] font-medium text-[var(--nova-text-secondary)] mb-1">{t('settings.gdrivePassphrase')}</label><input type="password" value={exportPassphrase} onChange={(e) => setExportPassphrase(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" placeholder="••••••••" /></div>
                  <div className="flex gap-2"><button onClick={handleGDriveBackup} disabled={backupBusy || exportPassphrase.trim().length < 8} className="flex-1 py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[12px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50"><Upload className="w-4 h-4" />{t('settings.gdriveBackupNow')}</button><button onClick={handleGDriveRefresh} disabled={gdriveLoading} aria-label={t('settings.gdriveRefresh')} title={t('settings.gdriveRefresh')} className="px-4 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition active:scale-95 disabled:opacity-50"><RotateCcw className="w-4 h-4" /></button></div>
                  {gdriveBackups.length > 0 && <div className="max-h-48 overflow-y-auto space-y-1 border-t border-[var(--nova-border-subtle)] pt-2"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">{t('settings.gdriveBackups')}</p>{gdriveBackups.map((b) => <div key={b.id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px]"><div className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-[var(--nova-text-muted)]" /><div className="min-w-0"><span className="truncate block text-[var(--nova-text-secondary)]">{b.name}</span><span className="text-[10px] text-[var(--nova-text-muted)]">{new Date(b.createdAt).toLocaleDateString()} • {Math.round(b.size / 1024)} KB</span></div></div><div className="flex items-center gap-1"><button onClick={() => handleGDriveRestore(b.id)} disabled={backupBusy || importPassphrase.length < 8} className="p-2 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition disabled:opacity-50" title={t('settings.gdriveRestore')}>{<Download className="w-4 h-4" />}</button><button onClick={() => handleGDriveDelete(b.id)} disabled={gdriveLoading} className="p-2 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-red-500/20 text-[var(--nova-text-muted)] hover:text-red-400 transition disabled:opacity-50" title={t('settings.gdriveDelete')}>{<Trash2 className="w-4 h-4" />}</button></div></div>)}</div>}
                  {gdriveBackups.length === 0 && <p className="text-[12px] text-[var(--nova-text-muted)] text-center py-4">{t('settings.gdriveNoBackups')}</p>}
                </div>
              </div>
            )}
            {gdriveMsg && <p className="text-[11px] text-[var(--nova-text-primary)]">{gdriveMsg}</p>}
          </div>
        </SettingsSheet>

        {/* PIN Sheet */}
        <SettingsSheet
          open={pinSheetOpen}
          onClose={() => { setPinSheetOpen(false); setIsCreatingPin(false); setIsRemovingPin(false); setPinInput(''); setPinMsg(null); }}
          title={t('settings.passcodeLock')}
          testId="settings-pin-sheet"
        >
          <div className="space-y-3">
            {!pinEnabled ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--nova-text-secondary)]">{t('settings.pinCreateDesc')}</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[16px] font-mono text-[var(--nova-text-muted)] select-all">{'*'.repeat(pinInput.length)}</span>
                  <input type="password" inputMode="numeric" autoComplete="off" value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="w-[80px] bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-2 text-[14px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition" placeholder="0000" />
                </div>
                <button type="button" onClick={handleConfirmPin} disabled={pinInput.length < 4} className="w-full py-3 rounded-xl bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 text-[var(--nova-on-accent)] text-[13px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50">{t('common.save')}</button>
                <button type="button" onClick={handleCancelPin} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition">{t('common.cancel')}</button>
              </div>
            ) : isRemovingPin ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--nova-text-secondary)]">{t('settings.passcodeConfirmRemove')}</p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="w-[80px] mx-auto block bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-2 text-[14px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="0000"
                />
                <button type="button" onClick={handleConfirmPin} disabled={pinInput.length < pinLength} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-red-500/30 text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition disabled:opacity-50">{t('settings.removePasscode')}</button>
                <button type="button" onClick={handleCancelPin} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition">{t('common.cancel')}</button>
                {pinMsg && <p className="text-[11px] text-[var(--nova-accent-color)]" role="status">{pinMsg}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-[var(--nova-text-secondary)]">{t('settings.pinManageDesc')}</p>
                <div className="space-y-2">
                  <IconToggle icon={<Lock className="w-5 h-5" />} label={t('settings.lockOnHide')} checked={lockOnHide} onChange={(v) => setLockOnHide(v)} />
                  <div><p className="text-[12px] font-medium text-[var(--nova-text-secondary)] mb-2">{t('settings.pinLength')}</p><div className="flex gap-2">{[4, 6].map((l) => <button key={l} type="button" onClick={() => setPinLength(l)} aria-pressed={pinLength === l} className={`flex-1 py-2 rounded-xl border text-[12px] font-semibold transition cursor-pointer ${pinLength === l ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)]' : 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'}`}>{l}</button>)}</div></div>
                  <button type="button" onClick={() => { setIsRemovingPin(false); setIsCreatingPin(true); setPinInput(''); setPinMsg(null); }} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition">{t('settings.changePin')}</button>
                  <button type="button" onClick={() => { setIsRemovingPin(true); setIsCreatingPin(false); setPinInput(''); setPinMsg(null); }} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-red-500/30 text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition">{t('settings.removePasscode')}</button>
                </div>
                {pinMsg && <p className="text-[11px] text-[var(--nova-accent-color)]" role="status">{pinMsg}</p>}
              </div>
            )}
          </div>
        </SettingsSheet>

        {/* 2FA Sheet */}
        <SettingsSheet
          open={twoFactorSheetOpen}
          onClose={() => { setTwoFactorSheetOpen(false); setShow2FASetup(false); setOtpInput(''); setOtpMsg(null); }}
          title={t('settings.twoFactorAuth')}
          description={t('settings.twoFactorSetupDesc')}
          testId="settings-2fa-sheet"
        >
          <div className="space-y-3">
            {!is2FAEnabled && totpSecret ? (
              <div className="space-y-3">
                <p className="text-[12px] font-mono text-[var(--nova-text-muted)] select-all text-center bg-[var(--nova-overlay-weak)] p-2 rounded-xl">{totpSecret}</p>
                <input type="text" maxLength={6} value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))} className="w-full text-center text-[18px] font-mono tracking-widest px-3 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50" placeholder="000000" />
                <button onClick={handleActivate2FA} disabled={!otpInput || otpInput.length !== 6} className="w-full py-3 rounded-xl bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 text-[var(--nova-on-accent)] text-[13px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50">{t('settings.activate')}</button>
                {otpMsg && <p className={`text-[11px] ${otpMsg === 'Invalid code' ? 'text-red-400' : 'text-[var(--nova-accent-color)]'}`} role="status">{otpMsg}</p>}
              </div>
            ) : (
              <p className="text-[13px] text-[var(--nova-text-secondary)] text-center py-4">{is2FAEnabled ? t('settings.twoFactorActive') : t('settings.twoFactorSetupDesc')}</p>
            )}
          </div>
        </SettingsSheet>

        {/* Recovery Gate */}
        <SettingsSheet
          open={recoveryGateOpen}
          onClose={() => setRecoveryGateOpen(false)}
          title={t('settings.recoveryGateTitle')}
          description={t('settings.recoveryGateDesc')}
          testId="settings-recovery-gate"
        >
          <div className="space-y-3 text-center">
            <KeyRound className="w-12 h-12 mx-auto text-[var(--nova-accent-color)]" />
            <p className="text-[13px] text-[var(--nova-text-secondary)]">{t('settings.recoveryGateDesc')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRecoveryGateOpen(false);
                  if (pinEnabled || biometricEnabled) {
                    handleShowSeedPhrase();
                  } else {
                    // Require PIN setup before revealing seed phrase
                    setShowSeedPhraseModal(false);
                    setRecoveryGateOpen(false);
                    // Navigate to security section (advanced tab) for PIN setup
                    setActiveTab('advanced');
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 text-[var(--nova-on-accent)] text-[13px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95"
              >
                {pinEnabled || biometricEnabled ? t('settings.revealRecovery') : t('settings.setupPinFirst')}
              </button>
              <button type="button" onClick={() => setRecoveryGateOpen(false)} className="flex-1 py-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition">{t('common.cancel')}</button>
            </div>
            {!pinEnabled && !biometricEnabled && (
              <p className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.setupPinToViewSeed')}</p>
            )}
          </div>
        </SettingsSheet>

        {/* Delete All Sheet */}
        <SettingsSheet
          open={deleteSheetOpen}
          onClose={() => { setDeleteSheetOpen(false); setClearDataConfirm(false); setClearDataPin(''); setPinMsg(null); }}
          title={t('settings.deleteAll')}
          description={t('settings.deleteAllWarning')}
          testId="settings-delete-sheet"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] text-center">{t('settings.deleteAllWarning')}</div>
            <HoldToConfirm
              label={t('settings.holdToConfirm')}
              holdLabel={t('settings.deleting')}
              onConfirm={async () => {
                if (pinEnabled) {
                  setClearDataConfirm(true);
                  setClearDataPin('');
                  setPinMsg(null);
                } else {
                  await eraseAllData();
                  setDeleteSheetOpen(false);
                }
              }}
              tone="danger"
            />
            {!pinEnabled && (
              <p className="text-[12px] text-[var(--nova-text-muted)] text-center">{t('settings.confirmClearNoPin')}</p>
            )}
            {pinEnabled && clearDataConfirm && (
              <div className="space-y-2">
                <p className="text-[12px] text-[var(--nova-text-muted)]">{t('settings.confirmClear')}</p>
                <input type="password" inputMode="numeric" autoComplete="off" value={clearDataPin} onChange={(e) => setClearDataPin(e.target.value.replace(/\D/g, ''))} placeholder="0000" className="w-[80px] mx-auto bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-2 text-[14px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition" />
                <button type="button" onClick={handleClearAllData} disabled={clearDataPin.length < 4} className="w-full py-2.5 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[12px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50">{t('common.delete')}</button>
                {pinMsg && <p className="text-[11px] text-[var(--nova-accent-color)]" role="status">{pinMsg}</p>}
              </div>
            )}
            <button type="button" onClick={() => { setDeleteSheetOpen(false); setClearDataConfirm(false); setClearDataPin(''); setPinMsg(null); }} className="w-full py-2.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[13px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition">{t('common.cancel')}</button>
          </div>
        </SettingsSheet>

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

  </div>

      {/* Backup Export/Import Modal */}
      {backupModal && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">
                {backupModal.mode === 'export' ? t('settings.exportBackup') : t('settings.importBackup')}
              </h3>
              <button
                onClick={() => setBackupModal(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[var(--nova-text-muted)]">
                {backupModal.mode === 'export'
                  ? 'Enter a passphrase to encrypt the backup file.'
                  : 'Select a .nova-backup file and enter the restore passphrase.'}
              </p>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-[var(--nova-text-secondary)]">
                  Passphrase
                </label>
                <input
                  type="password"
                  value={backupModal.mode === 'export' ? exportPassphrase : importPassphrase}
                  onChange={(e) =>
                    backupModal.mode === 'export'
                      ? setExportPassphrase(e.target.value)
                      : setImportPassphrase(e.target.value)
                  }
                  className="w-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-3 py-2 text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="••••••••"
                />
              </div>
              {backupModal.mode === 'import' && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-[var(--nova-text-secondary)]">Backup file</label>
                  <button
                    onClick={() => {
                      const input = document.getElementById('backup-file-input') as HTMLInputElement | null;
                      input?.click();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{importFile ? importFile.name : t('settings.importBackup')}</span>
                  </button>
                  <input
                    id="backup-file-input"
                    type="file"
                    accept=".nova-backup"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setImportFile(file);
                      setImportCloudBlob(null);
                    }}
                  />
                  {!importFile && importCloudBlob && (
                    <p className="text-[11px] text-[var(--nova-text-muted)]">
                      Cloud blob ready ({Math.max(1, Math.round(importCloudBlob.size / 1024))} KB)
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02] p-3">
                <label className="block text-[11px] font-medium text-[var(--nova-text-secondary)]">
                  Cloud endpoint (optional)
                </label>
                <input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  className="w-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-3 py-2 text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="https://your-webdav.example/nova-latest.nova-backup"
                />
                <input
                  type="password"
                  value={cloudToken}
                  onChange={(e) => setCloudToken(e.target.value)}
                  className="w-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-3 py-2 text-[12px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="Bearer token (optional, kept in memory)"
                />
                <p className="text-[10px] text-[var(--nova-text-muted)]">
                  Only the encrypted .nova-backup blob is uploaded. Keys stay on this device.
                </p>
                {backupModal.mode === 'import' && (
                  <button
                    onClick={handleDownloadFromCloud}
                    disabled={backupBusy || !cloudUrl.trim()}
                    className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-[12px] font-medium transition cursor-pointer ${
                      backupBusy || !cloudUrl.trim()
                        ? 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] cursor-not-allowed'
                        : 'bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>{backupBusy ? 'Downloading...' : 'Download from cloud'}</span>
                  </button>
                )}
              </div>
              {backupModal.mode === 'export' && cloudUrl.trim() && (
                <p className="text-[11px] text-[var(--nova-accent-color)]">
                  The backup will be uploaded instead of saved locally.
                </p>
              )}
              {backupMsg && (
                <div className={`rounded-xl px-3 py-2 text-[11px] text-[var(--nova-text-primary)] ${
                  backupMsg.includes('failed') || backupMsg.includes('not ready')
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]'
                }`}>
                  {backupMsg}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[var(--nova-border-subtle)] flex gap-2">
              <button
                onClick={() => setBackupModal(null)}
                className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={backupModal.mode === 'export' ? handleExportBackup : handleImportBackup}
                disabled={
                  backupBusy ||
                  (backupModal.mode === 'import' &&
                    (!importFile && !importCloudBlob || importPassphrase.length < 8)) ||
                  (backupModal.mode === 'export' && exportPassphrase.trim().length < 8)
                }
                className={`flex-1 py-2 rounded-xl text-[12px] font-medium text-[var(--nova-text-primary)] transition cursor-pointer ${
                  backupBusy ||
                  (backupModal.mode === 'import' &&
                    (!importFile && !importCloudBlob || importPassphrase.length < 8)) ||
                  (backupModal.mode === 'export' && exportPassphrase.trim().length < 8)
                    ? 'bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] cursor-not-allowed'
                    : 'bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5f2e)] border border-[var(--nova-accent-color)]/30 shadow-md shadow-[var(--nova-accent-color)]/25'
                }`}
              >
                {backupBusy
                  ? 'Processing...'
                  : backupModal.mode === 'export'
                    ? cloudUrl.trim()
                      ? 'Upload'
                      : 'Export'
                    : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed Phrase Modal */}
      {showSeedPhraseModal && identity && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('settings.showSeedPhrase')}</h3>
              <button
                onClick={() => setShowSeedPhraseModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[var(--nova-text-muted)]">
                {t('settings.seedPhraseDesc')}
              </p>
              <div className="bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] rounded-xl p-2 max-h-64 overflow-y-auto font-mono text-xs text-[var(--nova-accent-color)] break-all">
                {identity.mnemonic.split(' ').map((word, i) => (
                  <span key={i} className="inline-block mr-1 mb-1 px-1 py-0.5 rounded bg-[var(--nova-overlay-weak)]">
                    {i + 1}. {word}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopySeedPhrase}
                  className="flex-1 py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[11px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 flex items-center justify-center gap-1"
                >
                  {seedPhraseCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {seedPhraseCopied ? t('common.copied') : t('common.copy')}
                </button>
                <button
                  onClick={() => setShowSeedPhraseModal(false)}
                  className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition active:scale-95"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-[10px] text-[var(--nova-text-muted)] italic">
                {t('settings.seedPhraseWarning')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Crypto Premium Checkout Modal */}
      {cryptoModalOpen && (
        <CryptoCheckoutModal
          isOpen={cryptoModalOpen}
          onClose={() => setCryptoModalOpen(false)}
          onSuccess={() => {
            setCryptoModalOpen(false);
          }}
        />
      )}

      {/* Moderation / appeals */}
      {moderationOpen && <SanctionScreen onClose={() => setModerationOpen(false)} />}

      {/* Blocked Users */}
      {blockedUsersOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('settings.blockedUsers')}</h3>
              <button
                onClick={() => setBlockedUsersOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
              {(() => {
                const blocked = getBlockedContactsWithProfiles();
                if (blocked.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-[var(--nova-text-muted)] text-[11px]">
                      {t('settings.noBlockedUsers')}
                    </div>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    {blocked.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]"
                      >
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
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setContactBlocked(contact.id, false);
                            setSocialPrivacyState(getSocialPrivacy());
                            showToast(t('settings.unblockedUser', { name: contact.name }));
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
                        >
                          {t('settings.unblock')}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Terms / Privacy */}
      {legalDoc && <LegalModal docId={legalDoc} onClose={() => setLegalDoc(null)} />}

      {/* Account Switcher */}
      <AccountSwitcher
        isOpen={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
        onAccountAdded={() => {
          // Refresh any state if needed
        }}
      />

      {/* Bots list (Phase B3) */}
      {botsOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('bot.title')}</h3>
              <button
                onClick={() => setBotsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {getBots().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--nova-text-muted)] text-[11px]">
                  {t('bot.noBots')}
                  <p className="mt-1 text-[9px]">{t('bot.installDesc')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {getBots().map((bot) => {
                    const pending = pendingConsent(bot);
                    return (
                      <div
                        key={bot.manifest.id}
                        className="flex items-center justify-between px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-[var(--nova-overlay-weak)] flex items-center justify-center shrink-0">
                            <Settings className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-[var(--nova-text-primary)] truncate">{bot.manifest.name}</p>
                            <p className="text-[10px] text-[var(--nova-text-muted)] truncate">
                              @{bot.manifest.username} · {bot.blocked
                                ? t('bot.blocked', { defaultValue: 'Blocked' })
                                : bot.enabled
                                  ? t('bot.granted')
                                  : t('bot.disabled')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {pending.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => requestInstall(bot.manifest)}
                              className="px-2 py-1 rounded-lg bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[10px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95"
                            >
                              {t('bot.permissionsRequired')}
                            </button>
                          ) : (
                            <>
                              {bot.blocked && (
                                <button
                                  type="button"
                                  onClick={() => setBotBlocked(bot.manifest.id, false)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95"
                                  title={t('bot.unblock', { defaultValue: 'Unblock' })}
                                >
                                  {t('bot.unblock', { defaultValue: 'Unblock' })}
                                </button>
                              )}
                              {onOpenBotChat && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBotsOpen(false);
                                    onClose();
                                    onOpenBotChat(bot.manifest.id);
                                  }}
                                  className="px-2 py-1 rounded-lg border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 text-[10px] font-medium text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/20 active:scale-95"
                                  title={t('bot.openChat', { defaultValue: 'Open chat' })}
                                >
                                  {t('bot.openChat', { defaultValue: 'Open chat' })}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleBot(bot.manifest.id, !bot.enabled)}
                                className="w-7 h-7 rounded-full border border-[var(--nova-border-subtle)] flex items-center justify-center transition cursor-pointer active:scale-95"
                                title={bot.enabled ? t('bot.disable') : t('bot.enable')}
                              >
                                {bot.enabled ? <Ban className="w-3 h-3 text-red-400" /> : <Check className="w-3 h-3 text-emerald-400" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => uninstallBot(bot.manifest.id)}
                                className="w-7 h-7 rounded-full border border-[var(--nova-border-subtle)] flex items-center justify-center transition cursor-pointer active:scale-95 text-red-400 hover:text-red-300"
                                title={t('bot.revoke')}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {installError && (
                <div className="text-[10px] text-red-400 px-1">{installError}</div>
              )}

              {/* Available built-in bots */}
              <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
                <h4 className="text-[10px] font-semibold text-[var(--nova-text-secondary)] mb-2 uppercase tracking-wide">{t('bot.availableTitle', { defaultValue: 'Available bots' })}</h4>
                <div className="space-y-1.5">
                  {AVAILABLE_BUILTIN_BOTS
                    .filter((manifest) => !getBots().some((b) => b.manifest.id === manifest.id))
                    .map((manifest) => (
                      <div
                        key={manifest.id}
                        className="flex items-center justify-between px-2 py-2 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                            {manifest.id === 'movie_catalog' && <Movie className="w-4 h-4" />}
                            {manifest.id === 'novafather' && <Bot className="w-4 h-4" />}
                            {manifest.id === 'echo' && <Settings className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-[var(--nova-text-primary)] truncate">{manifest.name}</p>
                            <p className="text-[10px] text-[var(--nova-text-muted)] truncate">
                              @{manifest.username} · {t('bot.builtin', { defaultValue: 'Built-in' })}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestInstall(manifest)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[10px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          {t('bot.install', { defaultValue: 'Install' })}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
              <p className="px-1 pt-1 text-[10px] leading-relaxed text-[var(--nova-text-muted)]">
                {t('bot.openChatHint', {
                  defaultValue:
                    'Open a bot chat here. Send /start or tap the bot icon in the message field to see its commands.',
                })}
              </p>
            </div>
            <div className="p-4 border-t border-[var(--nova-border-subtle)] flex gap-2">
              <button
                type="button"
                onClick={() => setDevRegistryOpen(true)}
                className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('bot.createLocal', { defaultValue: 'Create local bot' })}
              </button>
              <button
                type="button"
                onClick={() => setInstallFromFile(true)}
                className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('bot.installFile', { defaultValue: 'Install from file' })}
              </button>
              <button
                onClick={() => setBotsOpen(false)}
                className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install bot consent (Phase B3) */}
      {installOpen && installingBot && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('bot.install')}</h3>
              <button
                onClick={() => setInstallOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{installingBot.manifest.name}</p>
                <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">@{installingBot.manifest.username}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-[var(--nova-text-secondary)]">{t('bot.permissionsRequired')}</p>
                {installingBot.manifest.requestedPermissions.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    role="switch"
                    aria-checked={installingBot.granted.includes(perm)}
                    onClick={() => {
                      setInstallingBot((prev) => {
                        if (!prev) return null;
                        const granted = prev.granted.includes(perm)
                          ? prev.granted.filter((p) => p !== perm)
                          : [...prev.granted, perm];
                        return { ...prev, granted };
                      });
                    }}
                    className={`w-full flex items-center justify-between py-1.5 px-2 rounded-lg border transition cursor-pointer ${
                      installingBot.granted.includes(perm)
                        ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)]'
                        : 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                    }`}
                  >
                    <span className="text-[11px]">{perm}</span>
                    {installingBot.granted.includes(perm) ? (
                      <Check className="w-3 h-3 shrink-0" />
                    ) : (
                      <span className="w-3 h-3 shrink-0 opacity-0" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInstallOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('bot.cancel')}
                </button>
                <button
                  type="button"
                  disabled={installingBot.granted.length === 0}
                  onClick={confirmInstall}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-medium text-[var(--nova-text-primary)] transition cursor-pointer ${
                    installingBot.granted.length === 0
                      ? 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] cursor-not-allowed'
                      : 'bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 hover:bg-[var(--nova-accent-color)]/20 active:scale-95'
                  }`}
                >
                  {t('bot.grantAll')}
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--nova-border-subtle)] flex gap-2">
              <button
                onClick={() => setBotsOpen(false)}
                className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Developer registry: create a local L1 bot (Phase B3) */}
      {devRegistryOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('bot.devRegistryTitle', { defaultValue: 'Developer registry' })}</h3>
              <button
                onClick={() => setDevRegistryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-[var(--nova-text-muted)] leading-relaxed">
                {t('bot.devRegistryDesc', { defaultValue: 'Create a local L1 bot. A keypair is generated in your vault and never leaves this device.' })}
              </p>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-[var(--nova-text-secondary)] mb-1">{t('bot.name', { defaultValue: 'Name' })}</label>
                  <input
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                    placeholder="My Bot"
                    className="w-full py-1.5 px-2 rounded-lg bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--nova-text-secondary)] mb-1">{t('bot.username', { defaultValue: 'Username' })}</label>
                  <input
                    value={devUsername}
                    onChange={(e) => setDevUsername(e.target.value)}
                    placeholder="mybot"
                    className="w-full py-1.5 px-2 rounded-lg bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--nova-text-secondary)] mb-1">{t('bot.description', { defaultValue: 'Description' })}</label>
                  <input
                    value={devDesc}
                    onChange={(e) => setDevDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full py-1.5 px-2 rounded-lg bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
              </div>
              {devError && <div className="text-[10px] text-red-400">{devError}</div>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDevRegistryOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={devCreating || !devName || !devUsername}
                  onClick={createLocalBot}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-medium text-[var(--nova-text-primary)] transition cursor-pointer ${
                    devCreating || !devName || !devUsername
                      ? 'bg-[var(--nova-overlay-weak)] border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] cursor-not-allowed'
                      : 'bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 hover:bg-[var(--nova-accent-color)]/20 active:scale-95'
                  }`}
                >
                  {devCreating ? t('bot.creating', { defaultValue: 'Creating…' }) : t('bot.create', { defaultValue: 'Create bot' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install from local manifest file (Phase B3) */}
      {installFromFile && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--nova-surface)] border border-[var(--nova-border-subtle)] rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--nova-border-subtle)] shrink-0">
              <h3 className="font-bold text-sm text-[var(--nova-text-primary)]">{t('bot.installFileTitle', { defaultValue: 'Install from file' })}</h3>
              <button
                onClick={() => setInstallFromFile(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-[var(--nova-text-muted)] leading-relaxed">
                {t('bot.installFileDesc', { defaultValue: 'Select a bot manifest JSON file to install.' })}
              </p>
              <label className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-[var(--nova-border-subtle)] bg-white/[0.02] hover:border-[var(--nova-accent-color)]/50 transition cursor-pointer">
                <Upload className="w-6 h-6 text-[var(--nova-text-muted)]" />
                <p className="text-[11px] font-medium text-[var(--nova-text-primary)]">{t('bot.chooseFile', { defaultValue: 'Choose manifest file' })}</p>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFileManifest(file);
                  }}
                />
              </label>
              {fileError && <div className="text-[10px] text-red-400">{fileError}</div>}
              {fileManifest && (
                <div className="p-3 rounded-lg bg-white/[0.02] border border-[var(--nova-border-subtle)]">
                  <p className="text-[11px] font-semibold text-[var(--nova-text-primary)] truncate">{fileManifest.name}</p>
                  <p className="text-[10px] text-[var(--nova-text-muted)] mt-0.5">@{fileManifest.username}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setInstallingBot({ manifest: fileManifest, granted: [...fileManifest.requestedPermissions] });
                      setInstallFromFile(false);
                      setInstallOpen(true);
                    }}
                    className="w-full py-1.5 rounded-lg bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[11px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95"
                  >
                    {t('bot.continueInstall', { defaultValue: 'Continue install' })}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInstallFromFile(false)}
                  className="flex-1 py-2 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
</div>
      )}
    {toastMessage && (
      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[var(--nova-surface-high)]/95 border border-[var(--nova-border-subtle)] text-[var(--nova-text-primary)] text-xs px-3.5 py-2 rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
    )}
    </div>
  );
};




























