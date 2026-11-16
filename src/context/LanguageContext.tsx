import React, { createContext, useContext, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { loadLanguage } from '../i18n';

export type Language = 'en' | 'ru' | 'uk' | 'de' | 'es' | 'tr' | 'id' | 'vi' | 'ar' | 'th' | 'fr' | 'pt' | 'it' | 'pl' | 'nl' | 'sv' | 'zh' | 'ja' | 'ko' | 'hi';

export interface LanguageItem {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

const RTL_LANGUAGES: Language[] = ['ar'];

export const SUPPORTED_LANGUAGES: LanguageItem[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'zh', name: 'Chinese', nativeName: '中文 (简体)', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
];

interface LanguageContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
  languages: LanguageItem[];
  t: TFunction<'translation', undefined>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t, i18n } = useTranslation();
  
  const language = (i18n.language || 'ru') as Language;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
  }, [language]);
  
  const changeLanguage = useCallback((lang: Language) => {
    // Non-English locales are lazy chunks: fetch the bundle before switching so
    // the UI never renders raw translation keys.
    void loadLanguage(lang).then(() => {
      i18n.changeLanguage(lang);
      localStorage.setItem('appLanguage', lang);
    });
  }, [i18n]);

  const value = useMemo(() => ({
    language,
    changeLanguage,
    languages: SUPPORTED_LANGUAGES,
    t,
  }), [language, changeLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
