/**
 * Persistent relay failure counters.
 *
 * Survives restarts so a relay that repeatedly fails transport checks stays
 * flagged even after the app is closed and reopened. Cleared on a single
 * successful probe (noteRelaySuccess). Format mirrors blocks.ts: a flat
 * JSON object under `anon_relay_failures_v1` mapping relay URL -> failure
 * count, capped at FAILOVER_AFTER_FAILURES.
 *
 * Not encrypted: failure counters are not secrets — they only record that a
 * relay was unreachable. The sensitive data (queue keys, message content)
 * never touches this store.
 */

const STORAGE_KEY = 'anon_relay_failures_v1';

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export interface PersistentFailureMap {
  [relayUrl: string]: number;
}

export function loadFailureMap(): PersistentFailureMap {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const out: PersistentFailureMap = {};
    for (const [url, count] of Object.entries(value)) {
      if (typeof url === 'string' && typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        out[url] = count;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFailureMap(map: PersistentFailureMap): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage may be unavailable or full — counters are a best-effort signal */
  }
}

export function clearFailureMap(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
