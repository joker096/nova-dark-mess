import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const SRC_DIR = join(process.cwd(), 'src');
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

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'locales' || entry === 'node_modules') continue;
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Namespaces that only exist in one component and are injected by a provider
 * other than i18next's default one are not translatable; keep the list short
 * and explicit so a typo cannot hide behind it.
 */
const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * `t('voiceMemo.locked', 'Locked')` renders "Locked" only when the key exists
 * in the locale. The second argument is a developer hint, not a translation,
 * so the key must be present in every locale — otherwise users get the raw key.
 */
function auditKeyUsage(locales: Record<string, Record<string, string>>): boolean {
  const referenceKeys = new Set(Object.keys(locales.en));
  const missing: Map<string, { file: string; key: string; fallback: string }> = new Map();
  const cyrillicFallbacks: string[] = [];
  const callPattern = /\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]\s*,\s*(['"])(.*?)\2/g;

  for (const file of walk(SRC_DIR)) {
    const source = readFileSync(file, 'utf-8');
    for (const match of source.matchAll(callPattern)) {
      const [, key, , fallback] = match;
      // Dynamic keys (`stickers.size.${value}`) never match this pattern.
      if (key.includes('${')) continue;
      if (!referenceKeys.has(key)) {
        missing.set(`${relative(process.cwd(), file)}::${key}`, {
          file: relative(process.cwd(), file),
          key,
          fallback,
        });
      }
      if (CYRILLIC.test(fallback)) {
        cyrillicFallbacks.push(`${relative(process.cwd(), file)}: t('${key}', '${fallback}')`);
      }
    }
  }

  if (missing.size > 0) {
    console.error(`t() keys missing from en.json (${missing.size}):`);
    for (const entry of missing.values()) {
      console.error(`  - ${entry.key} — ${entry.file} (fallback: "${entry.fallback}")`);
    }
  }

  if (cyrillicFallbacks.length > 0) {
    console.warn(`Russian text used as an i18n fallback (${cyrillicFallbacks.length}):`);
    for (const line of cyrillicFallbacks) console.warn(`  - ${line}`);
  }

  return missing.size === 0;
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

  // Static check: every literal t() key must exist in en.json.
  if (!auditKeyUsage(locales)) {
    hasErrors = true;
  }

  if (hasErrors) {
    console.error('\ni18n audit: FAILED');
    process.exit(1);
  }

  console.log('\ni18n audit: PASSED');
  process.exit(0);
}

audit();
