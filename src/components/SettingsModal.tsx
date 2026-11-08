import React, { useState } from 'react';
import { X, Check, Bell, Lock, Database, Palette, Info, Languages, Globe } from 'lucide-react';
import { useLanguage, Language } from '../context/LanguageContext';

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
  fontSize: 'small' | 'medium' | 'large';
}

const DEFAULT_PREFS: Prefs = {
  notificationSound: true,
  vibration: false,
  previewMessages: true,
  autoDownload: true,
  fontSize: 'medium',
};

const loadPrefs = (): Prefs => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
    }
  } catch {}
  return DEFAULT_PREFS;
};

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 px-1 pt-3 pb-1 first:pt-0">
    <div className="w-6 h-6 rounded-lg bg-[#ff4e18]/15 border border-[#ff4e18]/25 flex items-center justify-center text-[#ff4e18]">
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
    onClick={onToggle}
    className="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition group"
  >
    <span className="text-[13px] text-white/90 group-hover:text-white transition">{label}</span>
    <span
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
        enabled ? 'bg-[#ff4e18]' : 'bg-white/10'
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
  const { t, language, changeLanguage, languages } = useLanguage();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  if (!isOpen) return null;

  const updatePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('nova_messenger_chat_cache');
    } catch {}
  };

  const handleLangClick = (code: Language) => {
    changeLanguage(code);
    onClose();
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
        className="bg-[#12131c] border border-white/10 rounded-3xl w-full max-w-md text-white shadow-2xl max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#ff4e18]/20 border border-[#ff4e18]/30 flex items-center justify-center text-[#ff4e18]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white leading-tight">{t('settings.title')}</h3>
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
          <div className="space-y-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLangClick(lang.code)}
                className={`w-full flex items-center gap-3 py-2 px-2.5 rounded-xl border transition cursor-pointer ${
                  language === lang.code
                    ? 'bg-[#ff4e18]/10 border-[#ff4e18]/40'
                    : 'bg-white/[0.03] border-transparent hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-lg leading-none">{lang.flag}</span>
                <span className="flex-1 text-left text-[13px] font-medium text-white/90">
                  {lang.nativeName}
                </span>
                {language === lang.code && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#ff4e18] text-white">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </button>
            ))}
          </div>

          <SectionHeader
            icon={<Palette className="w-3.5 h-3.5" />}
            title={t('settings.appearance')}
          />
          <div className="flex items-center justify-between py-2 px-1">
            <div className="flex items-center gap-2.5">
              <Globe className="w-3.5 h-3.5 text-[#8c919d]" />
              <span className="text-[13px] text-white/90">{t('settings.theme')}</span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#ff4e18]/15 border border-[#ff4e18]/30 text-[10px] font-semibold uppercase tracking-wider text-[#ff4e18]">
              {t('settings.darkMode')}
            </span>
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
                      ? 'bg-[#ff4e18]/10 border-[#ff4e18]/40 text-white'
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
          <div className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition">
            <span className="text-[13px] text-white/90">{t('settings.passcodeLock')}</span>
            <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/50">
              {t('settings.comingSoon')}
            </span>
          </div>

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
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-[#ff4e18]/20 border border-white/10 text-[12px] font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-[0.98]"
          >
            <span>{t('settings.clearCache')}</span>
          </button>

          <SectionHeader icon={<Info className="w-3.5 h-3.5" />} title={t('settings.about')} />
          <div className="py-2 px-1 flex items-center justify-between">
            <span className="text-[13px] text-white/90">{t('app.name')}</span>
            <span className="text-[11px] font-mono text-[#8c9195]">v1.0.0</span>
          </div>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90"
          >
            <span>{t('settings.termsOfService')}</span>
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-white/[0.04] transition text-[13px] text-white/90"
          >
            <span>{t('settings.privacyPolicy')}</span>
          </a>
        </div>
      </div>
    </div>
  );
};

