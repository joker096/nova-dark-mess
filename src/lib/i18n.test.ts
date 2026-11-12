import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import uk from '../locales/uk.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import tr from '../locales/tr.json';
import id from '../locales/id.json';
import vi from '../locales/vi.json';
import ar from '../locales/ar.json';
import th from '../locales/th.json';

type Locale = Record<string, unknown>;

const LOCALES: Record<string, Locale> = { en, ru, uk, de, es, tr, id, vi, ar, th };

function collectKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys.push(...collectKeys(v, full));
      } else {
        keys.push(full);
      }
    }
  }
  return keys;
}

describe('i18n - locale key parity', () => {
  const enKeys = collectKeys(en).sort();

  it('all locales define the same top-level namespaces as en', () => {
    for (const [lang, locale] of Object.entries(LOCALES)) {
      if (lang === 'en') continue;
      const missing = Object.keys(en).filter((ns) => !(ns in locale));
      expect(missing).toEqual([]);
    }
  });

  it('every en key exists in all locales (no missing translations)', () => {
    for (const lang of Object.keys(LOCALES)) {
      if (lang === 'en') continue;
      const localeKeys = collectKeys(LOCALES[lang]).sort();
      const missing = enKeys.filter((k) => !localeKeys.includes(k));
      expect(missing, `${lang} missing keys: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('no empty translation values in any locale', () => {
    for (const [lang, locale] of Object.entries(LOCALES)) {
      const keys = collectKeys(locale);
      const empty = keys.filter((k) => {
        const parts = k.split('.');
        let cur: unknown = locale;
        for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
        return cur === '' || cur === null || cur === undefined;
      });
      expect(empty, `${lang} empty values: ${empty.join(', ')}`).toEqual([]);
    }
  });

  it('menu-related keys exist in all locales', () => {
    const menuKeys = [
      'common.chats',
      'common.channels',
      'common.folders',
      'common.settings',
      'common.profile',
      'chats.title',
      'folders.title',
      'settings.title',
      'profile.title',
      'analytics.title',
      'app.name',
    ];
    for (const locale of Object.values(LOCALES)) {
      const localeKeys = collectKeys(locale);
      for (const k of menuKeys) {
        expect(localeKeys).toContain(k);
      }
    }
  });
});
