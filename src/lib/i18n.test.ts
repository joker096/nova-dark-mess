import { describe, it, expect } from 'vitest';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

type Locale = Record<string, unknown>;

const LOCALES: Record<string, Locale> = { en, ru };

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

  it('ru defines the same top-level namespaces as en', () => {
    const missing = Object.keys(en).filter((ns) => !(ns in ru));
    expect(missing).toEqual([]);
  });

  it('every en key exists in ru (no missing translations)', () => {
    const localeKeys = collectKeys(ru).sort();
    const missing = enKeys.filter((k) => !localeKeys.includes(k));
    expect(missing, `ru missing keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('no empty translation values in ru', () => {
    const keys = collectKeys(ru);
    const empty = keys.filter((k) => {
      const parts = k.split('.');
      let cur: unknown = ru;
      for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
      return cur === '' || cur === null || cur === undefined;
    });
    expect(empty, `ru empty values: ${empty.join(', ')}`).toEqual([]);
  });

  it('menu-related keys exist in ru', () => {
    const menuKeys = [
      'common.chats',
      'common.channels',
      'common.folders',
      'common.settings',
      'common.profile',
      'chats.title',
      'foldersObj.title',
      'settings.title',
      'profile.title',
      'analytics.title',
      'app.name',
    ];
    const localeKeys = collectKeys(ru);
    for (const k of menuKeys) {
      expect(localeKeys).toContain(k);
    }
  });
});
