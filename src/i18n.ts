import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

// Only English (the fallback) is bundled up front. The other locales are lazily
// fetched the first time they are selected, which keeps the initial bundle small.
const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  ru: () => import('./locales/ru.json'),
  uk: () => import('./locales/uk.json'),
  de: () => import('./locales/de.json'),
  es: () => import('./locales/es.json'),
  tr: () => import('./locales/tr.json'),
  id: () => import('./locales/id.json'),
  vi: () => import('./locales/vi.json'),
  ar: () => import('./locales/ar.json'),
  th: () => import('./locales/th.json'),
  fr: () => import('./locales/fr.json'),
  pt: () => import('./locales/pt.json'),
  it: () => import('./locales/it.json'),
  pl: () => import('./locales/pl.json'),
  nl: () => import('./locales/nl.json'),
  sv: () => import('./locales/sv.json'),
  zh: () => import('./locales/zh.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  hi: () => import('./locales/hi.json'),
};

const savedLanguage = localStorage.getItem('appLanguage') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export async function loadLanguage(code: string): Promise<void> {
  const loader = localeLoaders[code];
  if (!loader || i18n.hasResourceBundle(code, 'translation')) return;
  const module = await loader();
  i18n.addResourceBundle(code, 'translation', module.default, true, true);
}

export default i18n;
