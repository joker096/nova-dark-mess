/**
 * Granular notification preferences — per chat type, per contact, exceptions.
 * Mirrors Telegram's notification settings: private chats, groups, channels, exceptions.
 */

const NOTIFICATION_PREFS_KEY = 'nova_notification_prefs_v1';

export type ChatType = 'private' | 'group' | 'channel' | 'bot';
export type NotificationLevel = 'all' | 'mentions' | 'none';

export interface NotificationPrefs {
  // Global toggles
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
  previewMessages: boolean;

  // Per chat type defaults
  privateChats: NotificationLevel;
  groups: NotificationLevel;
  channels: NotificationLevel;
  bots: NotificationLevel;

  // Per-contact/channel exceptions (contactId -> NotificationLevel)
  exceptions: Record<string, NotificationLevel>;

  // Per-contact/channel custom sound (contactId -> SoundId)
  customSounds: Record<string, string>;

  // Per-contact/channel mute until (contactId -> timestamp)
  muteUntil: Record<string, number>;

  // Priority notifications (always notify even when muted)
  priorityContacts: string[]; // contact IDs that bypass mute

  // Per-folder notification settings (folderId -> NotificationLevel)
  folders: Record<string, NotificationLevel>;

  // Per-folder mute until (folderId -> timestamp)
  folderMuteUntil: Record<string, number>;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  sound: true,
  vibration: false,
  previewMessages: true,
  privateChats: 'all',
  groups: 'all',
  channels: 'mentions',
  bots: 'all',
  exceptions: {},
  customSounds: {},
  muteUntil: {},
  priorityContacts: [],
  folders: {},
  folderMuteUntil: {},
};

function readNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_NOTIFICATION_PREFS.enabled,
      sound: parsed.sound ?? DEFAULT_NOTIFICATION_PREFS.sound,
      vibration: parsed.vibration ?? DEFAULT_NOTIFICATION_PREFS.vibration,
      previewMessages: parsed.previewMessages ?? DEFAULT_NOTIFICATION_PREFS.previewMessages,
      privateChats: parsed.privateChats ?? DEFAULT_NOTIFICATION_PREFS.privateChats,
      groups: parsed.groups ?? DEFAULT_NOTIFICATION_PREFS.groups,
      channels: parsed.channels ?? DEFAULT_NOTIFICATION_PREFS.channels,
      bots: parsed.bots ?? DEFAULT_NOTIFICATION_PREFS.bots,
      exceptions: parsed.exceptions && typeof parsed.exceptions === 'object' ? parsed.exceptions : {},
      customSounds: parsed.customSounds && typeof parsed.customSounds === 'object' ? parsed.customSounds : {},
      muteUntil: parsed.muteUntil && typeof parsed.muteUntil === 'object' ? parsed.muteUntil : {},
      priorityContacts: Array.isArray(parsed.priorityContacts) ? parsed.priorityContacts : [],
      folders: parsed.folders && typeof parsed.folders === 'object' ? parsed.folders : {},
      folderMuteUntil: parsed.folderMuteUntil && typeof parsed.folderMuteUntil === 'object' ? parsed.folderMuteUntil : {},
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

function writeNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    void 0;
  }
}

export function getNotificationPrefs(): NotificationPrefs {
  return readNotificationPrefs();
}

export function setNotificationPref<K extends keyof NotificationPrefs>(
  key: K,
  value: NotificationPrefs[K]
): void {
  const current = readNotificationPrefs();
  const next = { ...current, [key]: value };
  writeNotificationPrefs(next);
}

/** Get the effective notification level for a contact, considering exceptions and mute. */
export function getEffectiveNotificationLevel(
  contactId: string,
  chatType: ChatType
): NotificationLevel {
  const prefs = readNotificationPrefs();

  // Check if muted
  const muteUntil = prefs.muteUntil[contactId];
  if (muteUntil && muteUntil > Date.now()) {
    return 'none';
  }

  // Check exceptions
  if (prefs.exceptions[contactId]) {
    return prefs.exceptions[contactId];
  }

  // Return default for chat type
  switch (chatType) {
    case 'private':
      return prefs.privateChats;
    case 'group':
      return prefs.groups;
    case 'channel':
      return prefs.channels;
    case 'bot':
      return prefs.bots;
    default:
      return 'all';
  }
}

/** Check if a notification should be shown for a contact. */
export function shouldNotify(
  contactId: string,
  chatType: ChatType,
  isMention: boolean = false
): boolean {
  const prefs = readNotificationPrefs();

  if (!prefs.enabled) return false;

  // Priority contacts always notify
  if (prefs.priorityContacts.includes(contactId)) return true;

  const level = getEffectiveNotificationLevel(contactId, chatType);

  switch (level) {
    case 'all':
      return true;
    case 'mentions':
      return isMention;
    case 'none':
      return false;
  }
}

/** Get custom sound for a contact, or fallback to default. */
export function getNotificationSound(contactId: string): string | null {
  const prefs = readNotificationPrefs();
  return prefs.customSounds[contactId] ?? null;
}

/** Set exception for a contact. */
export function setNotificationException(
  contactId: string,
  level: NotificationLevel
): void {
  const prefs = readNotificationPrefs();
  if (level === 'all') {
    delete prefs.exceptions[contactId];
  } else {
    prefs.exceptions[contactId] = level;
  }
  writeNotificationPrefs(prefs);
}

/** Set custom sound for a contact. */
export function setNotificationSound(contactId: string, soundId: string): void {
  const prefs = readNotificationPrefs();
  if (soundId === 'default') {
    delete prefs.customSounds[contactId];
  } else {
    prefs.customSounds[contactId] = soundId;
  }
  writeNotificationPrefs(prefs);
}

/** Mute a contact for a duration (in ms). */
export function muteContact(contactId: string, durationMs: number): void {
  const prefs = readNotificationPrefs();
  if (durationMs === 0) {
    delete prefs.muteUntil[contactId];
  } else {
    prefs.muteUntil[contactId] = Date.now() + durationMs;
  }
  writeNotificationPrefs(prefs);
}

/** Add/remove priority contact. */
export function setPriorityContact(contactId: string, priority: boolean): void {
  const prefs = readNotificationPrefs();
  if (priority) {
    if (!prefs.priorityContacts.includes(contactId)) {
      prefs.priorityContacts.push(contactId);
    }
  } else {
    const idx = prefs.priorityContacts.indexOf(contactId);
    if (idx >= 0) prefs.priorityContacts.splice(idx, 1);
  }
  writeNotificationPrefs(prefs);
}

/** Get all muted contacts with their remaining time. */
export function getMutedContacts(): Array<{ contactId: string; remainingMs: number }> {
  const prefs = readNotificationPrefs();
  const now = Date.now();
  return Object.entries(prefs.muteUntil)
    .filter(([, until]) => until > now)
    .map(([contactId, until]) => ({ contactId, remainingMs: until - now }));
}

/** Get all priority contacts. */
export function getPriorityContacts(): string[] {
  return readNotificationPrefs().priorityContacts;
}

/** Get all exceptions. */
export function getNotificationExceptions(): Record<string, NotificationLevel> {
  return readNotificationPrefs().exceptions;
}

/** Get all custom sounds. */
export function getCustomSounds(): Record<string, string> {
  return readNotificationPrefs().customSounds;
}

/** Mute duration presets (in ms). */
export const MUTE_DURATIONS = {
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  'forever': 0, // special value: 0 means forever (no timestamp)
} as const;

export type MuteDurationKey = keyof typeof MUTE_DURATIONS;

/** Apply a mute duration preset. */
export function applyMutePreset(contactId: string, preset: MuteDurationKey): void {
  const duration = MUTE_DURATIONS[preset];
  if (duration === 0) {
    // Forever mute - set a far future date
    muteContact(contactId, 100 * 365 * 24 * 60 * 60 * 1000);
  } else {
    muteContact(contactId, duration);
  }
}

/** Set notification level for a folder. */
export function setFolderNotificationLevel(
  folderId: string,
  level: NotificationLevel
): void {
  const prefs = readNotificationPrefs();
  if (level === 'all') {
    delete prefs.folders[folderId];
  } else {
    prefs.folders[folderId] = level;
  }
  writeNotificationPrefs(prefs);
}

/** Get notification level for a folder. */
export function getFolderNotificationLevel(folderId: string): NotificationLevel {
  const prefs = readNotificationPrefs();
  return prefs.folders[folderId] ?? 'all';
}

/** Mute a folder for a duration (in ms). */
export function muteFolder(folderId: string, durationMs: number): void {
  const prefs = readNotificationPrefs();
  if (durationMs === 0) {
    delete prefs.folderMuteUntil[folderId];
  } else {
    prefs.folderMuteUntil[folderId] = Date.now() + durationMs;
  }
  writeNotificationPrefs(prefs);
}

/** Get folder mute status. */
export function getFolderMuteUntil(folderId: string): number | undefined {
  return readNotificationPrefs().folderMuteUntil[folderId];
}

/** Get effective notification level for a folder, considering mute. */
export function getEffectiveFolderNotificationLevel(folderId: string): NotificationLevel {
  const prefs = readNotificationPrefs();
  const muteUntil = prefs.folderMuteUntil[folderId];
  if (muteUntil && muteUntil > Date.now()) {
    return 'none';
  }
  return prefs.folders[folderId] ?? 'all';
}