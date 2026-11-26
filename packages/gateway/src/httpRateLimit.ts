/**
 * HTTP API Rate Limiting for Bot Gateway
 * 
 * Protects webhook and bot API endpoints from abuse.
 * Uses IP-based and token-based tracking with configurable limits.
 */

import { safeStorage } from '../../lib/storage/safeStorage';

export interface HttpRateLimitConfig {
  /** Max requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Violations before auto-block */
  violationThreshold: number;
  /** How long to keep tracking data (ms) */
  ttlMs: number;
  /** Block duration after violation threshold (ms) */
  blockDurationMs: number;
}

export const DEFAULT_HTTP_RATE_LIMIT_CONFIG: HttpRateLimitConfig = {
  maxRequests: 100,        // 100 requests per minute
  windowMs: 60_000,
  violationThreshold: 5,
  ttlMs: 24 * 60 * 60 * 1000,
  blockDurationMs: 15 * 60 * 1000, // 15 minutes
};

export interface HttpRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  blocked: boolean;
  blockedAt: number | null;
}

interface HttpTracker {
  requests: number[];
  violations: number;
  blockedAt: number | null;
  lastUpdated: number;
}

const STORAGE_KEY = 'nova_gateway_http_rate_limit_v1';
const MAX_TRACKERS = 50_000;

let sessionTrackers: Map<string, HttpTracker> | null = null;

function loadTrackers(): Map<string, HttpTracker> {
  if (sessionTrackers !== null) {
    return new Map(sessionTrackers);
  }
  const storage = safeStorage();
  if (!storage) return new Map();
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return new Map();
    const map = new Map<string, HttpTracker>();
    const now = Date.now();
    for (const [key, value] of Object.entries(raw)) {
      const tracker = value as HttpTracker;
      if (
        tracker &&
        typeof tracker === 'object' &&
        Array.isArray(tracker.requests) &&
        typeof tracker.violations === 'number' &&
        typeof tracker.lastUpdated === 'number' &&
        now - tracker.lastUpdated < DEFAULT_HTTP_RATE_LIMIT_CONFIG.ttlMs
      ) {
        map.set(key, tracker);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveTrackers(map: Map<string, HttpTracker>): void {
  sessionTrackers = new Map(map);
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (map.size > MAX_TRACKERS) {
      const now = Date.now();
      const entries = Array.from(map.entries())
        .filter(([, v]) => now - v.lastUpdated < DEFAULT_HTTP_RATE_LIMIT_CONFIG.ttlMs)
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
 * Generate a tracking key from IP and/or token
 */
export function getHttpRateLimitKey(ip: string, token?: string): string {
  return token ? `${ip}:${token}` : ip;
}

/**
 * Check and record a request for rate limiting
 */
export function checkHttpRateLimit(
  key: string,
  config: Partial<HttpRateLimitConfig> = {}
): HttpRateLimitResult {
  const cfg = { ...DEFAULT_HTTP_RATE_LIMIT_CONFIG, ...config };
  const trackers = loadTrackers();
  const tracker = trackers.get(key);
  const now = Date.now();

  // Check if currently blocked
  if (tracker && tracker.blockedAt !== null) {
    const blockEnd = tracker.blockedAt + cfg.blockDurationMs;
    if (now < blockEnd) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: blockEnd,
        blocked: true,
        blockedAt: tracker.blockedAt,
      };
    }
    // Block expired, clear it
    tracker.blockedAt = null;
    tracker.violations = 0;
  }

  // Clean old requests
  const recentRequests = tracker
    ? tracker.requests.filter((ts) => now - ts < cfg.windowMs)
    : [];

  const requestCount = recentRequests.length;

  if (requestCount >= cfg.maxRequests) {
    // Violation!
    const newTracker: HttpTracker = tracker || {
      requests: [],
      violations: 0,
      blockedAt: null,
      lastUpdated: now,
    };
    newTracker.requests = recentRequests;
    newTracker.violations += 1;
    newTracker.lastUpdated = now;

    if (newTracker.violations >= cfg.violationThreshold) {
      newTracker.blockedAt = now;
      trackers.set(key, newTracker);
      saveTrackers(trackers);
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + cfg.blockDurationMs,
        blocked: true,
        blockedAt: now,
      };
    }

    trackers.set(key, newTracker);
    saveTrackers(trackers);
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + cfg.windowMs,
      blocked: false,
      blockedAt: null,
    };
  }

  // Allow request
  recentRequests.push(now);
  const newTracker: HttpTracker = tracker || {
    requests: [],
    violations: 0,
    blockedAt: null,
    lastUpdated: now,
  };
  newTracker.requests = recentRequests;
  newTracker.lastUpdated = now;
  trackers.set(key, newTracker);
  saveTrackers(trackers);

  return {
    allowed: true,
    remaining: cfg.maxRequests - requestCount - 1,
    resetAt: now + cfg.windowMs,
    blocked: false,
    blockedAt: null,
  };
}

/**
 * Get current rate limit status for a key
 */
export function getHttpRateLimitStatus(
  key: string,
  config: Partial<HttpRateLimitConfig> = {}
): HttpRateLimitResult {
  const cfg = { ...DEFAULT_HTTP_RATE_LIMIT_CONFIG, ...config };
  const trackers = loadTrackers();
  const tracker = trackers.get(key);
  const now = Date.now();

  if (!tracker) {
    return { allowed: true, remaining: cfg.maxRequests, resetAt: now + cfg.windowMs, blocked: false, blockedAt: null };
  }

  if (tracker.blockedAt !== null) {
    const blockEnd = tracker.blockedAt + cfg.blockDurationMs;
    if (now < blockEnd) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: blockEnd,
        blocked: true,
        blockedAt: tracker.blockedAt,
      };
    }
  }

  const recentRequests = tracker.requests.filter((ts) => now - ts < cfg.windowMs).length;
  return {
    allowed: recentRequests < cfg.maxRequests,
    remaining: Math.max(0, cfg.maxRequests - recentRequests),
    resetAt: now + cfg.windowMs,
    blocked: false,
    blockedAt: tracker.blockedAt,
  };
}

/**
 * Manually unblock a key
 */
export function unblockHttpRateLimit(key: string): boolean {
  const trackers = loadTrackers();
  const tracker = trackers.get(key);
  if (!tracker || tracker.blockedAt === null) return false;
  tracker.blockedAt = null;
  tracker.violations = 0;
  trackers.set(key, tracker);
  saveTrackers(trackers);
  return true;
}

/**
 * Clear all rate limit data
 */
export function clearHttpRateLimitData(): void {
  sessionTrackers = new Map();
  const storage = safeStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {}
  }
}