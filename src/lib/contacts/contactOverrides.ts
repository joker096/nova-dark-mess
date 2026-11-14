import { CONTACT_PROFILES } from '../../data/mockMessengerData';

export const CONTACT_OVERRIDES_KEY = 'nova_contact_overrides_v1';

export interface ContactOverride {
  name?: string;
  nickname?: string;
  phone?: string;
  avatar?: string;
}

export type ContactOverrideMap = Record<string, ContactOverride>;

const OVERRIDE_FIELDS: Array<keyof ContactOverride> = ['name', 'nickname', 'phone', 'avatar'];

function sanitizeOverride(value: unknown): ContactOverride | null {
  if (!value || typeof value !== 'object') return null;
  const result: ContactOverride = {};
  for (const field of OVERRIDE_FIELDS) {
    const next = (value as Record<string, unknown>)[field];
    if (typeof next === 'string') {
      result[field] = next;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function loadContactOverrides(): ContactOverrideMap {
  try {
    const raw = localStorage.getItem(CONTACT_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: ContactOverrideMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const override = sanitizeOverride(value);
      if (override) result[id] = override;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveContactOverride(
  contactId: string,
  patch: ContactOverride,
): ContactOverrideMap {
  const sanitized = sanitizeOverride(patch) ?? {};
  const all = loadContactOverrides();
  const next: ContactOverrideMap = {
    ...all,
    [contactId]: { ...all[contactId], ...sanitized },
  };
  try {
    localStorage.setItem(CONTACT_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    void 0;
  }
  const profile = CONTACT_PROFILES[contactId];
  if (profile) {
    Object.assign(profile, sanitized);
  }
  return next;
}

export function applyContactOverrides(): void {
  const all = loadContactOverrides();
  for (const [contactId, override] of Object.entries(all)) {
    const profile = CONTACT_PROFILES[contactId];
    if (profile) {
      Object.assign(profile, override);
    }
  }
}
