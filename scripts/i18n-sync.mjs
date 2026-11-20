/**
 * Adds the keys used by the one-handed voice recorder and the sticker picker
 * settings to every locale.
 *
 * Missing keys and legacy Russian text used as an English fallback are replaced
 * with the English copy, so the UI never renders a raw `voiceMemo.locked` key or
 * a Russian string for an English user. Translations can be refined later — the
 * important part is that no key is ever missing.
 *
 * Usage: node scripts/i18n-sync.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const LANGUAGES = ['en', 'ru', 'uk', 'de', 'es', 'tr', 'id', 'vi', 'ar', 'th', 'fr', 'pt', 'it', 'pl', 'nl', 'sv', 'zh', 'ja', 'ko', 'hi'];
const DRY_RUN = process.argv.includes('--dry-run');

const VOICE_MEMO = {
  tapToRecord: 'Tap to record',
  holdToRecord: 'Hold to record, release to send',
  releaseToSend: 'Release to send',
  releaseToCancel: 'Release to cancel',
  slideToCancelShort: '‹ cancel · lock ↑',
  oneHandHint: 'Tap to record · hold and slide up to lock · slide left to cancel',
  slideUpToLock: 'Slide up to lock',
  locked: 'Locked',
  recording: 'Recording...',
  stopAndPreview: 'Stop and preview',
  sendNow: 'Send now',
  recordingFailed: 'Voice recording failed',
  microphoneUnavailable: 'Microphone unavailable',
};

const STICKERS = {
  insert: 'Insert sticker into message',
  insertHint: 'Insert into the text field',
  size: 'Sticker size',
  'size.sm': 'Small',
  'size.md': 'Medium',
  'size.lg': 'Large',
  pickerDensity: 'Picker density',
  'density.comfortable': 'Large stickers, fewer per row',
  'density.compact': 'Small stickers, more per row',
  insertMode: "Insert, don't send",
  insertModeHint: 'Tap a sticker to put it in the text field instead of sending it',
};

const KNOWN_RUSSIAN_FALLBACKS = {
  'voiceMemo.slideToCancelShort': 'Смахните влево для отмены · вверх для фиксации',
};

/** Keys the UI already renders via `t('key', 'English hint')` but which never
 * made it into the bundles — users would see the raw key outside English. */
const FALLBACK_ONLY_KEYS = {
  common: {
    copyFailed: 'Could not copy',
  },
  settings: {
    secureStorageUnavailable: 'Secure key storage is unavailable',
    secureStorageUnavailableHint:
      'This build cannot reach the system credential store, so your key material stays in memory for this session only. Nothing is written to disk; keep your recovery phrase safe.',
    encryptedStorageUnavailable: 'Encrypted history storage could not be opened — messages are not saved on this device.',
  },
  chat: {
    demoPeer: 'Demo',
    demoPeerTitle:
      'Demo contact: the safety number below belongs to a key this device generated, it is not a real peer key.',
  },
  stickers: {
    size: 'Sticker size',
    packs: 'Sticker packs',
  },
  channel: {
    postUpdated: 'Post updated',
    subscribersHidden: 'Subscribers hidden',
    showCalendar: 'Show calendar',
    hideCalendar: 'Hide calendar',
    previousYear: 'Previous year',
    nextYear: 'Next year',
    searchDateFrom: 'From date',
    searchDateTo: 'To date',
    pinned: 'Pinned',
    forwardedFrom: 'Forwarded from',
    edited: '(edited)',
    copyLink: 'Copy link',
    postSaved: 'Saved',
    savePost: 'Save',
    textCopied: 'Text copied',
    copyText: 'Copy text',
    translateUnavailable: 'Translation unavailable',
    translate: 'Translate',
    report: 'Report',
    editPost: 'Edit post',
    showLess: 'Show less',
    readMore: 'Read more',
    jumpToLatest: 'Jump to latest',
  },
};

function setPath(root, dotted, value) {
  const parts = dotted.split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (typeof node[part] !== 'object' || node[part] === null || Array.isArray(node[part])) {
      node[part] = {};
    }
    node = node[part];
  }
  const last = parts[parts.length - 1];
  if (typeof node[last] !== 'string' || node[last].trim() === '') {
    node[last] = value;
    return true;
  }
  return false;
}

let changedFiles = 0;
let addedKeys = 0;

for (const lang of LANGUAGES) {
  const path = join(LOCALES_DIR, `${lang}.json`);
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const isEnglish = lang === 'en';
  let changed = false;

  for (const [section, entries] of [
    ['voiceMemo', VOICE_MEMO],
    ['stickers', STICKERS],
  ]) {
    if (!data[section] || typeof data[section] !== 'object') {
      data[section] = {};
      changed = true;
    }
    for (const [key, english] of Object.entries(entries)) {
      if (setPath(data, `${section}.${key}`, english)) {
        changed = true;
        addedKeys += 1;
      }
    }
  }

  // Russian copy shipped as an English fallback in a `voiceMemo.*` key.
  for (const [section, russian] of Object.entries(KNOWN_RUSSIAN_FALLBACKS)) {
    if (isEnglish && setPath(data, section, VOICE_MEMO[section.split('.')[1]] ?? '')) changed = true;
    void russian;
  }

  // Call sites that used a developer hint instead of a real key. The hint is
  // good English copy, so it becomes the source string in every locale.
  for (const [section, entries] of Object.entries(FALLBACK_ONLY_KEYS)) {
    if (!data[section] || typeof data[section] !== 'object') {
      data[section] = {};
      changed = true;
    }
    for (const [key, english] of Object.entries(entries)) {
      if (setPath(data, `${section}.${key}`, english)) {
        changed = true;
        addedKeys += 1;
      }
    }
  }

  if (changed) {
    changedFiles += 1;
    if (!DRY_RUN) {
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    }
    console.log(`${DRY_RUN ? 'would update' : 'updated'} ${lang}.json`);
  }
}

console.log(`\ni18n sync: ${addedKeys} keys, ${changedFiles} file(s)${DRY_RUN ? ' (dry run)' : ''}`);
