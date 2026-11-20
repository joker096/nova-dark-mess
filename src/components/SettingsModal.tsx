import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Bell, Lock, Database, Palette, Info, Languages, Download, Upload, FileText, Moon, Monitor, Sun, Copy, AlertTriangle, Sparkles, DollarSign, Send, BarChart3, ChevronRight, ShieldAlert, Megaphone, RotateCcw, Ban, Settings } from 'lucide-react';
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
  clearLocalAdPrefs,
  loadAdPreferences,
  restoreHiddenAd,
  unblockAdvertiser,
  type LocalAdPreferences,
} from '../lib/ads/localAds';
import { loadSoundId, playSound, saveSoundId, SOUND_IDS, SOUNDS, type SoundId } from '../lib/notifications/sounds';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { CryptoCheckoutModal } from './CryptoCheckoutModal';
import { LegalModal } from './LegalModal';
import { SanctionScreen } from './SanctionScreen';
import {
  ACCENT_COLORS,
  APP_THEME_KEY,
  FONT_SIZE_KEY,
  FontSize,
  applyAppTheme,
  applyAccentColor,
  applyFontSize,
  readAppTheme,
} from '../lib/ui/appearance';

import type { BotSession } from '../lib/bots/session';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnalytics?: () => void;
  /** Bot session for Settings → Bots management (Phase B3). */
  getBotSession?: () => BotSession;
  /** Pending bot install from deep link (Phase B3). */
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  /** Called when the bot install flow is handled (dismissed or completed). */
  onBotInstallHandled?: () => void;
  /** Opens (or starts) a conversation with an installed bot. */
  onOpenBotChat?: (botId: string) => void;
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
  autoDownload: boolean;
  fontSize: FontSize;
}

const DEFAULT_PREFS: Prefs = {
  notificationSound: true,
  vibration: false,
  previewMessages: true,
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
  { value: 'default', grad: 'from-[var(--nova-accent-color, ff521a)] to-[var(--nova-accent-color, ff3b00)]' },
  { value: 'sapphire', grad: 'from-[#1E3A8A] to-[#3B82F6]' },
  { value: 'amethyst', grad: 'from-[#4C1D95] to-[#8B5CF6]' },
  { value: 'emerald', grad: 'from-[#064E3B] to-[#10B981]' },
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
    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c919d]">{title}</span>
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
    className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer"
  >
    <span className="text-[13px] text-white/90 group-hover:text-white transition">{label}</span>
    <span
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
        enabled ? 'bg-[var(--nova-accent-color)]' : 'bg-white/10'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200 ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenAnalytics,
  getBotSession,
  pendingBotInstall,
  onBotInstallHandled,
  onOpenBotChat,
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
  const [torStatus, setTorStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [newRelayOperator, setNewRelayOperator] = useState('');
  const [joinOutboxCount, setJoinOutboxCount] = useState<number>(() => loadJoinOutbox().length);
  const [adPrefs, setAdPrefs] = useState<LocalAdPreferences>(() => loadAdPreferences());
  const [adPrefsMsg, setAdPrefsMsg] = useState<string | null>(null);
  const [soundId, setSoundId] = useState<SoundId>(loadSoundId);

  // Relay queue length and local ad preferences can change while the modal is closed.
  useEffect(() => {
    if (!isOpen) return;
    setJoinOutboxCount(loadJoinOutbox().length);
    setAdPrefs(loadAdPreferences());
    setAdPrefsMsg(null);
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
  const [moderationOpen, setModerationOpen] = useState(false);

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

  const getBots = useCallback(() => {
    const session = getBotSession?.();
    return session ? session.listBots() : [];
  }, [getBotSession]);

  const toggleBot = useCallback(
    (botId: string, enabled: boolean) => {
      const session = getBotSession?.();
      if (!session) return;
      void session.setBotEnabled(botId, enabled).catch((err) => {
        console.error('Failed to toggle bot:', err);
      });
    },
    [getBotSession],
  );

  const uninstallBot = useCallback(
    (botId: string) => {
      const session = getBotSession?.();
      if (!session) return;
      void session.uninstallBot(botId).catch((err) => {
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
        className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md text-white shadow-2xl max-h-[calc(100dvh-2rem-var(--nova-safe-top)-var(--nova-safe-bottom))] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 id="settings-title" className="font-bold text-sm text-white leading-tight">{t('settings.title')}</h3>
              <p className="text-[10.5px] text-[#828795]">{t('app.name')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
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
            <div className="text-[13px] text-white/90 mb-1.5 px-1">{t('settings.theme')}</div>
            <div className="flex gap-1">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAppTheme(opt.value)}
                  className={`flex-1 flex items-center gap-2 py-2 px-2.5 rounded-xl border transition cursor-pointer ${
                    appTheme === opt.value
                      ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 text-white'
                      : 'bg-white/[0.03] border-transparent text-white/60 hover:bg-white/[0.06]'
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
            <div className="text-[13px] text-white/90 mb-1.5 px-1">{t('settings.fontSize')}</div>
            <div className="flex gap-1.5">
              {fontSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updatePref('fontSize', opt.value)}
                  className={`flex-1 flex flex-col items-center py-2 rounded-xl border transition cursor-pointer ${
                    prefs.fontSize === opt.value
                      ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 text-white'
                      : 'bg-white/[0.03] border-transparent text-white/60 hover:bg-white/[0.06]'
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
              <div className="text-[13px] text-white/90">{t('settings.chatColors')}</div>
              <span className="text-[10px] text-[#8c919d]">{t('settings.chatColorsDesc')}</span>
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
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border transition cursor-pointer relative overflow-hidden ${
                      chatColorTheme === opt.value
                        ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/40 shadow-sm shadow-[var(--nova-accent-color)]/25'
                        : 'bg-white/[0.03] border-transparent hover:bg-white/[0.06]'
                    }${opt.value !== 'default' && !canUse('chat_themes') ? ' opacity-60' : ''}`}
                  >
                    <div className="relative w-6 h-6 rounded-full border border-white/20 shadow-sm overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-tr ${opt.grad}`} />
                      <div className="absolute inset-1 rounded-full bg-white/30" />
                      {opt.value !== 'default' && !canUse('chat_themes') && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                          <Lock className="w-3 h-3 text-white/90" />
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium ${opt.value !== 'default' && !canUse('chat_themes') ? 'text-[#8c919d]' : ''}`}>{label}</span>
                    {opt.value !== 'default' && !canUse('chat_themes') && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--nova-accent-color)] text-[var(--nova-accent-color)] flex items-center justify-center text-[10px] font-bold">
                        <Lock className="w-2 h-2 fill-white" />
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
            <div className="text-[13px] text-white/90 mb-1.5 px-1">
              {t('settings.premiumDesc')}
            </div>

            {freeDaysRemaining() > 0 && (
              <div className="mb-2 px-1 py-1.5 rounded-xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 text-xs text-[var(--nova-accent-color)]">
                {t('settings.premiumFreeTrial', { days: freeDaysRemaining() })}
              </div>
            )}

            <button
              onClick={checkout}
              className={`w-full py-2.5 px-4 rounded-xl border transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-md ${
                premium
                  ? 'bg-[var(--nova-accent-color)] text-white border-[var(--nova-accent-color)] shadow-lg shadow-[var(--nova-accent-color)]/25'
                  : 'bg-white/[0.03] border-transparent text-white/60 hover:bg-white/[0.06] hover:border-[var(--nova-accent-color)]/30'
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
              className="w-full py-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 hover:text-white text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition cursor-pointer ${
                    soundId === id
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-white'
                      : 'border-white/10 text-white/60 hover:bg-white/[0.06]'
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
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[#8c919d]">
              {t('settings.webrtcRelayOnlyHint')}
            </p>
          )}

          <SectionHeader
            icon={<ShieldAlert className="w-3.5 h-3.5" />}
            title={t('settings.anonymity')}
          />

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
              <p className="text-[11px] leading-relaxed text-[#8c919d]">
                {t('settings.multiRelayHint')}
              </p>
              <div className="space-y-1.5">
                {privacyPrefs.relayEndpoints.map((relay) => (
                  <div
                    key={relay.id}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.02]"
                  >
                    <span className="flex-1 text-[11px] text-white/80 truncate">
                      {relay.url}
                    </span>
                    {relay.operator && (
                      <span className="text-[10px] text-[#8c919d] truncate max-w-[120px]">
                        {relay.operator}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRelay(relay.id)}
                      className="w-6 h-6 rounded-full border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition"
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
                  className="flex-1 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <input
                  type="text"
                  placeholder={t('settings.relayOperator')}
                  value={newRelayOperator}
                  onChange={(e) => setNewRelayOperator(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={addRelay}
                  disabled={!newRelayUrl.trim()}
                  className="px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] font-medium text-white transition hover:bg-white/[0.06] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('settings.addRelay')}
                </button>
              </div>
              <p className="text-[10px] text-[#8c919d]">
                Queues rotate between relays weekly so no single operator sees a contact's full history.
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
              <p className="text-[11px] leading-relaxed text-[#8c919d]">
                {t('settings.torModeHint')}
              </p>
              <div className="flex items-center gap-1.5 px-1 py-1">
                <span className="text-[11px] text-white/60">{t('settings.torSocksPort')}</span>
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
                  className="w-20 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white focus:outline-none focus:border-[var(--nova-accent-color)]/50"
                />
                <button
                  type="button"
                  onClick={checkTor}
                  disabled={torStatus === 'checking'}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition ${
                    torStatus === 'checking'
                      ? 'border-[#8c919d]/40 text-[#8c919d] cursor-wait'
                      : 'border-white/10 bg-white/[0.03] text-white/90 hover:bg-white/[0.06]'
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
                        : 'text-[#8c919d]'
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
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[#8c919d]">
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
            }}
          />
          {privacyPrefs.crashReports && (
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[#8c919d]">
              {t('analytics.crashReportsHint')}
            </p>
          )}
          {privacyPrefs.metadataMinimization && (
            <p className="px-1 -mt-1 pb-2 text-[11px] text-[#8c919d]">
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
              <p className="text-[11px] text-[#8c919d]">{t('settings.presenceSharingHint')}</p>
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
                        ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-white'
                        : 'border-white/10 text-white/60 hover:bg-white/[0.06]'
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
            <p className="text-[11px] leading-relaxed text-[#8c919d]">
              {t('settings.adsPrivacyHint')}
            </p>
            {canUse('ads_free') && (
              <p
                className="flex items-start gap-1.5 rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 px-2 py-1.5 text-[11px] font-medium text-white/80"
                data-testid="ads-premium-off"
              >
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--nova-accent-color)]" />
                <span>{t('settings.adsPremiumOff')}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <span className="text-[10px] text-[#8c919d]">{t('settings.adsHidden')}</span>
                <span className="mt-0.5 block text-sm font-bold text-white" data-testid="ad-prefs-hidden">
                  {adPrefs.hiddenAds.length}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <span className="text-[10px] text-[#8c919d]">{t('settings.adsBlocked')}</span>
                <span className="mt-0.5 block text-sm font-bold text-white" data-testid="ad-prefs-blocked">
                  {adPrefs.blockedAdvertisers.length}
                </span>
              </div>
            </div>
            {adPrefs.hiddenAds.length > 0 && (
              <div className="space-y-1" data-testid="ad-prefs-hidden-list">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c919d]">
                  {t('settings.adsHidden')}
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {adPrefs.hiddenAds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1"
                    >
                      <span className="truncate text-[10.5px] text-white/60" title={id}>
                        {readableAdId(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestoreAd(id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white/45 transition hover:bg-white/5 hover:text-white"
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c919d]">
                  {t('settings.adsBlocked')}
                </p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {adPrefs.blockedAdvertisers.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1"
                    >
                      <span className="truncate text-[10.5px] text-white/60" title={id}>
                        {readableAdId(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnblockAdvertiser(id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white/45 transition hover:bg-white/5 hover:text-white"
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
              className="w-full py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70 hover:text-white transition cursor-pointer active:scale-[0.98] disabled:cursor-default disabled:opacity-35"
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
            <p className="text-[11px] text-[#8c919d]">
              {joinOutboxCount > 0
                ? t('settings.joinOutboxPending', { count: joinOutboxCount })
                : t('settings.joinOutboxEmpty')}
            </p>
            {joinOutboxCount > 0 && (
              <button
                type="button"
                onClick={() => setJoinOutboxCount(retryJoinOutboxNow())}
                className="w-full py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70 hover:text-white transition cursor-pointer active:scale-[0.98]"
              >
                {t('settings.joinOutboxRetry')}
              </button>
            )}
          </div>

          <SectionHeader icon={<Lock className="w-3.5 h-3.5" />} title={t('settings.security')} />
          <ToggleRow
            label={t('settings.passcodeLock')}
            enabled={pinEnabled}
            onToggle={handleTogglePin}
          />
          {(pinEnabled || isCreatingPin || isRemovingPin) && (
            <div className="space-y-2 px-1 py-2">
              <p className="text-[11px] text-[#8c919d]">
                {isRemovingPin ? t('settings.passcodeConfirmRemove') : t('common.passcodeEnter')}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#8c919d] select-all">{'*'.repeat(pinInput.length)}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="w-[70px] bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5 text-[12px] text-white text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="0000"
                />
              </div>
              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={pinInput.length < pinLength}
                className="w-full py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
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
                className="w-full py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] font-medium text-white/60 hover:text-white transition cursor-pointer active:scale-[0.98]"
              >
                {t('common.cancel')}
              </button>
              {pinMsg && (
                <div className="text-[11px] px-1 text-[var(--nova-accent-color)]">
                  {pinMsg}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 px-1 pb-1">
              <ToggleRow
                label={t('settings.biometricUnlock') ?? t('settings.biometricUnlockWithPin') ?? 'Fingerprint/Face unlock'}
                enabled={biometricEnabled}
                onToggle={() => void handleToggleBiometric()}
              />
              <p className="px-1 text-[10.5px] leading-relaxed text-[#8c919d]">
                {biometricSupported
                  ? (t('settings.biometricHintWithPin') ?? 'Use fingerprint or face to unlock. PIN is always required as fallback.')
                  : t('settings.biometricUnavailable')}
              </p>
              {pinEnabled && (
                <>
              <ToggleRow
                label={t('settings.lockOnHide')}
                enabled={lockOnHide}
                onToggle={() => setLockOnHide(!lockOnHide)}
              />
              <div className="space-y-2 px-1 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-white/90">{t('settings.pinLength')}</span>
                  <div className="flex items-center gap-1">
                    {[4, 6].map((length) => (
                      <button
                        key={length}
                        type="button"
                        onClick={() => setPinLength(length)}
                        aria-pressed={pinLength === length}
                        className={`h-6 w-8 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                          pinLength === length
                            ? 'bg-[var(--nova-accent-color)] text-white'
                            : 'bg-white/[0.06] text-white/60 hover:text-white'
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
                  className="w-full py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70 hover:text-white transition cursor-pointer active:scale-[0.98]"
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
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-[13px] text-white/90">{t('settings.showSeedPhrase')}</span>
            <span className="px-2 py-1 rounded-lg bg-white/5 text-[10px] font-semibold text-[var(--nova-accent-color)]">
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
              <p className="text-[11px] text-[#8c919d]">
                Enter the 6-digit code from your authenticator app to activate 2FA.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#8c919d] select-all">{totpSecret ?? ''}</span>
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  className="w-[70px] bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5 text-[12px] text-white text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="000000"
                />
              </div>
              <button
                onClick={handleActivate2FA}
                disabled={!otpInput || otpInput.length !== 6}
                className="w-full py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/70 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
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
              <div className="text-[11px] text-[#8c919d]">{t('settings.storageLoading')}</div>
            ) : (
              <>
                <div className="flex justify-between text-[11px] font-medium text-white/70 mb-1">
                  <span>{t('settings.storageUsage')}</span>
                  <span>{formatBytes(totalStorageBytes)}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {storageUsage.map((cat) => (
                    <div key={cat.category} className="flex justify-between text-[11px] text-[#8c919d]">
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
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-[0.98]"
          >
            <span>{t('settings.clearCache')}</span>
          </button>
          {cacheMsg && (
            <div className="text-[11px] px-1 text-[var(--nova-accent-color)]" role="status">
              {cacheMsg}
            </div>
          )}

          <SectionHeader icon={<Database className="w-3.5 h-3.5" />} title={t('settings.dataBackup')} />
          <button
            onClick={() => {
              setCloudUrl(loadSavedCloudUrl());
              setBackupModal({ open: true, mode: 'export' });
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.exportBackup')}</span>
          </button>
          <button
            onClick={() => {
              setCloudUrl(loadSavedCloudUrl());
              setBackupModal({ open: true, mode: 'import' });
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" />
            <span>{t('settings.importBackup')}</span>
          </button>

          <SectionHeader icon={<AlertTriangle className="w-3.5 h-3.5" />} title={t('settings.dangerZone')} />
          <div className="space-y-2 px-1 py-2">
            <button
              onClick={handleClearAllData}
              disabled={clearDataConfirm}
              className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-red-500/5 hover:border-red-500/20 hover:text-red-400 transition active:scale-95"
            >
              <span>{t('settings.clearAllData')}</span>
              <span className="text-[10px] text-[#8c919d]">{t('settings.clearAllDataDesc')}</span>
            </button>
            {clearDataConfirm && (
              <div className="space-y-2 px-1 py-2">
                <p className="text-[11px] text-[#8c919d]">
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
                    className="w-[70px] bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5 text-[12px] text-white text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
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
                    className="flex-1 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] font-medium text-white/60 hover:bg-white/[0.1] transition active:scale-95"
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                  <Settings className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white/90">{t('bot.title')}</p>
                  <p className="text-[10.5px] text-[#8c919d] truncate">{t('bot.noBots')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-left hover:bg-white/[0.07] transition cursor-pointer active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white/90">{t('analytics.usageTitle')}</p>
              <p className="text-[10.5px] text-[#8c919d] truncate">{t('analytics.usageSubtitle')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[10px] text-white/70">
                  {analyticsMessageCount} · {t('analytics.totalMessages')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-[10px] text-white/70">
                  {analyticsActiveChats} · {t('analytics.activeChats')}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
          </button>

          <SectionHeader icon={<Info className="w-3.5 h-3.5" />} title={t('settings.about')} />
          <div className="py-2 px-1 flex items-center justify-between">
            <span className="text-[13px] text-white/90">{t('app.name')}</span>
            <span className="text-[11px] font-mono text-[#8c9195]">v1.0.0</span>
          </div>
          <button
            type="button"
            onClick={() => setModerationOpen(true)}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
              {t('settings.moderation')}
            </span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
          <button
            type="button"
            onClick={() => setLegalDoc('terms')}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span>{t('settings.termsOfService')}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
          <button
            type="button"
            onClick={() => setLegalDoc('privacy')}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span>{t('settings.privacyPolicy')}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
          <button
            type="button"
            onClick={() => {
              resetOnboarding();
              window.location.reload();
            }}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span>{t('settings.rerunSetup')}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
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
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">
                {backupModal.mode === 'export' ? t('settings.exportBackup') : t('settings.importBackup')}
              </h3>
              <button
                onClick={() => setBackupModal(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[#8c919d]">
                {backupModal.mode === 'export'
                  ? 'Enter a passphrase to encrypt the backup file.'
                  : 'Select a .nova-backup file and enter the restore passphrase.'}
              </p>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-white/70">
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
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="••••••••"
                />
              </div>
              {backupModal.mode === 'import' && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-white/70">Backup file</label>
                  <button
                    onClick={() => {
                      const input = document.getElementById('backup-file-input') as HTMLInputElement | null;
                      input?.click();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer"
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
                    <p className="text-[11px] text-[#8c919d]">
                      Cloud blob ready ({Math.max(1, Math.round(importCloudBlob.size / 1024))} KB)
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <label className="block text-[11px] font-medium text-white/70">
                  Cloud endpoint (optional)
                </label>
                <input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="https://your-webdav.example/nova-latest.nova-backup"
                />
                <input
                  type="password"
                  value={cloudToken}
                  onChange={(e) => setCloudToken(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="Bearer token (optional, kept in memory)"
                />
                <p className="text-[10px] text-[#8c919d]">
                  Only the encrypted .nova-backup blob is uploaded. Keys stay on this device.
                </p>
                {backupModal.mode === 'import' && (
                  <button
                    onClick={handleDownloadFromCloud}
                    disabled={backupBusy || !cloudUrl.trim()}
                    className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-[12px] font-medium transition cursor-pointer ${
                      backupBusy || !cloudUrl.trim()
                        ? 'bg-white/[0.03] border-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border-white/10 text-white/80 hover:text-white'
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
                <div className={`rounded-xl px-3 py-2 text-[11px] text-white ${
                  backupMsg.includes('failed') || backupMsg.includes('not ready')
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)]'
                }`}>
                  {backupMsg}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/5 flex gap-2">
              <button
                onClick={() => setBackupModal(null)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
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
                className={`flex-1 py-2 rounded-xl text-[12px] font-medium text-white transition cursor-pointer ${
                  backupBusy ||
                  (backupModal.mode === 'import' &&
                    (!importFile && !importCloudBlob || importPassphrase.length < 8)) ||
                  (backupModal.mode === 'export' && exportPassphrase.trim().length < 8)
                    ? 'bg-white/[0.05] border border-white/10 text-white/40 cursor-not-allowed'
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
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('settings.showSeedPhrase')}</h3>
              <button
                onClick={() => setShowSeedPhraseModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-[#8c919d]">
                {t('settings.seedPhraseDesc')}
              </p>
              <div className="bg-[#181921] border border-white/10 rounded-xl p-2 max-h-64 overflow-y-auto font-mono text-xs text-[var(--nova-accent-color)] break-all">
                {identity.mnemonic.split(' ').map((word, i) => (
                  <span key={i} className="inline-block mr-1 mb-1 px-1 py-0.5 rounded bg-white/5">
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
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/60 hover:bg-white/[0.1] transition active:scale-95"
                >
                  {t('common.close')}
                </button>
              </div>
              <p className="text-[10px] text-[#8c919d] italic">
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

      {/* Terms / Privacy */}
      {legalDoc && <LegalModal docId={legalDoc} onClose={() => setLegalDoc(null)} />}

      {/* Bots list (Phase B3) */}
      {botsOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('bot.title')}</h3>
              <button
                onClick={() => setBotsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {getBots().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[#8c919d] text-[11px]">
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
                        className="flex items-center justify-between px-2 py-2 rounded-xl border border-white/10 bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0">
                            <Settings className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-white truncate">{bot.manifest.name}</p>
                            <p className="text-[10px] text-[#8c9198] truncate">
                              @{bot.manifest.username} · {bot.enabled ? t('bot.granted') : t('bot.disabled')}
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
                                className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center transition cursor-pointer active:scale-95"
                                title={bot.enabled ? t('bot.disable') : t('bot.enable')}
                              >
                                {bot.enabled ? <Ban className="w-3 h-3 text-red-400" /> : <Check className="w-3 h-3 text-emerald-400" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => uninstallBot(bot.manifest.id)}
                                className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center transition cursor-pointer active:scale-95 text-red-400 hover:text-red-300"
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
              <p className="px-1 pt-1 text-[10px] leading-relaxed text-[#8c919d]">
                {t('bot.openChatHint', {
                  defaultValue:
                    'Open a bot chat here. Send /start or tap the bot icon in the message field to see its commands.',
                })}
              </p>
            </div>
            <div className="p-4 border-t border-white/5 flex gap-2">
              <button
                type="button"
                onClick={() => setDevRegistryOpen(true)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('bot.createLocal', { defaultValue: 'Create local bot' })}
              </button>
              <button
                type="button"
                onClick={() => setInstallFromFile(true)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
              >
                {t('bot.installFile', { defaultValue: 'Install from file' })}
              </button>
              <button
                onClick={() => setBotsOpen(false)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
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
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('bot.install')}</h3>
              <button
                onClick={() => setInstallOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-white">{installingBot.manifest.name}</p>
                <p className="text-[10px] text-[#8c9198] mt-0.5">@{installingBot.manifest.username}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-white/70">{t('bot.permissionsRequired')}</p>
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
                        : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white'
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
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('bot.cancel')}
                </button>
                <button
                  type="button"
                  disabled={installingBot.granted.length === 0}
                  onClick={confirmInstall}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-medium text-white transition cursor-pointer ${
                    installingBot.granted.length === 0
                      ? 'bg-white/[0.03] border-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/30 hover:bg-[var(--nova-accent-color)]/20 active:scale-95'
                  }`}
                >
                  {t('bot.grantAll')}
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-white/5 flex gap-2">
              <button
                onClick={() => setBotsOpen(false)}
                className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[12px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
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
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('bot.devRegistryTitle', { defaultValue: 'Developer registry' })}</h3>
              <button
                onClick={() => setDevRegistryOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-[#8c919d] leading-relaxed">
                {t('bot.devRegistryDesc', { defaultValue: 'Create a local L1 bot. A keypair is generated in your vault and never leaves this device.' })}
              </p>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">{t('bot.name', { defaultValue: 'Name' })}</label>
                  <input
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                    placeholder="My Bot"
                    className="w-full py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">{t('bot.username', { defaultValue: 'Username' })}</label>
                  <input
                    value={devUsername}
                    onChange={(e) => setDevUsername(e.target.value)}
                    placeholder="mybot"
                    className="w-full py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">{t('bot.description', { defaultValue: 'Description' })}</label>
                  <input
                    value={devDesc}
                    onChange={(e) => setDevDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-white focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  />
                </div>
              </div>
              {devError && <div className="text-[10px] text-red-400">{devError}</div>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDevRegistryOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={devCreating || !devName || !devUsername}
                  onClick={createLocalBot}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-medium text-white transition cursor-pointer ${
                    devCreating || !devName || !devUsername
                      ? 'bg-white/[0.03] border-white/10 text-white/40 cursor-not-allowed'
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
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('bot.installFileTitle', { defaultValue: 'Install from file' })}</h3>
              <button
                onClick={() => setInstallFromFile(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-[#8c919d] leading-relaxed">
                {t('bot.installFileDesc', { defaultValue: 'Select a bot manifest JSON file to install.' })}
              </p>
              <label className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:border-[var(--nova-accent-color)]/50 transition cursor-pointer">
                <Upload className="w-6 h-6 text-white/50" />
                <p className="text-[11px] font-medium text-white">{t('bot.chooseFile', { defaultValue: 'Choose manifest file' })}</p>
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
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <p className="text-[11px] font-semibold text-white truncate">{fileManifest.name}</p>
                  <p className="text-[10px] text-[#8c9198] mt-0.5">@{fileManifest.username}</p>
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
                  className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] font-medium text-white/60 hover:bg-white/[0.1] transition cursor-pointer"
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
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-white/10 text-white text-xs px-3.5 py-2 rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
    )}
    </div>
  );
};

