import { readFileSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const LANGUAGES = ['en', 'ru', 'uk', 'de', 'es', 'tr', 'id', 'vi', 'ar', 'th', 'fr', 'pt', 'it', 'pl', 'nl', 'sv', 'zh', 'ja', 'ko', 'hi'] as const;

type Locale = Record<string, unknown>;

function loadLocale(lang: string): Locale {
  return JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), 'utf-8'));
}

function flatten(obj: Locale, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Locale, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

function audit(): boolean {
  const locales: Record<string, Record<string, string>> = {};
  let hasErrors = false;

  for (const lang of LANGUAGES) {
    locales[lang] = flatten(loadLocale(lang));
  }

  const referenceKeys = Object.keys(locales.en).sort();

  for (const lang of LANGUAGES) {
    if (lang === 'en') continue;
    const keys = Object.keys(locales[lang]).sort();
    const missing = referenceKeys.filter((k) => !(k in locales[lang]));
    const extra = keys.filter((k) => !(k in locales.en));

    if (missing.length > 0) {
      console.error(`[${lang}] Missing keys (${missing.length}):`);
      for (const k of missing) {
        console.error(`  - ${k}: ${locales.en[k]}`);
      }
      hasErrors = true;
    }

    if (extra.length > 0) {
      console.warn(`[${lang}] Extra keys not in en (${extra.length}):`);
      for (const k of extra) {
        console.warn(`  - ${k}`);
      }
    }

    if (missing.length === 0 && extra.length === 0) {
      console.log(`[${lang}] OK - all keys present`);
    }
  }

  // Check for empty values
  for (const lang of LANGUAGES) {
    const empties = Object.entries(locales[lang]).filter(([, v]) => v === '');
    if (empties.length > 0) {
      console.warn(`[${lang}] Empty values (${empties.length}):`);
      for (const [k] of empties) {
        console.warn(`  - ${k}`);
      }
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\ni18n audit: FAILED');
    process.exit(1);
  }

  console.log('\ni18n audit: PASSED');
  process.exit(0);
}

audit();
