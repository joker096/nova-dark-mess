import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';

export type Language = 'en' | 'ru' | 'uk';

export interface LanguageItem {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageItem[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
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
  
  const changeLanguage = useCallback((lang: Language) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('appLanguage', lang);
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
