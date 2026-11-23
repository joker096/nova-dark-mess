/**
 * Message Translation Service
 * Supports LibreTranslate (free, self-hostable) and MyMemory API (free tier)
 * Can be extended with other providers
 */

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslationProvider {
  name: string;
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult>;
  getSupportedLanguages(): Promise<string[]>;
}

/**
 * LibreTranslate provider - free, open source, can be self-hosted
 * Default public instance: https://libretranslate.de
 */
export class LibreTranslateProvider implements TranslationProvider {
  name = 'LibreTranslate';
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl = 'https://libretranslate.de', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async translate(text: string, targetLang: string, sourceLang = 'auto'): Promise<TranslationResult> {
    const params = new URLSearchParams({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    });

    if (this.apiKey) {
      params.append('api_key', this.apiKey);
    }

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`LibreTranslate error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.translatedText,
      detectedLanguage: data.detectedLanguage || sourceLang,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    };
  }

  async getSupportedLanguages(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/languages`);
    if (!response.ok) throw new Error('Failed to fetch languages');
    const data = await response.json();
    return data.map((lang: any) => lang.code);
  }
}

/**
 * MyMemory Translation API provider - free tier (1000 requests/day)
 * https://mymemory.translated.net/doc/spec.php
 */
export class MyMemoryProvider implements TranslationProvider {
  name = 'MyMemory';
  private email?: string;

  constructor(email?: string) {
    this.email = email;
  }

  async translate(text: string, targetLang: string, sourceLang = 'auto'): Promise<TranslationResult> {
    const params = new URLSearchParams({
      q: text,
      langpair: `${sourceLang}|${targetLang}`,
      de: this.email || 'noreply@nova-messenger.app',
    });

    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    if (!response.ok) {
      throw new Error(`MyMemory error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.responseData.translatedText,
      detectedLanguage: data.responseData.detectedLanguage || sourceLang,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    };
  }

  async getSupportedLanguages(): Promise<string[]> {
    // MyMemory supports most ISO 639-1 codes
    return [
      'en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko',
      'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'cs',
      'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'mt',
      'ga', 'cy', 'eu', 'ca', 'gl', 'is', 'mk', 'sq', 'bs', 'sr',
    ];
  }
}

/**
 * Google Translate (unofficial, for development only)
 * NOT recommended for production - use official API
 */
export class GoogleTranslateProvider implements TranslationProvider {
  name = 'Google Translate (Unofficial)';

  async translate(text: string, targetLang: string, sourceLang = 'auto'): Promise<TranslationResult> {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang,
      tl: targetLang,
      dt: 't',
      q: text,
    });

    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data[0]?.map((item: any[]) => item[0]).join('') || '';

    return {
      translatedText,
      detectedLanguage: data[2] || sourceLang,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    };
  }

  async getSupportedLanguages(): Promise<string[]> {
    return [
      'en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko',
      'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'cs',
      'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'mt',
      'ga', 'cy', 'eu', 'ca', 'gl', 'is', 'mk', 'sq', 'bs', 'sr',
    ];
  }
}

/**
 * Get the default translation provider (LibreTranslate)
 */
let defaultProvider: TranslationProvider | null = null;

export function getTranslationProvider(): TranslationProvider {
  if (!defaultProvider) {
    defaultProvider = new LibreTranslateProvider();
  }
  return defaultProvider;
}

export function setTranslationProvider(provider: TranslationProvider): void {
  defaultProvider = provider;
}

/**
 * Translate text using the default provider
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<TranslationResult> {
  const provider = getTranslationProvider();
  return provider.translate(text, targetLang, sourceLang);
}

/**
 * Detect language of text
 */
export async function detectLanguage(text: string): Promise<string> {
  const provider = getTranslationProvider();
  const result = await provider.translate(text, 'en', 'auto');
  return result.detectedLanguage;
}

/**
 * Get user's preferred language from browser/app settings
 */
export function getUserPreferredLanguage(): string {
  // Check localStorage for user preference
  try {
    const saved = localStorage.getItem('nova_preferred_language');
    if (saved) return saved;
  } catch {
    void 0;
  }

  // Fallback to browser language
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.split('-')[0];
    // Return supported language or default to English
    const supported = ['en', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl'];
    if (supported.includes(lang)) return lang;
  }

  return 'en';
}

/**
 * Set user's preferred language
 */
export function setUserPreferredLanguage(lang: string): void {
  try {
    localStorage.setItem('nova_preferred_language', lang);
  } catch {
    void 0;
  }
}

/**
 * Language display names
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  pl: 'Polski',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  fi: 'Suomi',
  cs: 'Čeština',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  hr: 'Hrvatski',
  sk: 'Slovenčina',
  sl: 'Slovenščina',
  et: 'Eesti',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  mt: 'Malti',
  ga: 'Gaeilge',
  cy: 'Cymraeg',
  eu: 'Euskara',
  ca: 'Català',
  gl: 'Galego',
  is: 'Íslenska',
  mk: 'Македонски',
  sq: 'Shqip',
  bs: 'Bosanski',
  sr: 'Српски',
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}