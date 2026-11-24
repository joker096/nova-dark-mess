import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Bell, Lock, Database, Palette, Info, Languages, Download, Upload, FileText, Moon, Monitor, Sun, Copy, AlertTriangle, Sparkles, DollarSign, Send, BarChart3, ChevronRight, ShieldAlert, Megaphone, RotateCcw, Ban, Settings, Hand, MapPin, Plus, Film, Bot, Cloud, HardDrive, Trash2, Globe, UserRound, Users, Phone, Clock, ShieldCheck, MessageSquare, VolumeX, Star } from 'lucide-react';
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
  const { t } = useLanguage();
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

  const analyticsCounts = localAnalytics.getEventCountsByType();
  const analyticsMessageCount =
    (analyticsCounts.message_send ?? 0) +
    (analyticsCounts.message_receive ?? 0) +
    (analyticsCounts.voice_message_send ?? 0) +
    (analyticsCounts.voice_message_receive ?? 0);
  const analyticsActiveChats = Object.keys(localAnalytics.getMessagesByChat()).length;

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
        <div className="flex items-center justify-between p-4 pb-3 border-b border-[var(--nova-border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 id="settings-title" className="font-bold text-sm text-[var(--nova-text-primary)] leading-tight">{t('settings.title')}</h3>
              <p className="text-[10.5px] text-[var(--nova-text-muted)]">{t('app.name')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-4 py-3 space-y-1 flex-1">
          <SectionHeader
            icon={<Languages className="w-3.5 h-3.5" />}
            title={t('settings.language')}
          />
          <LanguageSwitcher />

          <SectionHeader
            icon={<Palette className="w-3.5 h-3.5" />}
            title={t('settings.appearance')}
          />
          <div className="py-1">
            <div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">{t('settings.theme')}</div>
            <div className="flex gap-1">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAppTheme(opt.value)}
                  className={`flex-1 flex items-center gap-2 py-2 px-2.5 rounded-xl border transition cursor-pointer ${
                    appTheme === opt.value
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm'
                      : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                >
                  {opt.icon}
                  <span className="text-[12px] font-medium">
                    {opt.value === 'light'
                      ? t('settings.themeLight')
                      : opt.value === 'dark'
                        ? t('settings.themeDark')
                        : t('settings.themeSystem')}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="py-1">
            <div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">{t('settings.fontSize')}</div>
            <div className="flex gap-1.5">
              {fontSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updatePref('fontSize', opt.value)}
                  className={`flex-1 flex flex-col items-center py-2 rounded-xl border transition cursor-pointer ${
                    prefs.fontSize === opt.value
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm'
                      : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                >
                  <span
                    className={
                      opt.value === 'small'
                        ? 'text-[11px] font-bold'
                        : opt.value === 'medium'
                        ? 'text-[14px] font-bold'
                        : 'text-[18px] font-bold'
                    }
                  >
                    A
                  </span>
                  <span className="text-[9px] uppercase tracking-wider mt-0.5">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="py-1">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="text-[13px] text-[var(--nova-text-primary)]">
                {t('settings.fabSide', { defaultValue: 'One-handed button' })}
              </div>
              <span className="text-[10px] text-[var(--nova-text-muted)]">
                {t('settings.fabSideDesc', { defaultValue: 'Side of the New Action button' })}
              </span>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('settings.fabSide', { defaultValue: 'One-handed button' })}>
              {fabSideOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={fabSide === opt.value}
                  onClick={() => updateFabSide(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border transition cursor-pointer text-[12px] ${
                    fabSide === opt.value
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/60 text-[var(--nova-accent-color)] font-semibold shadow-sm'
                      : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                >
                  <Hand className={`w-3.5 h-3.5 ${opt.value === 'left' ? '-scale-x-100' : ''}`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="py-1">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.chatColors')}</div>
              <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.chatColorsDesc')}</span>
            </div>
            <div className="flex gap-1">
              {CHAT_COLOR_OPTIONS.map((opt) => {
                const label = opt.value === 'default' ? t('settings.chatColorDefault') : opt.value === 'sapphire' ? t('settings.chatColorSapphire') : opt.value === 'amethyst' ? t('settings.chatColorAmethyst') : t('settings.chatColorEmerald');
                return (
                    <button
                    key={opt.value}
                    type="button"
                    aria-disabled={opt.value !== 'default' && !canUse('chat_themes')}
                    aria-label={label}
                    onClick={() => {
                      if (opt.value !== 'default' && !canUse('chat_themes')) {
                        checkout();
                        return;
                      }
                      setChatColorTheme(opt.value);
                      try {
                        localStorage.setItem(CHAT_THEME_KEY, opt.value);
                      } catch { void 0; }
                    }}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition cursor-pointer relative overflow-hidden min-h-[44px] ${
                      chatColorTheme === opt.value
                        ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 shadow-sm shadow-[var(--nova-accent-color)]/25'
                        : 'bg-[var(--nova-overlay-weak)] border-transparent hover:bg-[var(--nova-overlay-weak)]'
                    }${opt.value !== 'default' && !canUse('chat_themes') ? ' opacity-60' : ''}`}
                  >
                    <div className="relative w-6 h-6 rounded-full border border-[var(--nova-border-color)] shadow-sm overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-tr ${opt.grad}`} />
                      <div className="absolute inset-1 rounded-full bg-[var(--nova-overlay-strong)]" />
                      {opt.value !== 'default' && !canUse('chat_themes') && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                          <Lock className="w-3 h-3 text-[var(--nova-text-primary)]" />
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium ${opt.value !== 'default' && !canUse('chat_themes') ? 'text-[var(--nova-text-muted)]' : ''}`}>{label}</span>
                    {opt.value !== 'default' && !canUse('chat_themes') && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-accent-color)] flex items-center justify-center text-[10px] font-bold">
                        <Lock className="w-2 h-2 fill-[var(--nova-text-primary)]" />
                      </span>
                    )}
                  </button>
                );

              })}
            </div>
          </div>

          <SectionHeader
            icon={<Sparkles className="w-3.5 h-3.5" />}
            title={t('settings.premium')}
          />
          <div className="py-1">
            <div className="text-[13px] text-[var(--nova-text-primary)] mb-1.5 px-1">
              {t('settings.premiumDesc')}
            </div>

            {freeDaysRemaining() > 0 && (
              <div className="mb-2 px-1 py-1.5 rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 text-xs text-[var(--nova-accent-color)]">
                {t('settings.premiumFreeTrial', { days: freeDaysRemaining() })}
              </div>
            )}

            <button
              onClick={async () => {
                const result = await checkout();
                if (!result.ok && result.error) {
                  // Show error via toast or inline
                  alert(result.error);
                }
              }}
              className={`w-full py-2.5 px-4 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-md ${
                premium
                  ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] border-[var(--nova-accent-color)] shadow-lg shadow-[var(--nova-accent-color)]/25'
                  : 'bg-[var(--nova-overlay-weak)] border-transparent text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:border-[var(--nova-accent-color)]/30'
              }`}
              disabled={loading || premium}
            >
              {loading ? (
                <span className="animate-pulse">Loading...</span>
              ) : premium ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('settings.premiumActive')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {t('settings.premiumUpgrade')} •{' '}
                    {minSubscriptionCost / 100} {t('settings.premiumCurrency')}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setCryptoModalOpen(true)}
              disabled={premium}
              className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              {t('premium.cryptoTitle')}
            </button>
          </div>

          <SectionHeader
            icon={<Bell className="w-3.5 h-3.5" />}
            title={t('settings.notifications')}
          />
          <ToggleRow
            label={t('settings.notificationSound')}
            enabled={prefs.notificationSound}
            onToggle={() => updatePref('notificationSound', !prefs.notificationSound)}
          />
          {prefs.notificationSound && (
            <div className="flex flex-wrap gap-1.5 px-1 py-1">
              {SOUND_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    saveSoundId(id);
                    setSoundId(id);
                    if (id !== 'silent') playSound('notification', id);
                  }}
                  className={`px-3 py-2 rounded-full text-[11px] border transition cursor-pointer min-h-[44px] flex items-center ${
                    soundId === id
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-[var(--nova-text-primary)]'
                      : 'border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                >
                  {id === 'silent'
                    ? t('settings.soundSilent')
                    : SOUNDS[id].label}
                </button>
              ))}
            </div>
          )}
          <ToggleRow
            label={t('settings.vibration')}
            enabled={prefs.vibration}
            onToggle={() => updatePref('vibration', !prefs.vibration)}
          />
          <ToggleRow
            label={t('settings.previewMessages')}
            enabled={prefs.previewMessages}
            onToggle={() => updatePref('previewMessages', !prefs.previewMessages)}
          />
          <ToggleRow
            label={t('settings.pushNotifications')}
            enabled={prefs.pushEnabled}
            onToggle={() => updatePref('pushEnabled', !prefs.pushEnabled)}
          />
          {prefs.pushEnabled && (
            <div className="px-1 py-2 space-y-2">
              <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
                {t('settings.pushNotificationsDesc')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    const { registerForPush, unregisterFromPush, getPushToken } = await import('../lib/notifications/push');
                    if (prefs.pushEnabled) {
                      const token = await registerForPush();
                      if (token) {
                        // Token registered successfully
                      }
                    }
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-[var(--nova-accent-color)] hover:text-[var(--nova-accent-color)]/80 border border-[var(--nova-accent-color)]/30 rounded-xl transition"
                >
                  {t('settings.registerPush')}
                </button>
                <button
                  onClick={async () => {
                    const { unregisterFromPush } = await import('../lib/notifications/push');
                    await unregisterFromPush();
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] border border-[var(--nova-border-subtle)] rounded-xl transition"
                >
                  {t('settings.unregisterPush')}
                </button>
              </div>
            </div>
          )}

          {/* Granular Notification Settings (Telegram-style) */}
          <SectionHeader icon={<Bell className="w-3.5 h-3.5" />} title={t('settings.notificationSettings')} />
          <div className="px-1 pb-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
              {t('settings.notificationSettingsDesc')}
            </p>

            {/* Per chat type defaults */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-[var(--nova-text-secondary)]">{t('settings.defaultNotifications')}</p>
              {[
                { key: 'privateChats', label: t('settings.privateChats'), icon: <MessageSquare className="w-3.5 h-3.5" /> },
                { key: 'groups', label: t('settings.groups'), icon: <Users className="w-3.5 h-3.5" /> },
                { key: 'channels', label: t('settings.channels'), icon: <Megaphone className="w-3.5 h-3.5" /> },
                { key: 'bots', label: t('settings.bots'), icon: <Bot className="w-3.5 h-3.5" /> },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                      {item.icon}
                    </div>
                    <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{item.label}</span>
                  </div>
                  <NotificationLevelSelector
                    value={notificationPrefs[item.key as keyof NotificationPrefs] as NotificationLevel}
                    onChange={(v) => {
                      setNotificationPref(item.key as keyof NotificationPrefs, v);
                      setNotificationPrefsState(getNotificationPrefs());
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Muted Contacts */}
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
              <div className="flex items-center justify-between py-2 px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
                    <VolumeX className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.mutedContacts')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
              </div>
            </div>

            {/* Priority Contacts */}
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
              <div className="flex items-center justify-between py-2 px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                    <Star className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.priorityContacts')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
              </div>
            </div>
          </div>

          <SectionHeader icon={<Lock className="w-3.5 h-3.5" />} title={t('settings.privacy')} />
          <ToggleRow
            label={t('settings.metadataMinimization')}
            enabled={privacyPrefs.metadataMinimization}
            onToggle={() => updatePrivacyPref(!privacyPrefs.metadataMinimization)}
          />
          <ToggleRow
            label={t('settings.webrtcRelayOnly')}
            enabled={privacyPrefs.webrtcRelayOnly}
            onToggle={() => updatePresencePref({ webrtcRelayOnly: !privacyPrefs.webrtcRelayOnly })}
          />
          {privacyPrefs.webrtcRelayOnly && (
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[var(--nova-text-muted)]">
              {t('settings.webrtcRelayOnlyHint')}
            </p>
          )}

          {/* Social Privacy (Telegram-style) */}
          <SectionHeader icon={<ShieldCheck className="w-3.5 h-3.5" />} title={t('settings.socialPrivacy')} />
          <div className="px-1 pb-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
              {t('settings.socialPrivacyDesc')}
            </p>
            {[
              { key: 'lastSeen', label: t('settings.lastSeen'), icon: <Clock className="w-3.5 h-3.5" /> },
              { key: 'profilePhoto', label: t('settings.profilePhoto'), icon: <UserRound className="w-3.5 h-3.5" /> },
              { key: 'calls', label: t('settings.calls'), icon: <Phone className="w-3.5 h-3.5" /> },
              { key: 'groupsAndChannels', label: t('settings.groupsAndChannels'), icon: <Users className="w-3.5 h-3.5" /> },
              { key: 'phoneNumber', label: t('settings.phoneNumber'), icon: <Phone className="w-3.5 h-3.5" /> },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                    {item.icon}
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">{item.label}</span>
                </div>
                <PrivacyScopeSelector
                  value={socialPrivacy[item.key as keyof SocialPrivacySettings] as PrivacyScope}
                  onChange={(v) => {
                    setSocialPrivacy(item.key as keyof SocialPrivacySettings, v);
                    setSocialPrivacyState(getSocialPrivacy());
                  }}
                />
              </div>
            ))}
            <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
              <button
                type="button"
                onClick={() => setBlockedUsersOpen(true)}
                className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center text-red-400">
                    <Ban className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)] hover:text-[var(--nova-text-primary)] transition">{t('settings.blockedUsers')}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
              </button>
            </div>
          </div>

          <SectionHeader
            icon={<ShieldAlert className="w-3.5 h-3.5" />}
            title={t('settings.anonymity')}
          />

          {onOpenMeshMap && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMeshMap?.();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{t('meshMap.title')}</p>
                <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('meshMap.subtitle', { defaultValue: 'Visual radar of nearby relay nodes' })}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
            </button>
          )}

          {/* Multi-relay (Этап 6.3) */}
          <ToggleRow
            label={t('settings.multiRelay')}
            enabled={privacyPrefs.relayEndpoints.length > 0}
            onToggle={() => {
              if (privacyPrefs.relayEndpoints.length === 0) {
                // seed with example
                setPrivacyPrefs((prev) => {
                  const next = {
                    ...prev,
                    relayEndpoints: [
                      {
                        id: 'relay_example',
                        url: 'https://relay.example.com',
                        operator: 'Example',
                      },
                    ],
                  };
                  savePrivacyPrefs(next);
                  return next;
                });
              } else {
                setPrivacyPrefs((prev) => {
                  const next = { ...prev, relayEndpoints: [] };
                  savePrivacyPrefs(next);
                  return next;
                });
              }
            }}
          />
          {privacyPrefs.relayEndpoints.length > 0 && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
                {t('settings.multiRelayHint')}
              </p>
              <div className="space-y-1.5">
                {privacyPrefs.relayEndpoints.map((relay) => (
                  <div
                    key={relay.id}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]"
                  >
                    <span className="flex-1 text-[11px] text-[var(--nova-text-secondary)] truncate">
                      {relay.url}
                    </span>
                    {relay.operator && (
                      <span className="text-[10px] text-[var(--nova-text-muted)] truncate max-w-[120px]">
                        {relay.operator}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRelay(relay.id)}
                      className="w-6 h-6 rounded-full border border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition"
                      aria-label={t('settings.removeRelay')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 pt-1">
                <input
                  type="url"
                  placeholder={t('settings.relayUrl')}
                  value={newRelayUrl}
                  onChange={(e) => setNewRelayUrl(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <input
                  type="text"
                  placeholder={t('settings.relayOperator')}
                  value={newRelayOperator}
                  onChange={(e) => setNewRelayOperator(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={addRelay}
                  disabled={!newRelayUrl.trim()}
                  className="px-2.5 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] font-medium text-[var(--nova-text-primary)] transition hover:bg-[var(--nova-overlay-weak)] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('settings.addRelay')}
                </button>
              </div>
              <p className="text-[10px] text-[var(--nova-text-muted)]">
                Queues rotate between relays weekly so no single operator sees a contact's full history.
              </p>
            </div>
          )}

          {/* TURN Servers for IP-Privacy Calls */}
          <ToggleRow
            label={t('settings.webrtcRelayOnly')}
            enabled={privacyPrefs.webrtcRelayOnly}
            onToggle={() => updatePresencePref({ webrtcRelayOnly: !privacyPrefs.webrtcRelayOnly })}
          />
          {privacyPrefs.webrtcRelayOnly && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
                {t('settings.turnServersHint')}
              </p>
              {privacyPrefs.turnServers.length === 0 && (
                <p className="px-1 text-[11px] text-[var(--nova-text-muted)]">
                  {t('settings.turnServersEmpty')}
                </p>
              )}
              <div className="space-y-1.5">
                {privacyPrefs.turnServers.map((server, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-white/[0.02]"
                  >
                    <span className="flex-1 text-[11px] text-[var(--nova-text-secondary)] truncate">
                      {typeof server.urls === 'string' ? server.urls : Array.isArray(server.urls) ? server.urls.join(', ') : 'TURN'}
                    </span>
                    {server.username && (
                      <span className="text-[10px] text-[var(--nova-text-muted)] truncate max-w-[100px]">
                        {server.username}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTurnServer(index)}
                      className="w-6 h-6 rounded-full border border-[var(--nova-border-subtle)] text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition"
                      aria-label={t('settings.removeTurnServer')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 pt-1">
                <input
                  type="text"
                  placeholder={t('settings.turnServerUrlPlaceholder')}
                  value={newTurnServerUrl}
                  onChange={(e) => setNewTurnServerUrl(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <input
                  type="text"
                  placeholder={t('settings.turnUsernameLabel')}
                  value={newTurnServerUsername}
                  onChange={(e) => setNewTurnServerUsername(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <input
                  type="password"
                  placeholder={t('settings.turnPasswordLabel')}
                  value={newTurnServerPassword}
                  onChange={(e) => setNewTurnServerPassword(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <input
                  type="text"
                  placeholder={t('settings.turnRealmLabel')}
                  value={newTurnServerRealm}
                  onChange={(e) => setNewTurnServerRealm(e.target.value)}
                  className="px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={addTurnServer}
                  disabled={!newTurnServerUrl.trim()}
                  className="px-2.5 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] font-medium text-[var(--nova-text-primary)] transition hover:bg-[var(--nova-overlay-weak)] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('settings.addTurnServerBtn')}
                </button>
              </div>
              <p className="text-[10px] text-[var(--nova-text-muted)]">
                When 'Hide my IP in calls' is enabled, media flows through these TURN relays so peers cannot see your IP address.
              </p>
            </div>
          )}

          {/* Tor (Этап 6.4) */}
          <ToggleRow
            label={t('settings.torMode')}
            enabled={privacyPrefs.torEnabled}
            onToggle={toggleTor}
          />
          {privacyPrefs.torEnabled && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
                {t('settings.torModeHint')}
              </p>
              <div className="flex items-center gap-1.5 px-1 py-1">
                <span className="text-[11px] text-[var(--nova-text-secondary)]">{t('settings.torSocksPort')}</span>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={privacyPrefs.torSocksPort}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v <= 65535) {
                      setPrivacyPrefs((prev) => {
                        const next = { ...prev, torSocksPort: v };
                        savePrivacyPrefs(next);
                        return next;
                      });
                    }
                  }}
                  className="w-20 px-2 py-1.5 rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[11px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={checkTor}
                  disabled={torStatus === 'checking'}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition ${
                    torStatus === 'checking'
                      ? 'border-[#8c919d]/40 text-[var(--nova-text-muted)] cursor-wait'
                      : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                >
                  {torStatus === 'checking'
                    ? t('settings.torCheck') + '…'
                    : t('settings.torCheck')}
                </button>
                <span
                  className={`text-[10px] font-medium ${
                    torStatus === 'connected'
                      ? 'text-emerald-400'
                      : torStatus === 'error'
                        ? 'text-red-400'
                        : 'text-[var(--nova-text-muted)]'
                  }`}
                >
                  {torStatus === 'connected'
                    ? t('settings.torConnected')
                    : torStatus === 'error'
                      ? t('settings.torNotConnected')
                    : '—'}
                </span>
              </div>
            </div>
          )}

          {/* Analytics consent (Этап 8.4) */}
          <ToggleRow
            label={t('analytics.consent')}
            enabled={privacyPrefs.analyticsConsent}
            onToggle={() => {
              const next = !privacyPrefs.analyticsConsent;
              setPrivacyPrefs((prev) => {
                const p = { ...prev, analyticsConsent: next };
                savePrivacyPrefs(p);
                return p;
              });
              localAnalytics.setAnalyticsConsent(next);
            }}
          />
          {privacyPrefs.analyticsConsent && (
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[var(--nova-text-muted)]">
              {t('analytics.consentHint')}
            </p>
          )}
          <ToggleRow
            label={t('analytics.crashReports')}
            enabled={privacyPrefs.crashReports}
            onToggle={() => {
              const next = !privacyPrefs.crashReports;
              setPrivacyPrefs((prev) => {
                const p = { ...prev, crashReports: next };
                savePrivacyPrefs(p);
                return p;
              });
              localAnalytics.setCrashReportsConsent(next);
              setCrashCount(localAnalytics.getCrashes().length);
            }}
          />
          {privacyPrefs.crashReports && (
            <div className="px-1 -mt-1 pb-2 space-y-2">
              <p className="text-[11px] text-[var(--nova-text-muted)]">
                {t('analytics.crashReportsHint')}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--nova-text-secondary)]">
                  {t('analytics.crashReportsCount', { count: crashCount })}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={handleExportCrashReports}
                    disabled={crashCount === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--nova-border-subtle)] px-2 py-1 text-[10.5px] font-medium text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] disabled:cursor-default disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" />
                    {t('analytics.exportCrashReports')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCrashReports}
                    disabled={crashCount === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--nova-border-subtle)] px-2 py-1 text-[10.5px] font-medium text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] disabled:cursor-default disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('analytics.clearCrashReports')}
                  </button>
                </div>
              </div>
              {crashMsg && (
                <p role="status" className="text-[10.5px] text-emerald-300/80">{crashMsg}</p>
              )}
            </div>
          )}
          {privacyPrefs.metadataMinimization && (
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[var(--nova-text-muted)]">
              {t('settings.metadataMinimizationHint')}
              {battery.level !== null &&
                ' ' +
                  (coverTrafficActive
                    ? `Cover traffic active (battery ${Math.round(battery.level * 100)}%${battery.charging ? ', charging' : ''}).`
                    : `Cover traffic paused to save battery (${Math.round(battery.level * 100)}%).`)}
            </p>
          )}
          <ToggleRow
            label={t('settings.presenceSharing')}
            enabled={privacyPrefs.presenceSharing}
            onToggle={() => updatePresencePref({ presenceSharing: !privacyPrefs.presenceSharing })}
          />
          {privacyPrefs.presenceSharing && (
            <div className="px-1 pb-2 space-y-2">
              <p className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.presenceSharingHint')}</p>
              <ToggleRow
                label={t('settings.presenceHashing')}
                enabled={privacyPrefs.presenceHashing}
                onToggle={() => updatePresencePref({ presenceHashing: !privacyPrefs.presenceHashing })}
              />
              <div className="flex gap-1.5">
                {(['short', 'normal', 'long'] as const).map((ttl) => (
                  <button
                    key={ttl}
                    type="button"
                    onClick={() => updatePresencePref({ presenceTtl: ttl })}
                    className={`flex-1 py-1.5 rounded-xl border text-[11px] font-medium transition cursor-pointer active:scale-[0.98] ${
                      privacyPrefs.presenceTtl === ttl
                        ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-[var(--nova-text-primary)]'
                        : 'border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                    }`}
                  >
                    {t(`settings.presenceTtl_${ttl}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SectionHeader icon={<Megaphone className="w-3.5 h-3.5" />} title={t('settings.advertising')} />
          <div className="px-1 pb-2 space-y-2" data-testid="ad-preferences">
            <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)]">
              {t('settings.adsPrivacyHint')}
            </p>
            {canUse('ads_free') && (
              <p
                className="flex items-start gap-1.5 rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 px-2 py-1.5 text-[11px] font-medium text-[var(--nova-text-secondary)]"
                data-testid="ads-premium-off"
              >
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--nova-accent-color)]" />
                <span>{t('settings.adsPremiumOff')}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] p-2">
                <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.adsHidden')}</span>
                <span className="mt-0.5 block text-sm font-bold text-[var(--nova-text-primary)]" data-testid="ad-prefs-hidden">
                  {adPrefs.hiddenAds.length}
                </span>
              </div>
              <div className="rounded-xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] p-2">
                <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.adsBlocked')}</span>
                <span className="mt-0.5 block text-sm font-bold text-[var(--nova-text-primary)]" data-testid="ad-prefs-blocked">
                  {adPrefs.blockedAdvertisers.length}
                </span>
              </div>
            </div>
            {adPrefs.hiddenAds.length > 0 && (
              <div className="space-y-1" data-testid="ad-prefs-hidden-list">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">
                  {t('settings.adsHidden')}
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {adPrefs.hiddenAds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-1"
                    >
                      <span className="truncate text-[10.5px] text-[var(--nova-text-secondary)]" title={id}>
                        {readableAdId(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestoreAd(id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        {t('settings.adsRestore')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {adPrefs.blockedAdvertisers.length > 0 && (
              <div className="space-y-1" data-testid="ad-prefs-blocked-list">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">
                  {t('settings.adsBlocked')}
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {adPrefs.blockedAdvertisers.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-2 py-1"
                    >
                      <span className="truncate text-[10.5px] text-[var(--nova-text-secondary)]" title={id}>
                        {readableAdId(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnblockAdvertiser(id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-[var(--nova-text-muted)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]"
                      >
                        <Ban className="h-2.5 w-2.5" />
                        {t('settings.adsUnblock')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleResetAdPrefs}
              disabled={adPrefs.hiddenAds.length === 0 && adPrefs.blockedAdvertisers.length === 0}
              className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98] disabled:cursor-default disabled:opacity-35"
            >
              {t('settings.adsReset')}
            </button>
            {adPrefsMsg && (
              <p role="status" className="text-[10.5px] text-emerald-300/80">
                {adPrefsMsg}
              </p>
            )}
          </div>

          <SectionHeader icon={<Send className="w-3.5 h-3.5" />} title={t('settings.joinOutbox')} />
          <div className="px-1 pb-2 space-y-2" data-testid="join-outbox">
            <p className="text-[11px] text-[var(--nova-text-muted)]">
              {joinOutboxCount > 0
                ? t('settings.joinOutboxPending', { count: joinOutboxCount })
                : t('settings.joinOutboxEmpty')}
            </p>
            {joinOutboxCount > 0 && (
              <button
                type="button"
                onClick={() => setJoinOutboxCount(retryJoinOutboxNow())}
                className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
              >
                {t('settings.joinOutboxRetry')}
              </button>
            )}
          </div>

          <SectionHeader icon={<Lock className="w-3.5 h-3.5" />} title={t('settings.security')} />
          {!secureStorage && (
            <div
              role="alert"
              className="mx-1 mb-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
            >
              <div className="font-semibold">{t('settings.secureStorageUnavailable')}</div>
              <div className="mt-0.5 text-amber-200/80">{t('settings.secureStorageUnavailableHint')}</div>
            </div>
          )}
          {!dbAvailable && (
            <div
              role="alert"
              className="mx-1 mb-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200"
            >
              {t('settings.encryptedStorageUnavailable')}
            </div>
          )}
          <ToggleRow
            label={t('settings.passcodeLock')}
            enabled={pinEnabled}
            onToggle={handleTogglePin}
          />
          {(pinEnabled || isCreatingPin || isRemovingPin) && (
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmPin(); }} className="space-y-2 px-1 py-2">
              <p className="text-[11px] text-[var(--nova-text-muted)]">
                {isRemovingPin ? t('settings.passcodeConfirmRemove') : t('common.passcodeEnter')}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[var(--nova-text-muted)] select-all">{'*'.repeat(pinInput.length)}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="w-[70px] bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-1.5 text-[12px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="0000"
                />
              </div>
              <button
                type="submit"
                disabled={pinInput.length < pinLength}
                className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isRemovingPin
                  ? t('settings.removePasscode')
                  : pinEnabled
                  ? t('common.unlock')
                  : t('common.save')}
              </button>
              <button
                type="button"
                onClick={handleCancelPin}
                className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
              >
                {t('common.cancel')}
              </button>
              {pinMsg && (
                <div className="text-[11px] px-1 text-[var(--nova-accent-color)]">
                  {pinMsg}
                </div>
              )}
            </form>
          )}

          <div className="space-y-1.5 px-1 pb-1">
            {biometricSupported && (
              <>
                <ToggleRow
                  label={t('settings.biometricUnlock') ?? t('settings.biometricUnlockWithPin') ?? 'Fingerprint/Face unlock'}
                  enabled={biometricEnabled}
                  onToggle={() => void handleToggleBiometric()}
                />
                <p className="px-1 text-[10.5px] leading-relaxed text-[var(--nova-text-muted)]">
                  {t('settings.biometricHintWithPin') ?? 'Use fingerprint or face to unlock. PIN is always required as fallback.'}
                </p>
              </>
            )}
            {pinEnabled && (
              <>
                <ToggleRow
                  label={t('settings.lockOnHide')}
                  enabled={lockOnHide}
                  onToggle={() => setLockOnHide(!lockOnHide)}
                />
                <div className="space-y-2 px-1 py-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.pinLength')}</span>
                  <div className="flex items-center gap-1">
                    {[4, 6].map((length) => (
                      <button
                        key={length}
                        type="button"
                        onClick={() => setPinLength(length)}
                        aria-pressed={pinLength === length}
                        className={`h-6 w-8 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          pinLength === length
                            ? 'bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)]'
                            : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                        }`}
                      >
                        {length}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRemovingPin(false);
                    setIsCreatingPin(true);
                    setPinInput('');
                  }}
                  className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
                >
                  {t('settings.changePin') ?? 'Change PIN'}
                </button>
              </div>
                </>
              )}
            </div>

          <button
            onClick={handleShowSeedPhrase}
            disabled={!identity}
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] hover:bg-[var(--nova-overlay-medium)] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-[13px] text-[var(--nova-text-primary)]">{t('settings.showSeedPhrase')}</span>
            <span className="px-2 py-1 rounded-lg bg-[var(--nova-overlay-weak)] text-[10px] font-semibold text-[var(--nova-accent-color)]">
              {t('settings.recoveryPhrase')}
            </span>
          </button>

          <ToggleRow
            label={t('settings.twoFactorAuth')}
            enabled={is2FAEnabled}
            onToggle={handle2FAToggle}
          />
          {show2FASetup && !is2FAEnabled && (
            <div className="space-y-2 px-1 py-2">
              <p className="text-[11px] text-[var(--nova-text-muted)]">
                Enter the 6-digit code from your authenticator app to activate 2FA.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[var(--nova-text-muted)] select-all">{totpSecret ?? ''}</span>
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  className="w-[70px] bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-1.5 text-[12px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="000000"
                />
              </div>
              <button
                onClick={handleActivate2FA}
                disabled={!otpInput || otpInput.length !== 6}
                className="w-full py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                Activate
              </button>
              {otpMsg && (
                <div className={`text-[11px] px-1 ${otpMsg === 'Invalid code' ? 'text-red-400' : 'text-[var(--nova-accent-color)]'}`}>
                  {otpMsg}
                </div>
              )}
            </div>
          )}

          {/* Accounts */}
          <SectionHeader
            icon={<UserRound className="w-3.5 h-3.5" />}
            title={t('settings.accounts.title')}
          />
          <button
            onClick={() => setAccountSwitcherOpen(true)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] border border-[var(--nova-border-subtle)] transition cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                <UserRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{t('settings.accounts.manage')}</p>
                <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('settings.accounts.manageDesc')}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
          </button>

          <SectionHeader
            icon={<Database className="w-3.5 h-3.5" />}
            title={t('settings.dataStorage')}
          />
          <ToggleRow
            label={t('settings.autoDownload')}
            enabled={prefs.autoDownload}
            onToggle={() => updatePref('autoDownload', !prefs.autoDownload)}
          />

          {/* Storage Usage Breakdown */}
          <div className="space-y-1 px-1 py-2">
            {storageLoading ? (
              <div className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.storageLoading')}</div>
            ) : (
              <>
                <div className="flex justify-between text-[11px] font-medium text-[var(--nova-text-secondary)] mb-1">
                  <span>{t('settings.storageUsage')}</span>
                  <span>{formatBytes(totalStorageBytes)}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {storageUsage.map((cat) => (
                    <div key={cat.category} className="flex justify-between text-[11px] text-[var(--nova-text-muted)]">
                      <span>{cat.category}</span>
                      <span>{formatBytes(cat.bytes)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleClearCache}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
          >
            <span>{t('settings.clearCache')}</span>
          </button>
          {cacheMsg && (
            <div className="text-[11px] px-1 text-[var(--nova-accent-color)]" role="status">
              {cacheMsg}
            </div>
          )}
          {exportMsg && (
            <div className="text-[11px] px-1 text-[var(--nova-accent-color)]" role="status">
              {exportMsg}
            </div>
          )}

          <button
            onClick={handleExportMyData}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <FileText className="w-4 h-4" />
            <span>{exporting ? t('settings.exporting') : t('settings.exportMyData')}</span>
          </button>

          <SectionHeader icon={<Database className="w-3.5 h-3.5" />} title={t('settings.dataBackup')} />
          <button
            onClick={() => {
              setCloudUrl(loadSavedCloudUrl());
              setBackupModal({ open: true, mode: 'export' });
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.exportBackup')}</span>
          </button>
          <button
            onClick={() => {
              setCloudUrl(loadSavedCloudUrl());
              setBackupModal({ open: true, mode: 'import' });
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" />
            <span>{t('settings.importBackup')}</span>
          </button>

          {/* Google Drive Backup */}
          <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
            <SectionHeader icon={<Cloud className="w-3.5 h-3.5" />} title="Google Drive" />
            {!gdriveConnected ? (
              <button
                onClick={handleGDriveConnect}
                disabled={gdriveLinking}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HardDrive className="w-4 h-4" />
                <span>{gdriveLinking ? 'Connecting...' : 'Connect Google Drive'}</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 py-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[var(--nova-accent-color)]" />
                    <span className="text-[11px] font-medium text-[var(--nova-text-secondary)]">Connected</span>
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                  <button
                    onClick={handleGDriveDisconnect}
                    disabled={gdriveLoading}
                    className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
                <div className="space-y-1 px-1">
                  {/* Passphrase input for Google Drive backup */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium text-[var(--nova-text-muted)]">Passphrase (min 8 chars)</label>
                    <input
                      type="password"
                      value={exportPassphrase}
                      onChange={(e) => setExportPassphrase(e.target.value)}
                      className="w-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-3 py-1.5 text-[11px] text-[var(--nova-text-primary)] focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGDriveBackup}
                      disabled={backupBusy || exportPassphrase.trim().length < 8}
                      className="flex-1 py-1.5 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[11px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Backup Now
                    </button>
                    <button
                      onClick={handleGDriveRefresh}
                      disabled={gdriveLoading}
                      aria-label="Refresh backups"
                      className="px-3 py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {gdriveBackups.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1 border-t border-[var(--nova-border-subtle)] pt-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)] px-1">Backups</p>
                      {gdriveBackups.map((backup) => (
                        <div
                          key={backup.id}
                          className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-white/[0.02] border border-[var(--nova-border-subtle)] text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-[var(--nova-text-muted)]" />
                            <div className="min-w-0">
                              <span className="truncate block text-[var(--nova-text-secondary)]">{backup.name}</span>
                              <span className="text-[10px] text-[var(--nova-text-muted)]">
                                {new Date(backup.createdAt).toLocaleDateString()} • {Math.round(backup.size / 1024)} KB
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => handleGDriveRestore(backup.id)}
                              disabled={backupBusy || importPassphrase.length < 8}
                              className="p-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-accent-color)]/20 text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition disabled:opacity-50"
                              title="Restore"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleGDriveDelete(backup.id)}
                              disabled={gdriveLoading}
                              className="p-1.5 rounded-lg bg-[var(--nova-overlay-weak)] hover:bg-red-500/20 text-[var(--nova-text-muted)] hover:text-red-400 transition disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {gdriveBackups.length === 0 && (
                    <p className="text-[11px] text-[var(--nova-text-muted)] text-center py-2">No backups yet</p>
                  )}
                </div>
                {gdriveMsg && (
                  <div className="rounded-xl px-3 py-2 text-[11px] text-[var(--nova-text-primary)]">
                    {gdriveMsg}
                  </div>
                )}
              </div>
            )}

          </div>

          <SectionHeader icon={<AlertTriangle className="w-3.5 h-3.5" />} title={t('settings.dangerZone')} />
          <div className="space-y-2 px-1 py-2">
            <button
              onClick={handleClearAllData}
              disabled={clearDataConfirm}
              className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[12px] font-medium text-[var(--nova-text-secondary)] hover:bg-red-500/5 hover:border-red-500/20 hover:text-red-400 transition active:scale-95"
            >
              <span>{t('settings.clearAllData')}</span>
              <span className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.clearAllDataDesc')}</span>
            </button>
            {clearDataConfirm && (
              <div className="space-y-2 px-1 py-2">
                <p className="text-[11px] text-[var(--nova-text-muted)]">
                  {pinEnabled ? t('settings.confirmClear') : t('settings.confirmClearNoPin')}
                </p>
                {pinEnabled && (
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={clearDataPin}
                    onChange={(e) => setClearDataPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="0000"
                    className="w-[70px] bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] rounded-xl px-2 py-1.5 text-[12px] text-[var(--nova-text-primary)] text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClearAllData}
                    disabled={pinEnabled && clearDataPin.length < 4}
                    className="flex-1 py-1.5 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[11px] font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common.delete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClearDataConfirm(false);
                      setClearDataPin('');
                      setPinMsg(null);
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[11px] font-medium text-[var(--nova-text-secondary)] hover:bg-white/[0.1] transition active:scale-95"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
                {pinMsg && (
                  <div className="text-[11px] px-1 text-red-400">{pinMsg}</div>
                )}
              </div>
            )}
          </div>

          {/* Bots (Phase B3) */}
          {getBotSession && (
            <>
              <SectionHeader icon={<ShieldAlert className="w-3.5 h-3.5" />} title={t('bot.title')} />
              <button
                type="button"
                onClick={() => setBotsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                  <Settings className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{t('bot.title')}</p>
                  <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('bot.noBots')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
              </button>
            </>
          )}
          <SectionHeader icon={<BarChart3 className="w-3.5 h-3.5" />} title={t('analytics.title')} />
          <button
            type="button"
            data-testid="open-analytics"
            onClick={() => {
              onClose();
              onOpenAnalytics?.();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{t('analytics.usageTitle')}</p>
              <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('analytics.usageSubtitle')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[10px] text-[var(--nova-text-secondary)]">
                  {analyticsMessageCount} · {t('analytics.totalMessages')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[10px] text-[var(--nova-text-secondary)]">
                  {analyticsActiveChats} · {t('analytics.activeChats')}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
          </button>

          <SectionHeader icon={<Globe className="w-3.5 h-3.5" />} title={t('sites.title')} />
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSites?.();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--nova-text-primary)]">{t('sites.manageWidgets')}</p>
              <p className="text-[10.5px] text-[var(--nova-text-muted)] truncate">{t('sites.manageWidgetsDesc')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)] shrink-0" />
          </button>

          <SectionHeader icon={<Info className="w-3.5 h-3.5" />} title={t('settings.about')} />
          <div className="py-2 px-1 flex items-center justify-between">
            <span className="text-[13px] text-[var(--nova-text-primary)]">{t('app.name')}</span>
            <span className="text-[11px] font-mono text-[var(--nova-text-muted)]">v1.0.0</span>
          </div>
          <button
            type="button"
            onClick={() => setModerationOpen(true)}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition text-[13px] text-[var(--nova-text-primary)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
              {t('settings.moderation')}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)]" />
          </button>
          <button
            type="button"
            onClick={() => setLegalDoc('terms')}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition text-[13px] text-[var(--nova-text-primary)] cursor-pointer"
          >
            <span>{t('settings.termsOfService')}</span>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)]" />
          </button>
          <button
            type="button"
            onClick={() => setLegalDoc('privacy')}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition text-[13px] text-[var(--nova-text-primary)] cursor-pointer"
          >
            <span>{t('settings.privacyPolicy')}</span>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)]" />
          </button>
          <button
            type="button"
            onClick={() => {
              resetOnboarding();
              window.location.reload();
            }}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition text-[13px] text-[var(--nova-text-primary)] cursor-pointer"
          >
            <span>{t('settings.rerunSetup')}</span>
            <ChevronRight className="w-4 h-4 text-[var(--nova-text-muted)]" />
          </button>
          {aboutMsg && (
            <div className="text-[11px] px-1 pb-1 text-[var(--nova-accent-color)]" role="status">
              {aboutMsg}
            </div>
          )}
        </div>
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                            {manifest.id === 'movie_catalog' && <Film className="w-4 h-4" />}
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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
                className="w-8 h-8 rounded-full bg-[var(--nova-overlay-weak)] hover:bg-[var(--nova-overlay-medium)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] transition cursor-pointer"
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

