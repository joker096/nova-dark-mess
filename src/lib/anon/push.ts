/**
 * Push notification split (phase F).
 *
 * Push is the weakest point of any anonymous messenger: the provider learns
 * that *some* device was notified. Nova's contract keeps that to a minimum:
 *
 *   - the notification server stores only `pushToken -> queueId`;
 *   - the push body is empty ("check the relay");
 *   - no sender identity, no message text, no queue content ever leaves the
 *     device through this path.
 *
 * The provider (Apple/Google) therefore sees a wake-up, not a conversation.
 */
export interface PushRegistration {
  /** Provider token (FCM/APNs/UnifiedPush endpoint). */
  pushToken: string;
  /** Queue this device polls. No fingerprint, no invite. */
  queueId: string;
}

export interface PushHint {
  /** Always empty by design: the client must poll to learn anything. */
  body: '';
  /** Optional opaque counter so repeated hints are not byte-identical. */
  n?: number;
}

export function buildPushHint(random: () => number = Math.random): PushHint {
  return { body: '', n: Math.floor(random() * 1_000_000) };
}

export function isValidPushRegistration(value: unknown): value is PushRegistration {
  if (!value || typeof value !== 'object') return false;
  const reg = value as Record<string, unknown>;
  return (
    typeof reg.pushToken === 'string' &&
    reg.pushToken.length > 0 &&
    reg.pushToken.length <= 4096 &&
    typeof reg.queueId === 'string' &&
    /^q_[0-9a-f]{32}$/.test(reg.queueId)
  );
}

/**
 * Strips anything that is not part of the registration contract, so a buggy or
 * malicious client cannot smuggle content into the notification server.
 */
export function sanitizePushRegistration(value: unknown): PushRegistration | null {
  if (!isValidPushRegistration(value)) return null;
  return { pushToken: value.pushToken, queueId: value.queueId };
}

export interface PushTransportConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function pushFetch<T>(config: PushTransportConfig, path: string, init?: RequestInit): Promise<T | null> {
  const fetchFn = config.fetchImpl || fetch;
  try {
    const res = await fetchFn(`${normalizeBase(config.baseUrl)}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Tell the notification server to wake this device when the queue has traffic.
 * The server stores only `pushToken -> queueId`: no sender, no content.
 */
export async function registerPush(
  config: PushTransportConfig,
  pushToken: string,
  queueId: string,
): Promise<boolean> {
  const result = await pushFetch<{ ok: boolean }>(config, '/api/anon/push/register', {
    method: 'POST',
    body: JSON.stringify({ pushToken, queueId }),
  });
  return Boolean(result?.ok);
}

/**
 * Fetch the empty push hint ("check the relay"). The device must poll the relay
 * to learn anything; the hint itself carries no sender or content.
 */
export async function fetchPushHint(
  config: PushTransportConfig,
  pushToken: string,
): Promise<{ queueId: string } | null> {
  const url = new URL(`${normalizeBase(config.baseUrl)}/api/anon/push/hint`);
  url.searchParams.set('pushToken', pushToken);
  const result = await pushFetch<{ ok: boolean; queueId: string; hint: string }>(config, url.toString());
  return result?.ok ? { queueId: result.queueId } : null;
}

/**
 * A device token is bound to exactly one queue. That is deliberate: mapping one
 * token to several queues would let the notification service link a device's
 * contacts to each other. Providers that support topics/endpoints per
 * subscription (FCM topics, UnifiedPush distributors) hand out one token per
 * queue; a webhook bridge can do the same in front of APNs.
 */
export interface PushHintSubscription {
  pushToken: string;
  queueId: string;
  /** Relay hosting the queue; defaults to the poller's base URL. */
  baseUrl?: string;
}

/**
 * Derives the token for one queue. One provider subscription per queue keeps
 * the notification service from linking a device's contacts together.
 */
export function pushTokenForQueue(providerToken: string, queueId: string): string {
  return `${providerToken}:${queueId}`;
}

export interface PushHintPollerOptions {
  config: PushTransportConfig;
  /** Tokens/queues to watch; can change between polls (new contact queues). */
  subscriptions: () => PushHintSubscription[] | Promise<PushHintSubscription[]>;
  /** Called once per queue that reported new traffic. Must poll the relay. */
  onHint: (queueId: string) => void | Promise<void>;
  /** Base poll interval; default 60 s. */
  intervalMs?: number;
  /** Cap for the per-token failure backoff; default 10 min. */
  maxBackoffMs?: number;
  /** 0..1 jitter multiplier source; default Math.random. */
  jitter?: () => number;
  /** Overrides for tests / non-browser shells. */
  isVisible?: () => boolean;
  isOnline?: () => boolean;
}

export interface PushHintPoller {
  /** One pass now; returns the queues that produced a hint. */
  pollOnce(): Promise<string[]>;
  /** Starts the interval + visibility/online listeners; returns a stop function. */
  start(): () => void;
}

const PUSH_TOKEN_MAX = 4096;

/**
 * Watches the relay's empty "check the relay" hints. A hint only tells the
 * client that some queue may have traffic; the caller still polls and verifies
 * everything. Offline or hidden documents skip polling, failures back off per
 * token, and a successful hint resets that token's backoff.
 */
export function createPushHintPoller(options: PushHintPollerOptions): PushHintPoller {
  const intervalMs = options.intervalMs ?? 60_000;
  const maxBackoffMs = options.maxBackoffMs ?? 10 * 60_000;
  const jitter = options.jitter ?? Math.random;
  const misses = new Map<string, number>();
  const nextDue = new Map<string, number>();

  const isVisible =
    options.isVisible ??
    (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const isOnline =
    options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);

  async function pollOnce(): Promise<string[]> {
    if (!isVisible() || !isOnline()) return [];
    let subscriptions: PushHintSubscription[];
    try {
      subscriptions = await options.subscriptions();
    } catch {
      return [];
    }

    const seen = new Set<string>();
    const hinted: string[] = [];
    const now = Date.now();
    for (const subscription of subscriptions) {
      const valid =
        typeof subscription?.pushToken === 'string' &&
        subscription.pushToken.length > 0 &&
        subscription.pushToken.length <= PUSH_TOKEN_MAX &&
        /^q_[0-9a-f]{32}$/.test(subscription.queueId);
      if (!valid) continue;
      const token = subscription.pushToken;
      if (now < (nextDue.get(token) ?? 0)) continue;

      const hintConfig = subscription.baseUrl
        ? { ...options.config, baseUrl: subscription.baseUrl }
        : options.config;
      const hint = await fetchPushHint(hintConfig, token);
      if (!hint) {
        const count = (misses.get(token) ?? 0) + 1;
        misses.set(token, count);
        const backoff = Math.min(intervalMs * 2 ** Math.min(count, 6), maxBackoffMs);
        nextDue.set(token, Date.now() + backoff);
        continue;
      }

      misses.set(token, 0);
      nextDue.set(token, Date.now() + intervalMs + Math.floor(jitter() * intervalMs * 0.2));
      if (seen.has(hint.queueId)) continue;
      seen.add(hint.queueId);
      hinted.push(hint.queueId);
      try {
        await options.onHint(hint.queueId);
      } catch {
        /* the caller's poll failed; the next hint retries it */
      }
    }
    return hinted;
  }

  function start(): () => void {
    let stopped = false;
    const tick = () => {
      if (!stopped) void pollOnce();
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    const doc = typeof document !== 'undefined' ? document : null;
    const win = typeof window !== 'undefined' ? window : null;
    doc?.addEventListener('visibilitychange', tick);
    win?.addEventListener('online', tick);
    return () => {
      stopped = true;
      clearInterval(timer);
      doc?.removeEventListener('visibilitychange', tick);
      win?.removeEventListener('online', tick);
    };
  }

  return { pollOnce, start };
}
