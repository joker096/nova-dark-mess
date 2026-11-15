/**
 * Relay presence — who is online right now.
 *
 * The HTTP relay already addresses envelopes by destination fingerprint, so a
 * tiny presence heartbeat on top of it lets the mesh map show peers who are
 * actually online instead of only those we happen to have a session with.
 *
 * Nothing here transmits content: the heartbeat carries only the device's own
 * fingerprint (which the relay already knows as a destination address) and a
 * timestamp. The server keeps an in-memory last-seen map with a short TTL.
 */

import { getApiBase } from '../premium';

const HEARTBEAT_INTERVAL_MS = 60_000;
const PRESENCE_TTL_MS = 2 * 60_000;

export interface PresenceEntry {
  fingerprint: string;
  lastSeen: number;
}

/** Send a heartbeat for the local device. Fire-and-forget. */
export async function heartbeatPresence(
  fingerprint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!fingerprint) return false;
  try {
    const res = await fetchImpl(`${getApiBase()}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch the list of fingerprints seen within the presence TTL. */
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

export const PRESENCE_HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;
export const PRESENCE_TTL_MS_CONST = PRESENCE_TTL_MS;