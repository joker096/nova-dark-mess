/**
 * Measured round-trip latency per relay URL.
 *
 * Kept in memory only: latency is a signal for the user's privacy/performance
 * trade-off (Phase I), not a durable identifier, and it resets when the app
 * restarts just like the relay failure counters.
 */

export interface RelayLatencySample {
  ms: number;
  recordedAt: number;
}

const latencies = new Map<string, RelayLatencySample>();
const MAX_SAMPLES = 256;

export function recordRelayLatency(relayUrl: string, ms: number): void {
  if (!relayUrl || !Number.isFinite(ms) || ms < 0) return;
  if (latencies.size >= MAX_SAMPLES && !latencies.has(relayUrl)) {
    const first = latencies.keys().next().value;
    if (first !== undefined) latencies.delete(first);
  }
  latencies.set(relayUrl, { ms, recordedAt: Date.now() });
}

export function getRelayLatency(relayUrl: string): number | undefined {
  return latencies.get(relayUrl)?.ms;
}

export function getAllRelayLatencies(): ReadonlyMap<string, RelayLatencySample> {
  return new Map(latencies);
}

export function clearRelayLatency(): void {
  latencies.clear();
}
