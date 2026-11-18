/**
 * Relay health bookkeeping for live-queue failover.
 *
 * A queue pinned to a relay that stops answering would otherwise sit there
 * until its rotation window (a week by default) or until it expires, so the
 * client has to notice repeated transport failures and move the queue early.
 * Counters are deliberately in-memory and per relay URL: they only decide
 * "is this relay unusable right now", and a single success clears them.
 */

/** Consecutive failures that make a relay unusable for a live queue. */
export const FAILOVER_AFTER_FAILURES = 3;

export interface RelayFailureCount {
  failures: number;
}

export type RelayFailureMap = Readonly<Record<string, RelayFailureCount>>;

export function noteRelayFailure(
  map: RelayFailureMap,
  relayUrl: string,
  failures: number = FAILOVER_AFTER_FAILURES,
): RelayFailureMap {
  const previous = map[relayUrl]?.failures ?? 0;
  if (previous >= failures) return map;
  return { ...map, [relayUrl]: { failures: previous + 1 } };
}

export function noteRelaySuccess(map: RelayFailureMap, relayUrl: string): RelayFailureMap {
  if (!map[relayUrl]) return map;
  const next = { ...map };
  delete next[relayUrl];
  return next;
}

/** True once the relay failed often enough that its queue should move. */
export function shouldFailoverRelay(
  map: RelayFailureMap,
  relayUrl: string,
  failures: number = FAILOVER_AFTER_FAILURES,
): boolean {
  return (map[relayUrl]?.failures ?? 0) >= failures;
}
