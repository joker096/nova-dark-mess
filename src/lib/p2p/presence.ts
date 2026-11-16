/**
 * Relay presence — who is online right now.
 *
 * The HTTP relay already addresses envelopes by destination fingerprint, so a
 * tiny presence heartbeat on top of it lets the mesh map show peers who are
 * actually online instead of only those we happen to have a session with.
 *
 * Presence is strictly opt-in (Settings → Privacy): when `presenceSharing` is
 * off, no heartbeat and no presence fetch ever leave the device. When it is on
 * and `presenceHashing` is enabled, the fingerprint is hashed with SHA-256
 * before it leaves the device, so the relay only ever sees an opaque
 * `ph1.<hex>` identifier that it cannot link to a real fingerprint, while two
 * devices that both know a fingerprint can still compute the same hash and
 * find each other on the map. The TTL controls how long the relay keeps a
 * heartbeat alive after the last one.
 *
 * Nothing here transmits content — at most a hashed (or raw, if hashing is
 * explicitly disabled) identifier plus a timestamp.
 */

import { getApiBase } from '../premium';
import {
  loadPrivacyPrefs,
  presenceTtlMs,
  type PresenceTtl,
} from '../network/privacyMode';

const HEARTBEAT_INTERVAL_MS = 60_000;

export interface PresenceEntry {
  fingerprint: string;
  lastSeen: number;
}

/** Derive the identifier a device announces itself with. */
export async function presenceIdFor(
  fingerprint: string,
  hash: boolean,
): Promise<string> {
  if (!hash) return fingerprint;
  const data = new TextEncoder().encode(`nova-presence:${fingerprint}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `ph1.${hex.slice(0, 32)}`;
}

function privacyDefaults(): { hash: boolean; ttl: PresenceTtl } {
  try {
    const prefs = loadPrivacyPrefs();
    return { hash: prefs.presenceHashing, ttl: prefs.presenceTtl };
  } catch {
    return { hash: true, ttl: 'normal' };
  }
}

/** Send a heartbeat for the local device. Fire-and-forget. */
export async function heartbeatPresence(
  fingerprint: string,
  fetchImpl: typeof fetch = fetch,
  opts: { hash?: boolean; ttl?: PresenceTtl } = {},
): Promise<boolean> {
  if (!fingerprint) return false;
  const { hash, ttl } = { ...privacyDefaults(), ...opts };
  try {
    const presenceId = await presenceIdFor(fingerprint, hash);
    const res = await fetchImpl(`${getApiBase()}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: presenceId, ttlMs: presenceTtlMs(ttl) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the list of presence identifiers seen within the presence TTL. When
 * hashing is on the caller resolves them back to fingerprints locally (only
 * for peers it actually knows — see `resolvePresenceIds`).
 */
export async function fetchPresence(
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  try {
    const res = await fetchImpl(`${getApiBase()}/api/presence`);
    if (!res.ok) return [];
    const data = (await res.json()) as { fingerprints?: unknown };
    if (!Array.isArray(data.fingerprints)) return [];
    return data.fingerprints.filter((f): f is string => typeof f === 'string');
  } catch {
    return [];
  }
}

/**
 * Turn relay presence identifiers back into fingerprints the device knows.
 * Hashed identifiers can only be resolved for peers whose fingerprint we have
 * locally (contacts, group members); unknown hashes stay opaque and are
 * dropped. Raw identifiers pass through unchanged.
 */
export async function resolvePresenceIds(
  ids: string[],
  knownFingerprints: string[],
  hash = privacyDefaults().hash,
): Promise<string[]> {
  const resolved = new Set<string>();
  const raw = new Set<string>();
  for (const id of ids) {
    if (!id.startsWith('ph1.')) raw.add(id);
  }
  for (const fingerprint of knownFingerprints) {
    if (raw.has(fingerprint)) resolved.add(fingerprint);
    if (hash && ids.includes(await presenceIdFor(fingerprint, true))) {
      resolved.add(fingerprint);
    }
  }
  return [...resolved];
}

export const PRESENCE_HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;
