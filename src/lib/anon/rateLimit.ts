/**
 * Rate limiting for spam protection.
 *
 * Tracks message rates per signing key and can auto-block senders
 * that exceed configured thresholds. All state is local to the device.
 */

export interface RateLimitConfig {
  /** Maximum messages allowed in the time window. */
  maxMessages: number;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Number of violations before auto-blocking. */
  violationThreshold: number;
  /** How long to keep tracking data (ms). */
  ttlMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxMessages: 20,
  windowMs: 60_000,
  violationThreshold: 3,
  ttlMs: 24 * 60 * 60 * 1000,
};

interface SenderTracker {
  messages: number[];
  violations: number;
  blockedAt: number | null;
  lastUpdated: number;
}

const STORAGE_KEY = 'nova_anon_rate_limit_v1';
const MAX_TRACKERS = 10_000;

let sessionTrackers: Map<string, SenderTracker> | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function loadTrackers(): Map<string, SenderTracker> {
  console.log('[rateLimit] loadTrackers, sessionTrackers:', sessionTrackers?.size ?? 'null');
  if (sessionTrackers !== null) {
    console.log('[rateLimit] returning cached, size:', sessionTrackers.size);
    return new Map(sessionTrackers);
  }
  const storage = safeStorage();
  if (!storage) return new Map();
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    console.log('[rateLimit] loaded from storage:', raw);
    if (!raw || typeof raw !== 'object') return new Map();
    const map = new Map<string, SenderTracker>();
    const now = Date.now();
    for (const [key, value] of Object.entries(raw)) {
      const tracker = value as SenderTracker;
      if (
        tracker &&
        typeof tracker === 'object' &&
        Array.isArray(tracker.messages) &&
        typeof tracker.violations === 'number' &&
        typeof tracker.lastUpdated === 'number' &&
        now - tracker.lastUpdated < DEFAULT_RATE_LIMIT_CONFIG.ttlMs
      ) {
        map.set(key, tracker);
      }
    }
    console.log('[rateLimit] parsed map size:', map.size);
    return map;
  } catch {
    return new Map();
  }
}

function saveTrackers(map: Map<string, SenderTracker>): void {
  sessionTrackers = new Map(map);
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (map.size > MAX_TRACKERS) {
      const now = Date.now();
      const entries = Array.from(map.entries())
        .filter(([, v]) => now - v.lastUpdated < DEFAULT_RATE_LIMIT_CONFIG.ttlMs)
        .sort((a, b) => b[1].lastUpdated - a[1].lastUpdated)
        .slice(0, MAX_TRACKERS);
      map = new Map(entries);
    }
    const obj = Object.fromEntries(map);
    storage.setItem(STORAGE_KEY, JSON.stringify(obj));
    sessionTrackers = null;
  } catch {
    // Storage unavailable, keep in memory
  }
}

/**
 * Records a message from a sender and checks if they should be blocked.
 * Returns true if the sender is now blocked (either already was or just got blocked).
 */
export function recordMessage(
  signingPublicKey: string,
  config: Partial<RateLimitConfig> = {}
): { blocked: boolean; violations: number; messageCount: number } {
  const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  const trackers = loadTrackers();
  const now = Date.now();

  let tracker = trackers.get(signingPublicKey);
  if (!tracker) {
    tracker = { messages: [], violations: 0, blockedAt: null, lastUpdated: now };
  }

  // Clean old messages outside the window
  tracker.messages = tracker.messages.filter((ts) => now - ts < cfg.windowMs);
  tracker.messages.push(now);
  tracker.lastUpdated = now;

  const messageCount = tracker.messages.length;
  let blocked = false;

  if (tracker.blockedAt !== null) {
    blocked = true;
  } else if (messageCount > cfg.maxMessages) {
    tracker.violations += 1;
    if (tracker.violations >= cfg.violationThreshold) {
      tracker.blockedAt = now;
      blocked = true;
    }
  }

  trackers.set(signingPublicKey, tracker);
  saveTrackers(trackers);

  return { blocked, violations: tracker.violations, messageCount };
}

/**
 * Checks if a sender is currently rate-limited (blocked).
 */
export function isRateLimited(signingPublicKey: string): boolean {
  const trackers = loadTrackers();
  const tracker = trackers.get(signingPublicKey);
  return tracker !== undefined && tracker.blockedAt !== null;
}

/**
 * Gets current rate limit status for a sender.
 */
export function getRateLimitStatus(signingPublicKey: string, config: Partial<RateLimitConfig> = {}): {
  messageCount: number;
  violations: number;
  blocked: boolean;
  blockedAt: number | null;
} {
  const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  const trackers = loadTrackers();
  const tracker = trackers.get(signingPublicKey);
  if (!tracker) {
    return { messageCount: 0, violations: 0, blocked: false, blockedAt: null };
  }
  const now = Date.now();
  const recentMessages = tracker.messages.filter((ts) => now - ts < cfg.windowMs).length;
  return {
    messageCount: recentMessages,
    violations: tracker.violations,
    blocked: tracker.blockedAt !== null,
    blockedAt: tracker.blockedAt,
  };
}

/**
 * Manually blocks a sender (adds to rate limit block list).
 */
export function blockSenderRateLimit(signingPublicKey: string): boolean {
  const trackers = loadTrackers();
  let tracker = trackers.get(signingPublicKey);
  if (!tracker) {
    tracker = { messages: [], violations: 0, blockedAt: null, lastUpdated: Date.now() };
  }
  if (tracker.blockedAt !== null) return true;
  tracker.blockedAt = Date.now();
  trackers.set(signingPublicKey, tracker);
  saveTrackers(trackers);
  return true;
}

/**
 * Unblocks a sender from rate limiting.
 */
export function unblockSenderRateLimit(signingPublicKey: string): boolean {
  const trackers = loadTrackers();
  const tracker = trackers.get(signingPublicKey);
  if (!tracker || tracker.blockedAt === null) return false;
  tracker.blockedAt = null;
  tracker.violations = 0;
  trackers.set(signingPublicKey, tracker);
  saveTrackers(trackers);
  return true;
}

/**
 * Clears all rate limit data.
 */
export function clearRateLimitData(): void {
  sessionTrackers = null;
  const storage = safeStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}