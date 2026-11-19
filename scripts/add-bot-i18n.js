/**
 * Adds bot UI strings to all locale files (src/locales/*.json).
 *
 * Reads en.json as the reference, appends a `bot` section to every locale
 * (using en values where a locale lacks its own translation), and writes the
 * files back preserving the original key order with `bot` added at the end.
 *
 * Usage: node scripts/add-bot-i18n.js
 */
import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'src', 'locales');
const LANGUAGES = ['en', 'ru', 'uk', 'de', 'es', 'tr', 'id', 'vi', 'ar', 'th', 'fr', 'pt', 'it', 'pl', 'nl', 'sv', 'zh', 'ja', 'ko', 'hi'];

const BOT_STRINGS_EN = {
  title: 'Bots',
  create: 'Create bot',
  install: 'Install bot',
  revoke: 'Revoke',
  permission: 'Permission',
  readMessages: 'Read messages',
  sendMessages: 'Send messages',
  inlineKeyboard: 'Inline keyboard',
  media: 'Media',
  mentionOnly: 'Mention only',
  granted: 'Granted',
  denied: 'Denied',
  start: 'Start',
  help: 'Help',
  echo: 'Echo',
  noBots: 'No bots installed',
  installDesc: 'Install a bot from a nova://bot/... link or a local manifest file',
  permissionsRequired: 'This bot requests the following permissions:',
  grantAll: 'Grant all',
  cancel: 'Cancel',
};

function loadLocale(lang) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf-8'));
}

function insertBotSection(locale) {
  // Deep-clone so we don't mutate the parsed reference object.
  const out = JSON.parse(JSON.stringify(locale));
  out.bot = { ...BOT_STRINGS_EN };
  return out;
}

function main() {
  const en = loadLocale('en');
  const referenceBot = en.bot || BOT_STRINGS_EN;

  let changed = 0;
  for (const lang of LANGUAGES) {
    const file = path.join(LOCALES_DIR, `${lang}.json`);
    const locale = loadLocale(lang);

    if (locale.bot) {
      console.log(`[${lang}] bot section already present, skipping`);
      continue;
    }

    const next = insertBotSection(locale);
    // For non-en locales, fill in any missing translations from English.
    if (lang !== 'en') {
      for (const [key, value] of Object.entries(referenceBot)) {
        if (!(key in next.bot)) next.bot[key] = value;
      }
    }

    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    console.log(`[${lang}] added bot section`);
    changed += 1;
  }

  console.log(`\nDone. ${changed} locale file(s) updated.`);
}

main();
