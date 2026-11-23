/**
 * Social privacy preferences — per-contact/user visibility controls.
 * Mirrors Telegram's privacy settings: Last seen, Profile photo, Calls, Groups & Channels, Phone number, Blocked users.
 * Stored per contact ID in localStorage.
 */

import { CONTACT_PROFILES } from '../../data/mockMessengerData';

const SOCIAL_PRIVACY_KEY = 'nova_social_privacy_v1';

export type PrivacyScope = 'everyone' | 'contacts' | 'nobody';

export interface SocialPrivacySettings {
  lastSeen: PrivacyScope;
  profilePhoto: PrivacyScope;
  calls: PrivacyScope;
  groupsAndChannels: PrivacyScope;
  phoneNumber: PrivacyScope;
  blockedUsers: string[]; // contact IDs
  exceptions: Record<string, PrivacyScope>; // contactId -> override scope (for "always allow" / "never allow")
}

export interface ContactPrivacyOverride {
  lastSeen?: PrivacyScope;
  profilePhoto?: PrivacyScope;
  calls?: PrivacyScope;
  groupsAndChannels?: PrivacyScope;
  phoneNumber?: PrivacyScope;
}

const DEFAULT_SOCIAL_PRIVACY: SocialPrivacySettings = {
  lastSeen: 'contacts',
  profilePhoto: 'contacts',
  calls: 'contacts',
  groupsAndChannels: 'contacts',
  phoneNumber: 'contacts',
  blockedUsers: [],
  exceptions: {},
};

function readSocialPrivacy(): SocialPrivacySettings {
  try {
    const raw = localStorage.getItem(SOCIAL_PRIVACY_KEY);
    if (!raw) return { ...DEFAULT_SOCIAL_PRIVACY };
    const parsed = JSON.parse(raw) as Partial<SocialPrivacySettings>;
    return {
      lastSeen: parsed.lastSeen ?? DEFAULT_SOCIAL_PRIVACY.lastSeen,
      profilePhoto: parsed.profilePhoto ?? DEFAULT_SOCIAL_PRIVACY.profilePhoto,
      calls: parsed.calls ?? DEFAULT_SOCIAL_PRIVACY.calls,
      groupsAndChannels: parsed.groupsAndChannels ?? DEFAULT_SOCIAL_PRIVACY.groupsAndChannels,
      phoneNumber: parsed.phoneNumber ?? DEFAULT_SOCIAL_PRIVACY.phoneNumber,
      blockedUsers: Array.isArray(parsed.blockedUsers) ? parsed.blockedUsers : [],
      exceptions: parsed.exceptions && typeof parsed.exceptions === 'object' ? parsed.exceptions : {},
    };
  } catch {
    return { ...DEFAULT_SOCIAL_PRIVACY };
  }
}

function writeSocialPrivacy(settings: SocialPrivacySettings): void {
  try {
    localStorage.setItem(SOCIAL_PRIVACY_KEY, JSON.stringify(settings));
  } catch {
    void 0;
  }
}

export function getSocialPrivacy(): SocialPrivacySettings {
  return readSocialPrivacy();
}

export function setSocialPrivacy<K extends keyof SocialPrivacySettings>(
  key: K,
  value: SocialPrivacySettings[K]
): void {
  const current = readSocialPrivacy();
  const next = { ...current, [key]: value };
  writeSocialPrivacy(next);
}

/** Check if a contact is blocked by the current user. */
export function isContactBlocked(contactId: string): boolean {
  const settings = readSocialPrivacy();
  return settings.blockedUsers.includes(contactId);
}

/** Block or unblock a contact. */
export function setContactBlocked(contactId: string, blocked: boolean): void {
  const settings = readSocialPrivacy();
  if (blocked) {
    if (!settings.blockedUsers.includes(contactId)) {
      settings.blockedUsers.push(contactId);
    }
  } else {
    const idx = settings.blockedUsers.indexOf(contactId);
    if (idx >= 0) settings.blockedUsers.splice(idx, 1);
  }
  writeSocialPrivacy(settings);
}

/** Get all blocked contact IDs. */
export function getBlockedContacts(): string[] {
  return readSocialPrivacy().blockedUsers;
}

/** Set a per-contact exception for a privacy setting. */
export function setContactException(
  contactId: string,
  setting: 'lastSeen' | 'profilePhoto' | 'calls' | 'groupsAndChannels' | 'phoneNumber',
  scope: PrivacyScope
): void {
  const settings = readSocialPrivacy();
  const key = `${setting}:${contactId}`;
  if (scope === 'contacts') {
    // "contacts" is the default, so remove exception
    delete settings.exceptions[key];
  } else {
    settings.exceptions[key] = scope;
  }
  writeSocialPrivacy(settings);
}

/** Get the effective privacy scope for a contact, considering exceptions. */
export function getEffectiveScope(
  setting: 'lastSeen' | 'profilePhoto' | 'calls' | 'groupsAndChannels' | 'phoneNumber',
  contactId: string
): PrivacyScope {
  const settings = readSocialPrivacy();
  const exceptionKey = `${setting}:${contactId}`;
  if (settings.exceptions[exceptionKey]) {
    return settings.exceptions[exceptionKey];
  }
  return settings[setting];
}

/** Check if a contact can see a specific privacy setting for the current user. */
export function canContactSee(
  contactId: string,
  setting: 'lastSeen' | 'profilePhoto' | 'calls' | 'groupsAndChannels' | 'phoneNumber',
  isContact: boolean
): boolean {
  // Blocked users never see anything
  if (isContactBlocked(contactId)) return false;

  const scope = getEffectiveScope(setting, contactId);
  switch (scope) {
    case 'everyone':
      return true;
    case 'contacts':
      return isContact;
    case 'nobody':
      return false;
  }
}

/** Get the list of all known contact IDs (from MOCK_CHATS and CONTACT_PROFILES). */
export function getAllContactIds(): string[] {
  const ids = new Set<string>();
  // From CONTACT_PROFILES
  for (const id of Object.keys(CONTACT_PROFILES)) {
    ids.add(id);
  }
  // From MOCK_CHATS
  try {
    const { MOCK_CHATS } = require('../../data/mockMessengerData');
    for (const chat of MOCK_CHATS) {
      ids.add(chat.id);
    }
  } catch {
    // ignore
  }
  return Array.from(ids);
}

/** Get blocked contacts with their profile info for UI display. */
export function getBlockedContactsWithProfiles(): Array<{ id: string; name: string; avatar?: string }> {
  const blocked = getBlockedContacts();
  return blocked.map((id) => {
    const profile = CONTACT_PROFILES[id];
    return {
      id,
      name: profile?.name ?? id,
      avatar: profile?.avatar,
    };
  });
}