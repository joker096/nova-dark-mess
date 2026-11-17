/**
 * Multi-relay support: keep several independent relays/operators configured and
 * rotate queues between them, so no single operator sees a contact's whole
 * traffic history.
 */

export interface RelayEndpoint {
  id: string;
  /** Base URL of the relay (or of the proxy that fronts it). */
  url: string;
  /** Optional operator/jurisdiction label, used only for local selection. */
  operator?: string;
}

export interface RelaySelection {
  primary: RelayEndpoint;
  /** Relay used for the opposite direction of a contact. */
  secondary?: RelayEndpoint;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Picks two different relays for a contact so inbound and outbound traffic do
 * not share an operator. Deterministic per contact id: both sides derive the
 * same split from the shared contact seed.
 */
export function selectRelaysForContact(relays: RelayEndpoint[], contactSeed: string): RelaySelection | null {
  if (relays.length === 0) return null;
  const sorted = [...relays].sort((a, b) => a.id.localeCompare(b.id));
  const start = hashString(contactSeed) % sorted.length;
  const primary = sorted[start];
  if (sorted.length === 1) return { primary };
  const secondary = sorted[(start + 1) % sorted.length];
  return { primary, secondary };
}

/**
 * Rotation plan: how long a queue may live before it should be re-created on
 * another relay. Rotation bounds how much history one operator accumulates.
 */
export const DEFAULT_QUEUE_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldRotateQueue(createdAt: number, now: number = Date.now(), rotationMs = DEFAULT_QUEUE_ROTATION_MS): boolean {
  return now - createdAt >= rotationMs;
}

export function nextRelay(current: RelayEndpoint, relays: RelayEndpoint[]): RelayEndpoint | null {
  if (relays.length <= 1) return null;
  const sorted = [...relays].sort((a, b) => a.id.localeCompare(b.id));
  const idx = sorted.findIndex((relay) => relay.id === current.id);
  if (idx < 0) return sorted[0];
  return sorted[(idx + 1) % sorted.length];
}
