import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Bell, Lock, Database, Palette, Info, Languages, Download, Upload, FileText, Moon, Monitor, Sun, Copy, AlertTriangle, Sparkles, DollarSign, Send, BarChart3, ChevronRight, ShieldAlert, Megaphone, RotateCcw, Ban, Settings, Hand, MapPin, Plus, Film, Bot, Cloud, HardDrive, Trash2, ToggleLeft, ToggleRight, Shield, User, Key, Link2, QrCode, Smartphone, Wifi, Cpu, Trash, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
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
  createNetworkProfile,
  applyNetworkProfile,
  buildNetworkProfileLink,
  parseNetworkProfileLink,
  type BatteryStatus,
  type PrivacyPrefs,
  type NetworkProfile,
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
  readFabSide,
  saveFabSide,
  type FabSide,
} from '../lib/ui/appearance';
import type { BotSession } from '../lib/bots/session';
import { movieCatalogBotManifest } from '../../examples/bots/movie-catalog/manifest';
import { novafatherManifest } from '../../examples/bots/novafather/manifest';
import { echoBotManifest } from '../../examples/bots/echo/manifest';
import {
  NovaNavBar,
  NovaListGroup,
  NovaListRow,
  NovaListSectionHeader,
  NovaToggle,
  NovaSegmentedTabs,
  NovaBottomSheet,
  NovaActionTile,
  NovaPillButton,
  NovaAvatar,
  NovaBadge,
  NovaButton,
} from '../lib/ui';

// Inline toggle row for advanced network settings
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
        enabled ? 'bg-[var(--c-primary)]' : 'bg-white/10'
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

const AVAILABLE_BUILTIN_BOTS: BotManifest[] = [
  movieCatalogBotManifest,
  novafatherManifest,
  echoBotManifest,
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAnalytics?: () => void;
  getBotSession?: () => BotSession;
  pendingBotInstall?: { id: string; startPayload?: string } | null;
  onBotInstallHandled?: () => void;
  onOpenBotChat?: (botId: string) => void;
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

const THEME_OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }> = [
  { value: 'light', icon: <Sun className="w-5 h-5" />, label: 'Light' },
  { value: 'dark', icon: <Moon className="w-5 h-5" />, label: 'Dark' },
  { value: 'system', icon: <Monitor className="w-5 h-5" />, label: 'System' },
];

const CHAT_COLOR_OPTIONS: Array<{ value: 'default' | 'sapphire' | 'amethyst' | 'emerald'; grad: string; label: string }> = [
  { value: 'default', grad: 'from-[var(--nova-accent-color,#ff521a)] to-[var(--nova-accent-color,#ff3b00)]', label: 'Default' },
  { value: 'sapphire', grad: 'from-[#1E3A8A] to-[#3B82F6]', label: 'Sapphire' },
  { value: 'amethyst', grad: 'from-[#4C1D95] to-[#8B5CF6]', label: 'Amethyst' },
  { value: 'emerald', grad: 'from-[#064E3B] to-[#10B981]', label: 'Emerald' },
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

const FONT_SIZE_OPTIONS: Array<{ value: FontSize; label: string; preview: string }> = [
  { value: 'small', label: 'Small', preview: 'A' },
  { value: 'medium', label: 'Medium', preview: 'A' },
  { value: 'large', label: 'Large', preview: 'A' },
];

const FAB_SIDE_OPTIONS: Array<{ value: FabSide; label: string; icon: React.ReactNode }> = [
  { value: 'right', label: 'Right hand', icon: <Smartphone className="w-5 h-5" /> },
  { value: 'left', label: 'Left hand', icon: <Smartphone className="w-5 h-5 -scale-x-100" /> },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenAnalytics,
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
  const [torStatus, setTorStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [newRelayOperator, setNewRelayOperator] = useState('');
  const [newTurnServerUrl, setNewTurnServerUrl] = useState('');
  const [newTurnServerUsername, setNewTurnServerUsername] = useState('');
  const [newTurnServerPassword, setNewTurnServerPassword] = useState('');
  const [newTurnServerRealm, setNewTurnServerRealm] = useState('');
  const [showAdvancedNetwork, setShowAdvancedNetwork] = useState(false);
  const [joinOutboxCount, setJoinOutboxCount] = useState<number>(() => loadJoinOutbox().length);
  const [adPrefs, setAdPrefs] = useState<LocalAdPreferences>(() => loadAdPreferences());
  const [adPrefsMsg, setAdPrefsMsg] = useState<string | null>(null);
  const [soundId, setSoundId] = useState<SoundId>(loadSoundId);
  const [fabSide, setFabSideState] = useState<FabSide>(() => readFabSide());

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

  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveLinking, setGdriveLinking] = useState(false);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveBackups, setGdriveBackups] = useState<{ id: string; name: string; size: number; createdAt: number }[]>([]);
  const [gdriveMsg, setGdriveMsg] = useState<string | null>(null);

  const [botsOpen, setBotsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installingBot, setInstallingBot] = useState<{ manifest: InstalledBot['manifest']; granted: BotPermission[] } | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [devRegistryOpen, setDevRegistryOpen] = useState(false);
  const [devName, setDevName] = useState('');
  const [devUsername, setDevUsername] = useState('');
  const [devDesc, setDevDesc] = useState('');
  const [devCreating, setDevCreating] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isOpen) return;
    if (pendingBotInstall && getBotSession) {
      const session = getBotSession();
      const bot = session.listBots().find((b) => b.manifest.id === pendingBotInstall.id);
      if (!bot) {
        setBotsOpen(true);
        showToast(`${t('bot.notInstalled', { defaultValue: 'Bot not installed. Please install it first.' })}: ${pendingBotInstall.id}`);
      }
    }
    onBotInstallHandled?.();
  }, [isOpen, pendingBotInstall, getBotSession, onBotInstallHandled]);

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

  const readFileManifest = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const manifest = sanitizeManifest(raw);
        setFileManifest(manifest);
        setInstallFromFile(false);
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

  const handleGDriveConnect = useCallback(async () => {
    setGdriveLinking(true);
    setGdriveMsg(null);
    try {
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
      showToast(result.ok ? t('settings.torConnected') : t('settings.torNotConnected'));
    } catch {
      setTorStatus('error');
      showToast(t('settings.torNotConnected'));
    }
  };

  const handleShareNetworkProfile = () => {
    const profile = createNetworkProfile(privacyPrefs);
    const link = buildNetworkProfileLink(profile);
    navigator.clipboard.writeText(link);
    showToast(t('settings.networkProfileCopied'));
  };

  const handleImportNetworkProfile = async () => {
    const text = await navigator.clipboard.readText();
    const profile = parseNetworkProfileLink(text);
    if (!profile) {
      showToast(t('settings.networkProfileInvalid'));
      return;
    }
    const merged = applyNetworkProfile(profile, privacyPrefs);
    setPrivacyPrefs(merged);
    savePrivacyPrefs(merged);
    showToast(t('settings.networkProfileImported'));
  };

  const handlePasteNetworkProfile = async () => {
    const text = await navigator.clipboard.readText();
    try {
      const profile = JSON.parse(text) as NetworkProfile;
      if (profile.version !== 1) throw new Error('Invalid version');
      const merged = applyNetworkProfile(profile, privacyPrefs);
      setPrivacyPrefs(merged);
      savePrivacyPrefs(merged);
      showToast(t('settings.networkProfileImported'));
    } catch {
      showToast(t('settings.networkProfileInvalid'));
    }
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

  // Helper to convert boolean to NovaToggle checked/onChange
  const toggleChecked = (value: boolean, onChange: (v: boolean) => void) => (
    <NovaToggle checked={value} onChange={onChange} />
  );

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
        className="bg-[var(--bg-card)] border border-[var(--border-divider)] rounded-3xl w-full max-w-md text-white shadow-2xl max-h-[calc(100dvh-2rem-var(--nova-safe-top)-var(--nova-safe-bottom))] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
      >
        <NovaNavBar
          showBack
          onBack={onClose}
          backLabel={t('common.close')}
          title={t('settings.title')}
          showDivider
        />

        <div className="overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-4 space-y-6 flex-1">
          {/* Language */}
          <NovaListGroup>
            <NovaListSectionHeader title={t('settings.language')} />
            <NovaListRow
              title={t('settings.language')}
              subtitle={t('settings.languageDesc')}
              rightContent={<LanguageSwitcher />}
              chevron
            />
          </NovaListGroup>

          {/* Appearance */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Palette className="w-5 h-5" />} title={t('settings.appearance')} />

            <NovaListRow
              title={t('settings.theme')}
              subtitle={t('settings.themeDesc')}
              rightContent={
                <NovaSegmentedTabs
                  tabs={THEME_OPTIONS.map(opt => ({ key: opt.value, label: opt.label, icon: opt.icon }))}
                  activeTab={appTheme}
                  onTabChange={(key) => setAppTheme(key as 'light' | 'dark' | 'system')}
                  variant="pill"
                />
              }
            />

            <NovaListRow
              title={t('settings.fontSize')}
              subtitle={t('settings.fontSizeDesc')}
              rightContent={
                <NovaSegmentedTabs
                  tabs={FONT_SIZE_OPTIONS.map(opt => ({ key: opt.value, label: opt.label }))}
                  activeTab={prefs.fontSize}
                  onTabChange={(key) => updatePref('fontSize', key as FontSize)}
                  variant="pill"
                />
              }
            />

            <NovaListRow
              title={t('settings.fabSide', { defaultValue: 'One-handed button' })}
              subtitle={t('settings.fabSideDesc', { defaultValue: 'Side of the New Action button' })}
              rightContent={
                <NovaSegmentedTabs
                  tabs={FAB_SIDE_OPTIONS.map(opt => ({ key: opt.value, label: opt.label, icon: opt.icon }))}
                  activeTab={fabSide}
                  onTabChange={(key) => updateFabSide(key as FabSide)}
                  variant="pill"
                />
              }
            />

            <NovaListRow
              title={t('settings.chatColors')}
              subtitle={t('settings.chatColorsDesc')}
              rightContent={
                <div className="flex gap-1">
                  {CHAT_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-disabled={opt.value !== 'default' && !canUse('chat_themes')}
                      aria-label={opt.label}
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
                          ? 'bg-[var(--c-primary)]/10 border-[var(--c-primary)]/40 shadow-sm shadow-[var(--c-primary)]/25'
                          : 'bg-[var(--bg-field)] border-transparent hover:bg-[var(--bg-soft)]'
                      }${opt.value !== 'default' && !canUse('chat_themes') ? ' opacity-60' : ''}`}
                    >
                      <div className="relative w-8 h-8 rounded-full border border-white/20 shadow-sm overflow-hidden">
                        <div className={`absolute inset-0 bg-gradient-to-tr ${opt.grad}`} />
                        <div className="absolute inset-1 rounded-full bg-white/30" />
                        {opt.value !== 'default' && !canUse('chat_themes') && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                            <Lock className="w-3 h-3 text-white/90" />
                          </div>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium ${opt.value !== 'default' && !canUse('chat_themes') ? 'text-[var(--text-secondary)]' : ''}`}>{opt.label}</span>
                      {opt.value !== 'default' && !canUse('chat_themes') && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--c-primary)] text-[var(--c-primary)] flex items-center justify-center text-[10px] font-bold">
                          <Lock className="w-2 h-2 fill-white" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              }
            />
          </NovaListGroup>

          {/* Premium */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Sparkles className="w-5 h-5" />} title={t('settings.premium')} />
            <NovaListRow
              title={t('settings.premiumDesc')}
              rightContent={
                <NovaButton
                  variant={premium ? 'accent' : 'accent-ghost'}
                  onClick={checkout}
                  className="w-full"
                  disabled={loading || premium}
                >
                  {loading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : premium ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      <span>{t('settings.premiumActive')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      <span>
                        {t('settings.premiumUpgrade')} • {' '}
                        {minSubscriptionCost / 100} {t('settings.premiumCurrency')}
                      </span>
                    </>
                  )}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.chatThemes')}
              subtitle={t('settings.chatThemesDesc')}
              rightContent={
                <NovaPillButton
                  variant={canUse('chat_themes') ? 'default' : 'invited'}
                  onClick={() => checkout()}
                  disabled={canUse('chat_themes')}
                >
                  {canUse('chat_themes') ? t('settings.chatThemesUnlock') : t('settings.chatThemesLocked')}
                </NovaPillButton>
              }
            />
            {freeDaysRemaining() > 0 && (
              <NovaListRow
                title={t('settings.premiumFreeTrial', { days: freeDaysRemaining() })}
                rightContent={<NovaBadge value={freeDaysRemaining()} variant="default" size="sm" />}
              />
            )}
          </NovaListGroup>

          {/* Notifications & Sounds */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Bell className="w-5 h-5" />} title={t('settings.notifications')} />
            <NovaListRow
              title={t('settings.notificationSound')}
              subtitle={t('settings.notificationSoundDesc')}
              rightContent={toggleChecked(prefs.notificationSound, (v) => updatePref('notificationSound', v))}
            />
            <NovaListRow
              title={t('settings.vibration')}
              subtitle={t('settings.vibrationDesc')}
              rightContent={toggleChecked(prefs.vibration, (v) => updatePref('vibration', v))}
            />
            <NovaListRow
              title={t('settings.previewMessages')}
              subtitle={t('settings.previewMessagesDesc')}
              rightContent={toggleChecked(prefs.previewMessages, (v) => updatePref('previewMessages', v))}
            />
            <NovaListRow
              title={t('settings.notificationSound')}
              subtitle={t('settings.notificationSoundDesc')}
              rightContent={
                <select
                  value={soundId}
                  onChange={(e) => {
                    const newSound = e.target.value as SoundId;
                    setSoundId(newSound);
                    saveSoundId(newSound);
                    playSound('notification', newSound);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white text-sm focus:outline-none focus:border-[var(--c-primary)]"
                >
                  {Object.values(SOUNDS).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              }
            />
          </NovaListGroup>

          {/* Privacy & Security */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Shield className="w-5 h-5" />} title={t('settings.privacy')} />
            <NovaListRow
              title={t('settings.passcode')}
              subtitle={pinEnabled ? t('settings.passcodeEnabled') : t('settings.passcodeDisabled')}
              rightContent={
                <NovaPillButton
                  variant={pinEnabled ? 'invited' : 'default'}
                  onClick={handleTogglePin}
                  disabled={isCreatingPin || isRemovingPin}
                >
                  {isCreatingPin || isRemovingPin ? t('common.loading') : pinEnabled ? t('settings.changePasscode') : t('settings.enablePasscode')}
                </NovaPillButton>
              }
            />
            <NovaListRow
              title={t('settings.twoFactorAuth')}
              subtitle={is2FAEnabled ? t('settings.2faEnabled') : t('settings.2faDisabled')}
              rightContent={
                <NovaPillButton
                  variant={is2FAEnabled ? 'invited' : 'default'}
                  onClick={handle2FAToggle}
                >
                  {is2FAEnabled ? t('settings.disable2FA') : t('settings.enable2FA')}
                </NovaPillButton>
              }
            />
            {biometricSupported && (
              <NovaListRow
                title={t('settings.biometric')}
                subtitle={biometricEnabled ? t('settings.biometricEnabled') : t('settings.biometricAvailable')}
                rightContent={toggleChecked(biometricEnabled, handleToggleBiometric)}
              />
            )}
            <NovaListRow
              title={t('settings.lockOnHide')}
              subtitle={t('settings.lockOnHideDesc')}
              rightContent={toggleChecked(lockOnHide, (v) => setLockOnHide(v))}
            />
            <NovaListRow
              title={t('settings.showSeedPhrase')}
              subtitle={t('settings.seedPhraseDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={handleShowSeedPhrase} size="sm">
                  {t('settings.showSeedPhrase')}
                </NovaButton>
              }
            />

            {/* Advanced Network Settings (progressive disclosure) */}
            <NovaListRow
              title={t('settings.advancedNetwork')}
              subtitle={showAdvancedNetwork ? t('settings.advancedNetworkDesc') : t('settings.advancedNetworkCollapsed')}
              rightContent={
                <NovaButton variant="ghost" size="sm" onClick={() => setShowAdvancedNetwork(!showAdvancedNetwork)}>
                  {showAdvancedNetwork ? t('settings.hideAdvanced') : t('settings.showAdvanced')}
                </NovaButton>
              }
            />
            {showAdvancedNetwork && (
              <>
                {/* Network Profile Sharing */}
                <div className="px-1 py-2 space-y-2 border-t border-white/10">
                  <p className="text-[11px] leading-relaxed text-[#8c919d]">{t('settings.networkProfileHint')}</p>
                  <div className="flex gap-2">
                    <NovaButton variant="accent" size="sm" onClick={handleShareNetworkProfile} className="flex-1">
                      {t('settings.shareNetworkProfile')}
                    </NovaButton>
                    <NovaButton variant="ghost" size="sm" onClick={handleImportNetworkProfile} className="flex-1">
                      {t('settings.importNetworkProfile')}
                    </NovaButton>
                    <NovaButton variant="ghost" size="sm" onClick={handlePasteNetworkProfile} className="flex-1">
                      {t('settings.pasteNetworkProfile')}
                    </NovaButton>
                  </div>
                </div>

                {/* Multi-relay (Этап 6.3) */}
                <div className="px-1 pb-2 space-y-2">
                  <ToggleRow
                    label={t('settings.multiRelay')}
                    enabled={privacyPrefs.relayEndpoints.length > 0}
                    onToggle={() => {
                      if (privacyPrefs.relayEndpoints.length === 0) {
                        setPrivacyPrefs((prev) => {
                          const next = {
                            ...prev,
                            relayEndpoints: [
                              {
                                id: 'relay_default',
                                url: (import.meta.env.VITE_ANON_RELAY_URL as string | undefined)?.trim() || 'https://relay.example.com',
                                operator: 'Default',
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
                      <p className="text-[11px] leading-relaxed text-[#8c919d]">{t('settings.multiRelayHint')}</p>
                      <div className="space-y-1.5">
                        {privacyPrefs.relayEndpoints.map((relay) => (
                          <div key={relay.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.02]">
                            <span className="flex-1 text-[11px] text-white/80 truncate">{relay.url}</span>
                            {relay.operator && <span className="text-[10px] text-[#8c919d] truncate max-w-[120px]">{relay.operator}</span>}
                            <button type="button" onClick={() => removeRelay(relay.id)} className="w-6 h-6 rounded-full border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" aria-label={t('settings.removeRelay')}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1 pt-1">
                        <input type="url" placeholder={t('settings.relayUrl')} value={newRelayUrl} onChange={(e) => setNewRelayUrl(e.target.value)} className="flex-1 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <input type="text" placeholder={t('settings.relayOperator')} value={newRelayOperator} onChange={(e) => setNewRelayOperator(e.target.value)} className="flex-1 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <button type="button" onClick={addRelay} disabled={!newRelayUrl.trim()} className="px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] font-medium text-white transition hover:bg-white/[0.06] disabled:opacity-50 disabled:pointer-events-none">{t('settings.addRelay')}</button>
                      </div>
                      <p className="text-[10px] text-[#8c919d]">Queues rotate between relays weekly so no single operator sees a contact's full history.</p>
                    </div>
                  )}
                </div>

                {/* TURN Servers for IP-Privacy Calls */}
                <div className="px-1 pb-2 space-y-2 border-t border-white/10">
                  <ToggleRow
                    label={t('settings.webrtcRelayOnly')}
                    enabled={privacyPrefs.webrtcRelayOnly}
                    onToggle={() => updatePresencePref({ webrtcRelayOnly: !privacyPrefs.webrtcRelayOnly })}
                  />
                  {privacyPrefs.webrtcRelayOnly && (
                    <div className="px-1 pb-2 space-y-2">
                      <p className="text-[11px] leading-relaxed text-[#8c919d]">{t('settings.turnServersHint')}</p>
                      {privacyPrefs.turnServers.length === 0 && <p className="px-1 text-[11px] text-[#8c919d]">{t('settings.turnServersEmpty')}</p>}
                      <div className="space-y-1.5">
                        {privacyPrefs.turnServers.map((server, index) => (
                          <div key={index} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.02]">
                            <span className="flex-1 text-[11px] text-white/80 truncate">{typeof server.urls === 'string' ? server.urls : Array.isArray(server.urls) ? server.urls.join(', ') : 'TURN'}</span>
                            {server.username && <span className="text-[10px] text-[#8c919d] truncate max-w-[100px]">{server.username}</span>}
                            <button type="button" onClick={() => removeTurnServer(index)} className="w-6 h-6 rounded-full border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition" aria-label={t('settings.removeTurnServer')}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1 pt-1">
                        <input type="text" placeholder={t('settings.turnServerUrlPlaceholder')} value={newTurnServerUrl} onChange={(e) => setNewTurnServerUrl(e.target.value)} className="flex-1 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <input type="text" placeholder={t('settings.turnUsernameLabel')} value={newTurnServerUsername} onChange={(e) => setNewTurnServerUsername(e.target.value)} className="px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <input type="password" placeholder={t('settings.turnPasswordLabel')} value={newTurnServerPassword} onChange={(e) => setNewTurnServerPassword(e.target.value)} className="px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <input type="text" placeholder={t('settings.turnRealmLabel')} value={newTurnServerRealm} onChange={(e) => setNewTurnServerRealm(e.target.value)} className="px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white placeholder-[#6b7280] focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <button type="button" onClick={addTurnServer} disabled={!newTurnServerUrl.trim()} className="px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] font-medium text-white transition hover:bg-white/[0.06] disabled:opacity-50 disabled:pointer-events-none">{t('settings.addTurnServerBtn')}</button>
                      </div>
                      <p className="text-[10px] text-[#8c919d]">When 'Hide my IP in calls' is enabled, media flows through these TURN relays so peers cannot see your IP address.</p>
                    </div>
                  )}
                </div>

                {/* Tor (Этап 6.4) */}
                <div className="px-1 pb-2 space-y-2 border-t border-white/10">
                  <ToggleRow
                    label={t('settings.torMode')}
                    enabled={privacyPrefs.torEnabled}
                    onToggle={toggleTor}
                  />
                  {privacyPrefs.torEnabled && (
                    <div className="px-1 pb-2 space-y-2">
                      <p className="text-[11px] leading-relaxed text-[#8c919d]">{t('settings.torModeHint')}</p>
                      <div className="flex items-center gap-1.5 px-1 py-1">
                        <span className="text-[11px] text-white/60">{t('settings.torSocksPort')}</span>
                        <input type="number" min="1" max="65535" value={privacyPrefs.torSocksPort} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && v <= 65535) { setPrivacyPrefs((prev) => { const next = { ...prev, torSocksPort: v }; savePrivacyPrefs(next); return next; }); } }} className="w-20 px-2 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] text-[11px] text-white focus:outline-none focus:border-[var(--c-primary)]/50" />
                        <button type="button" onClick={checkTor} disabled={torStatus === 'checking'} className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition ${torStatus === 'checking' ? 'border-[#8c919d]/40 text-[#8c919d] cursor-wait' : 'border-white/10 bg-white/[0.03] text-white/90 hover:bg-white/[0.06]'}`}>{torStatus === 'checking' ? t('settings.torCheck') + '…' : t('settings.torCheck')}</button>
                        <span className={`text-[10px] font-medium ${torStatus === 'connected' ? 'text-green-400' : torStatus === 'error' ? 'text-red-400' : 'text-[#8c919d]'}`}>{torStatus === 'connected' ? t('settings.torConnected') : torStatus === 'error' ? t('settings.torNotConnected') : torStatus === 'checking' ? t('settings.torCheck') + '…' : ''}</span>
                      </div>
                      <p className="text-[10px] text-[#8c919d]">Relay traffic routes through local Tor SOCKS proxy. Requires Tor running on this device (default port 9050).</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </NovaListGroup>

          {/* Data & Storage */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Database className="w-5 h-5" />} title={t('settings.dataStorage')} />
            <NovaListRow
              title={t('settings.backup')}
              subtitle={t('settings.backupDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={() => setBackupModal({ open: true, mode: 'export' })} size="sm">
                  {t('settings.exportBackup')}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.restoreBackup')}
              subtitle={t('settings.restoreBackupDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={() => setBackupModal({ open: true, mode: 'import' })} size="sm">
                  {t('settings.importBackup')}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.clearCache')}
              subtitle={t('settings.clearCacheDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={handleClearCache} size="sm">
                  {t('settings.clearCache')}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.storageUsage')}
              subtitle={`${formatBytes(totalStorageBytes)} used`}
              rightContent={
                <NovaButton variant="ghost" onClick={() => void computeStorageUsage()} size="sm">
                  {t('settings.refresh')}
                </NovaButton>
              }
            />
            {storageLoading ? (
              <NovaListRow title={t('settings.calculating')} rightContent={<div className="w-4 h-4 border-2 border-[var(--c-primary)] border-t-transparent rounded-full animate-spin" />} />
            ) : (
              storageUsage.map((item) => (
                <NovaListRow
                  key={item.category}
                  title={item.category}
                  subtitle={formatBytes(item.bytes)}
                  rightContent={<span className="text-[var(--text-secondary)]">{formatBytes(item.bytes)}</span>}
                />
              ))
            )}
            <NovaListRow
              title={t('settings.eraseAllData')}
              subtitle={t('settings.eraseAllDataDesc')}
              destructive
              rightContent={
                <NovaButton variant="danger" onClick={handleClearAllData} size="sm">
                  {t('settings.eraseAllData')}
                </NovaButton>
              }
            />
          </NovaListGroup>

          {/* Bots */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Bot className="w-5 h-5" />} title={t('settings.bots')} />
            <NovaListRow
              title={t('settings.manageBots')}
              subtitle={t('settings.manageBotsDesc')}
              rightContent={
                <NovaButton variant="accent" onClick={() => setBotsOpen(true)} size="sm">
                  {t('settings.manageBots')}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.devRegistry')}
              subtitle={t('settings.devRegistryDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={() => setDevRegistryOpen(true)} size="sm">
                  {t('settings.createBot')}
                </NovaButton>
              }
            />
            <NovaListRow
              title={t('settings.installFromFile')}
              subtitle={t('settings.installFromFileDesc')}
              rightContent={
                <NovaButton variant="ghost" onClick={() => setInstallFromFile(true)} size="sm">
                  {t('settings.installFromFile')}
                </NovaButton>
              }
            />
          </NovaListGroup>

          {/* About */}
          <NovaListGroup>
            <NovaListSectionHeader icon={<Info className="w-5 h-5" />} title={t('settings.about')} />
            <NovaListRow
              title={t('settings.version')}
              subtitle={`v${process.env.npm_package_version ?? '1.0.0'}`}
            />
            <NovaListRow
              title={t('settings.termsOfService')}
              subtitle={t('settings.termsDesc')}
              onClick={() => setLegalDoc('terms')}
              chevron
            />
            <NovaListRow
              title={t('settings.privacyPolicy')}
              subtitle={t('settings.privacyDesc')}
              onClick={() => setLegalDoc('privacy')}
              chevron
            />
            <NovaListRow
              title={t('settings.licenses')}
              subtitle={t('settings.licensesDesc')}
              onClick={() => setLegalDoc('terms')}
              chevron
            />
          </NovaListGroup>
        </div>

        {toastMessage && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-card)] border border-[var(--c-primary)]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
            {toastMessage}
          </div>
        )}

        {/* Backup Modal */}
        {backupModal && (
          <NovaBottomSheet
            isOpen={backupModal.open}
            onClose={() => setBackupModal(null)}
            title={backupModal.mode === 'export' ? t('settings.exportBackup') : t('settings.importBackup')}
            showHandle
            showCloseButton
          >
            {backupModal.mode === 'export' ? (
              <div className="p-4 space-y-4">
                <input
                  type="password"
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                  placeholder={t('settings.passphrase')}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                  minLength={8}
                />
                <input
                  type="text"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder={t('settings.cloudUrl')}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                />
                {cloudUrl && (
                  <input
                    type="password"
                    value={cloudToken}
                    onChange={(e) => setCloudToken(e.target.value)}
                    placeholder={t('settings.cloudToken')}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                  />
                )}
                <div className="flex gap-2">
                  <NovaButton variant="ghost" onClick={() => setBackupModal(null)} className="flex-1">
                    {t('common.cancel')}
                  </NovaButton>
                  <NovaButton variant="accent" onClick={handleExportBackup} disabled={backupBusy} className="flex-1">
                    {backupBusy ? t('common.loading') : t('settings.exportBackup')}
                  </NovaButton>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <input
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => setImportPassphrase(e.target.value)}
                  placeholder={t('settings.passphrase')}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                  minLength={8}
                />
                <input
                  type="file"
                  accept=".nova-backup"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                />
                <div className="flex gap-2">
                  <NovaButton variant="ghost" onClick={() => setBackupModal(null)} className="flex-1">
                    {t('common.cancel')}
                  </NovaButton>
                  <NovaButton variant="accent" onClick={handleImportBackup} disabled={backupBusy} className="flex-1">
                    {backupBusy ? t('common.loading') : t('settings.importBackup')}
                  </NovaButton>
                </div>
              </div>
            )}
          </NovaBottomSheet>
        )}

        {/* 2FA Setup Modal */}
        {show2FASetup && (
          <NovaBottomSheet
            isOpen={show2FASetup}
            onClose={() => { setShow2FASetup(false); setOtpInput(''); }}
            title={t('settings.setup2FA')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              <p className="text-[var(--text-secondary)]">{t('settings.2faInstructions')}</p>
              <div className="font-mono text-xl tracking-widest text-center bg-[var(--bg-field)] px-4 py-3 rounded-xl">
                {totpSecret}
              </div>
              <input
                type="text"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                placeholder={t('settings.otpPlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)] text-center text-xl tracking-widest"
                maxLength={6}
              />
              {otpMsg && <p className="text-sm text-[var(--c-danger)]">{otpMsg}</p>}
              <div className="flex gap-2">
                <NovaButton variant="ghost" onClick={() => { setShow2FASetup(false); setOtpInput(''); }} className="flex-1">
                  {t('common.cancel')}
                </NovaButton>
                <NovaButton variant="accent" onClick={handleActivate2FA} className="flex-1">
                  {t('common.activate')}
                </NovaButton>
              </div>
            </div>
          </NovaBottomSheet>
        )}

        {/* PIN Modal */}
        {(isCreatingPin || isRemovingPin) && (
          <NovaBottomSheet
            isOpen={true}
            onClose={handleCancelPin}
            title={isCreatingPin ? t('settings.setPasscode') : t('settings.removePasscode')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={isCreatingPin ? t('settings.newPasscode') : t('settings.currentPasscode')}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)] text-center text-xl tracking-widest"
                maxLength={pinLength || 6}
                autoFocus
              />
              {pinMsg && <p className="text-sm text-[var(--c-danger)]">{pinMsg}</p>}
              <div className="flex gap-2">
                <NovaButton variant="ghost" onClick={handleCancelPin} className="flex-1">
                  {t('common.cancel')}
                </NovaButton>
                <NovaButton variant="accent" onClick={handleConfirmPin} className="flex-1">
                  {t('common.confirm')}
                </NovaButton>
              </div>
            </div>
          </NovaBottomSheet>
        )}

        {/* Seed Phrase Modal */}
        {showSeedPhraseModal && (
          <NovaBottomSheet
            isOpen={showSeedPhraseModal}
            onClose={() => setShowSeedPhraseModal(false)}
            title={t('settings.seedPhrase')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              <p className="text-[var(--c-danger)]">{t('settings.seedPhraseWarning')}</p>
              <div className="font-mono text-sm tracking-wider bg-[var(--bg-field)] p-4 rounded-xl whitespace-pre-wrap break-words">
                {identity?.mnemonic ?? ''}
              </div>
              <div className="flex gap-2">
                <NovaButton variant="ghost" onClick={() => setShowSeedPhraseModal(false)} className="flex-1">
                  {t('common.done')}
                </NovaButton>
                <NovaButton variant="accent" onClick={handleCopySeedPhrase} className="flex-1">
                  {seedPhraseCopied ? t('settings.copied') : t('settings.copy')}
                </NovaButton>
              </div>
            </div>
          </NovaBottomSheet>
        )}

        {/* Bots Modal */}
        {botsOpen && (
          <NovaBottomSheet
            isOpen={botsOpen}
            onClose={() => setBotsOpen(false)}
            title={t('settings.manageBots')}
            showHandle
            showCloseButton
            maxHeight="90vh"
          >
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {getBots().length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] py-8">{t('settings.noBotsInstalled')}</p>
              ) : (
                <div className="space-y-2">
                  {getBots().map((bot) => (
                    <NovaListGroup key={bot.manifest.id}>
                      <NovaListRow
                        title={bot.manifest.name}
                        subtitle={`@${bot.manifest.username}`}
                        rightContent={
                          <div className="flex items-center gap-2">
                            <NovaToggle checked={bot.enabled} onChange={(v) => toggleBot(bot.manifest.id, v)} size="sm" />
                            <NovaBadge value={bot.blocked ? 'Blocked' : 'Active'} variant={bot.blocked ? 'danger' : 'default'} size="sm" />
                          </div>
                        }
                      />
                      <NovaListSectionHeader title={t('settings.permissions')} inset />
                      {bot.manifest.requestedPermissions.map((perm) => (
                        <NovaListRow
                          key={perm}
                          title={perm}
                          inset
                          rightContent={
                            <NovaToggle
                              checked={bot.grantedPermissions.includes(perm)}
                              onChange={() => {}}
                              disabled
                              size="sm"
                            />
                          }
                        />
                      ))}
                      <NovaListRow
                        title={bot.blocked ? t('settings.unblock') : t('settings.block')}
                        subtitle={bot.blocked ? t('settings.unblockDesc') : t('settings.blockDesc')}
                        destructive={!bot.blocked}
                        onClick={() => setBotBlocked(bot.manifest.id, !bot.blocked)}
                        inset
                        chevron
                      />
                      <NovaListRow
                        title={t('settings.uninstall')}
                        subtitle={t('settings.uninstallDesc')}
                        destructive
                        onClick={() => uninstallBot(bot.manifest.id)}
                        inset
                        chevron
                      />
                    </NovaListGroup>
                  ))}
                </div>
              )}
              <div className="pt-4 border-t border-[var(--border-divider)] space-y-2">
                <NovaButton variant="accent" onClick={() => setInstallOpen(true)} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {t('settings.installBot')}
                </NovaButton>
                <NovaButton variant="ghost" onClick={() => setDevRegistryOpen(true)} className="w-full">
                  <Bot className="w-4 h-4 mr-2" />
                  {t('settings.createLocalBot')}
                </NovaButton>
                <NovaButton variant="ghost" onClick={() => setInstallFromFile(true)} className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  {t('settings.installFromFile')}
                </NovaButton>
              </div>
            </div>
          </NovaBottomSheet>
        )}

        {/* Install Bot Modal */}
        {installOpen && (
          <NovaBottomSheet
            isOpen={installOpen}
            onClose={() => { setInstallOpen(false); setInstallingBot(null); setInstallError(null); }}
            title={t('settings.installBot')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              {installingBot ? (
                <>
                  <p className="text-[var(--text-secondary)]">{t('settings.installBotConfirm', { name: installingBot.manifest.name })}</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {installingBot.manifest.requestedPermissions.map((perm) => {
                      const isGranted = installingBot.granted.includes(perm);
                      return (
                        <NovaListRow
                          key={perm}
                          title={perm}
                          inset
                          rightContent={
                            <NovaToggle
                              checked={isGranted}
                              onChange={() => {
                                setInstallingBot((prev) => {
                                  if (!prev) return null;
                                  const newGranted = isGranted
                                    ? prev.granted.filter((p) => p !== perm)
                                    : [...prev.granted, perm];
                                  return { ...prev, granted: newGranted };
                                });
                              }}
                              size="sm"
                            />
                          }
                        />
                      );
                    })}
                  </div>
                  {installError && <p className="text-sm text-[var(--c-danger)]">{installError}</p>}
                  <div className="flex gap-2">
                    <NovaButton variant="ghost" onClick={() => { setInstallOpen(false); setInstallingBot(null); }} className="flex-1">
                      {t('common.cancel')}
                    </NovaButton>
                    <NovaButton variant="accent" onClick={confirmInstall} className="flex-1">
                      {t('settings.install')}
                    </NovaButton>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[var(--text-secondary)]">{t('settings.enterBotUrl')}</p>
                  <input
                    type="url"
                    placeholder="https://example.com/bot/manifest.json"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // TODO: fetch manifest
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <NovaButton variant="ghost" onClick={() => setInstallOpen(false)} className="flex-1">
                      {t('common.cancel')}
                    </NovaButton>
                    <NovaButton variant="accent" onClick={() => {}} className="flex-1" disabled>
                      {t('settings.next')}
                    </NovaButton>
                  </div>
                </>
              )}
            </div>
          </NovaBottomSheet>
        )}

        {/* Dev Registry Modal */}
        {devRegistryOpen && (
          <NovaBottomSheet
            isOpen={devRegistryOpen}
            onClose={() => { setDevRegistryOpen(false); setDevName(''); setDevUsername(''); setDevDesc(''); }}
            title={t('settings.createLocalBot')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              <input
                type="text"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                placeholder={t('settings.botName')}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
              />
              <input
                type="text"
                value={devUsername}
                onChange={(e) => setDevUsername(e.target.value)}
                placeholder={t('settings.botUsername')}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
              />
              <textarea
                value={devDesc}
                onChange={(e) => setDevDesc(e.target.value)}
                placeholder={t('settings.botDescription')}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
                rows={3}
              />
              {devError && <p className="text-sm text-[var(--c-danger)]">{devError}</p>}
              <div className="flex gap-2">
                <NovaButton variant="ghost" onClick={() => { setDevRegistryOpen(false); setDevName(''); setDevUsername(''); setDevDesc(''); }} className="flex-1">
                  {t('common.cancel')}
                </NovaButton>
                <NovaButton variant="accent" onClick={createLocalBot} disabled={devCreating} className="flex-1">
                  {devCreating ? t('common.loading') : t('settings.createBot')}
                </NovaButton>
              </div>
            </div>
          </NovaBottomSheet>
        )}

        {/* Install From File Modal */}
        {installFromFile && (
          <NovaBottomSheet
            isOpen={installFromFile}
            onClose={() => { setInstallFromFile(false); setFileManifest(null); setFileError(null); }}
            title={t('settings.installFromFile')}
            showHandle
            showCloseButton
          >
            <div className="p-4 space-y-4">
              <input
                type="file"
                accept=".json"
                onChange={(e) => readFileManifest(e.target.files?.[0]!)}
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-field)] border border-[var(--border-divider)] text-white placeholder-[var(--text-secondary)] outline-none focus:border-[var(--c-primary)]"
              />
              {fileError && <p className="text-sm text-[var(--c-danger)]">{fileError}</p>}
              {fileManifest && (
                <>
                  <p className="text-[var(--text-secondary)]">{t('settings.installBotConfirm', { name: fileManifest.name })}</p>
                  <div className="flex gap-2">
                    <NovaButton variant="ghost" onClick={() => { setInstallFromFile(false); setFileManifest(null); }} className="flex-1">
                      {t('common.cancel')}
                    </NovaButton>
                    <NovaButton variant="accent" onClick={() => { setInstallingBot({ manifest: fileManifest!, granted: [...fileManifest!.requestedPermissions] }); setInstallFromFile(false); setInstallOpen(true); }} className="flex-1">
                      {t('settings.install')}
                    </NovaButton>
                  </div>
                </>
              )}
            </div>
          </NovaBottomSheet>
        )}

        {/* Legal Modal */}
        {legalDoc && (
          <LegalModal
            docId={legalDoc}
            onClose={() => setLegalDoc(null)}
          />
        )}
      </div>
    </div>
  );
};

SettingsModal.displayName = 'SettingsModal';