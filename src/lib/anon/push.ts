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
