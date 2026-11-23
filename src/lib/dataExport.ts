import { dbInstance } from './storage/db';
import { loadAccount } from './account/account';

const EXPORT_VERSION = 1;
const EXPORT_FILE_NAME = 'nova_my_data_export.json';

/** Human-readable category for a localStorage key, mirroring SettingsModal. */
function categoryOf(key: string): string {
  if (key.startsWith('nova_backup_') || key.startsWith('nova_cloud_')) return 'backup';
  if (key.startsWith('nova_ads_')) return 'ads';
  if (key.startsWith('nova_local_analytics')) return 'analytics';
  if (key.startsWith('nova_account_') || key.startsWith('nova_pk_') || key.startsWith('nova_identity_')) return 'identity';
  if (key.startsWith('nova_created_groups') || key.startsWith('nova_created_group_') || key.startsWith('nova_messenger_chat_cache')) return 'chats';
  if (key.startsWith('nova_contact_')) return 'contacts';
  if (key.startsWith('nova_sticker_')) return 'stickers';
  if (key.startsWith('nova_premium_')) return 'premium';
  if (key.startsWith('nova_chat_theme') || key.startsWith('nova_wallpaper') || key.startsWith('nova_messenger_settings')) return 'settings';
  if (key.startsWith('nova_notification_')) return 'notifications';
  if (key.startsWith('nova_onboarding_')) return 'onboarding';
  if (key.startsWith('nova_messenger_chat_')) return 'messages';
  return 'other';
}

/** Snapshot of the encrypted local database (messages, sessions, prekeys, settings). */
async function snapshotEncryptedDb(): Promise<unknown> {
  try {
    const db = dbInstance;
    // @ts-ignore — internal snapshot helper, kept in sync with lib/storage/db.ts
    const snapshot = await (db as any).exportSnapshot?.();
    return snapshot ?? null;
  } catch {
    return null;
  }
}

/** Assemble everything the user owns into a single portable JSON document. */
export async function buildMyDataExport(): Promise<string> {
  const localStorageEntries: Array<{ key: string; value: string; category: string }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      localStorageEntries.push({ key, value, category: categoryOf(key) });
    }
  } catch { /* storage unavailable: report what we have */ }

  const account = loadAccount();

  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'Nova Dark Messenger',
      account,
      localStorage: localStorageEntries,
      encryptedDatabase: await snapshotEncryptedDb(),
    },
    null,
    2,
  );
}

/** Download the assembled export as a file. Returns the file name. */
export async function downloadMyDataExport(): Promise<string> {
  const json = await buildMyDataExport();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = EXPORT_FILE_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return EXPORT_FILE_NAME;
}
