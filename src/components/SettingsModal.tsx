import React, { useState, useEffect } from 'react';
import { X, Check, Bell, Lock, Database, Palette, Info, Languages, Download, Upload, FileText, Sun, Moon, Monitor, Copy, AlertTriangle, Sparkles, DollarSign } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { usePremium } from '../hooks/usePremium';
import { PIN_HASH_KEY, PIN_ENABLED_KEY } from '../context/SecurityContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CryptoCheckoutModal } from './CryptoCheckoutModal';
import {
  ACCENT_COLORS,
  APP_THEME_KEY,
  FONT_SIZE_KEY,
  FontSize,
  applyAppTheme,
  applyFontSize,
} from '../lib/ui/appearance';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SETTINGS_STORAGE_KEY = 'nova_messenger_settings';

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

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { premium, loading, checkout, canUse, freeDaysRemaining, minSubscriptionCost } = usePremium();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const { identity, is2FAEnabled, totpSecret, enable2FA, disable2FA, exportEncryptedBackup, importEncryptedBackup, pinEnabled, setPin, verifyPin, removePin, clearLocalEncryptedData } = useSecurity();
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      const saved = localStorage.getItem('nova_app_theme');
      return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
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
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);

  useEffect(() => {
    applyAppTheme(appTheme);
    applyFontSize(prefs.fontSize);
    document.documentElement.style.setProperty('--nova-accent-color', ACCENT_COLORS[chatColorTheme]);
    try {
      localStorage.setItem(APP_THEME_KEY, appTheme);
      localStorage.setItem(FONT_SIZE_KEY, prefs.fontSize);
      localStorage.setItem('nova_accent_color', ACCENT_COLORS[chatColorTheme]);
    } catch { void 0; }
  }, [appTheme, chatColorTheme, prefs.fontSize]);

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
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, backupModal, showSeedPhraseModal, onClose]);

  useEffect(() => {
    if (!cacheMsg) return;
    const timer = setTimeout(() => setCacheMsg(null), 2000);
    return () => clearTimeout(timer);
  }, [cacheMsg]);

  if (!isOpen) return null;

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
  };

  const handleExportBackup = async () => {
    if (!identity) {
      setBackupMsg(t('settings.identityNotReady'));
      return;
    }
    if (exportPassphrase.trim().length < 8) {
      setBackupMsg(t('settings.passphraseTooShort'));
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const chatList = [] as Array<{ id: string; name: string; isEncrypted: boolean }>;
      const blob = await exportEncryptedBackup(exportPassphrase, chatList);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nova_backup_${new Date().toISOString().slice(0, 10)}.nova-backup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMsg('Backup exported');
      setBackupModal(null);
      setExportPassphrase('');
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    if (!importFile) {
      setBackupMsg('Choose a .nova-backup file');
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const text = await importFile.text();
      await importEncryptedBackup(text, importPassphrase || 'nova_backup');
      setBackupMsg('Backup imported');
      setBackupModal(null);
      setImportFile(null);
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

  const handleConfirmPin = async () => {
    if (pinInput.length < 4) {
      setPinMsg(t('settings.passcodeTooShort'));
      return;
    }
    if (isRemovingPin) {
      const ok = await verifyPin(pinInput);
      if (ok) {
        await removePin();
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
      await setPin(pinInput);
      setPinInput('');
      setIsCreatingPin(false);
      setPinMsg(t('settings.passcodeSet'));
      setTimeout(() => setPinMsg(null), 2000);
    } else {
      const ok = await verifyPin(pinInput);
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

  const eraseAllData = async () => {
    await clearLocalEncryptedData();
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
      const ok = await verifyPin(clearDataPin);
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md text-white shadow-2xl max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
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
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-1 flex-1">
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
                  <span className="text-[12px] font-medium">{opt.value === 'light' ? t('settings.themeLight') : opt.value === 'dark' ? t('settings.themeDark') : t('settings.themeSystem')}</span>
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
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-[70px] bg-white/[0.03] border border-white/10 rounded-xl px-2 py-1.5 text-[12px] text-white text-center focus:outline-none focus:border-[var(--nova-accent-color)] transition"
                  placeholder="0000"
                />
              </div>
              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={(pinInput.length < 4)}
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
            onClick={() => setBackupModal({ open: true, mode: 'export' })}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[var(--nova-accent-color)]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.exportBackup')}</span>
          </button>
          <button
            onClick={() => setBackupModal({ open: true, mode: 'import' })}
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

          <SectionHeader icon={<Info className="w-3.5 h-3.5" />} title={t('settings.about')} />
          <div className="py-2 px-1 flex items-center justify-between">
            <span className="text-[13px] text-white/90">{t('app.name')}</span>
            <span className="text-[11px] font-mono text-[#8c9195]">v1.0.0</span>
          </div>
          <button
            type="button"
            onClick={() => setAboutMsg(t('settings.comingSoon'))}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span>{t('settings.termsOfService')}</span>
          </button>
          <button
            type="button"
            onClick={() => setAboutMsg(t('settings.comingSoon'))}
            className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90 cursor-pointer"
          >
            <span>{t('settings.privacyPolicy')}</span>
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">
                {backupModal.mode === 'export' ? t('settings.exportBackup') : t('settings.importBackup')}
              </h3>
              <button
                onClick={() => setBackupModal(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
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
                    }}
                  />
                </div>
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
                  (backupModal.mode === 'import' && !importFile) ||
                  (backupModal.mode === 'export' && exportPassphrase.trim().length < 8)
                }
                className={`flex-1 py-2 rounded-xl text-[12px] font-medium text-white transition cursor-pointer ${
                  backupBusy ||
                  (backupModal.mode === 'import' && !importFile) ||
                  (backupModal.mode === 'export' && exportPassphrase.trim().length < 8)
                    ? 'bg-white/[0.05] border border-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5f2e)] border border-[var(--nova-accent-color)]/30 shadow-md shadow-[var(--nova-accent-color)]/25'
                }`}
              >
                {backupBusy ? 'Processing...' : backupModal.mode === 'export' ? 'Export' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed Phrase Modal */}
      {showSeedPhraseModal && identity && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-sm text-white">{t('settings.showSeedPhrase')}</h3>
              <button
                onClick={() => setShowSeedPhraseModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
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
    </div>
  );
};

