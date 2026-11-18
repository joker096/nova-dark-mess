export interface WipeableMessage {
  text?: string;
  mediaUrl?: string;
  images?: unknown;
  document?: unknown;
  voiceNote?: unknown;
  location?: unknown;
  poll?: unknown;
  sticker?: unknown;
  replyTo?: unknown;
  forwardedFrom?: string;
  expiresAt?: number;
  wiped?: boolean;
  [key: string]: unknown;
}

/**
 * Overwrites sensitive fields of an arbitrary value with empty/zero values.
 * Strings and arrays are cleared in place where possible; nested objects are
 * wiped recursively. This is a best-effort in-memory wipe (JS strings are
 * immutable, so callers should drop references to the original afterwards).
 */
export function secureWipe(value: unknown): void {
  if (value === null || value === undefined) return;
  if (value instanceof ArrayBuffer) {
    new Uint8Array(value).fill(0);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(0);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (item !== null && typeof item === 'object') secureWipe(item);
      value[index] = undefined;
    }
    value.length = 0;
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'string') {
        obj[key] = '';
      } else if (v && typeof v === 'object') {
        secureWipe(v);
      } else if (typeof v === 'number') {
        obj[key] = 0;
      } else if (typeof v === 'boolean') {
        obj[key] = false;
      }
    }
  }
}

export function secureWipeMessage<T>(message: T): T {
  if (message === null || typeof message !== 'object') return message;
  const target = message as WipeableMessage;
  const sensitiveFields = [
    'text',
    'mediaUrl',
    'images',
    'document',
    'voiceNote',
    'location',
    'poll',
    'sticker',
    'replyTo',
    'forwardedFrom',
  ] as const;

  for (const field of sensitiveFields) {
    const value = target[field];
    if (value !== null && typeof value === 'object') secureWipe(value);
    target[field] = undefined;
  }
  target.wiped = true;
  return message;
}

export const wipeMessage = secureWipeMessage;
export const wipeMessageSecurely = secureWipeMessage;

export function wipeExpiredMessages<T extends { expiresAt?: number }>(
  messages: T[],
  now: number = Date.now(),
): T[] {
  const kept: T[] = [];
  for (const msg of messages) {
    if (msg.expiresAt !== undefined && msg.expiresAt <= now) {
      secureWipeMessage(msg);
    } else {
      kept.push(msg);
    }
  }
  return kept;
}

export default secureWipe;