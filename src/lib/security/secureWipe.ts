export interface WipeableMessage {
  text?: string;
  mediaUrl?: string;
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
  if (value instanceof Uint8Array || value instanceof Int8Array || value instanceof Uint16Array ||
      value instanceof Int16Array || value instanceof Uint32Array || value instanceof Int32Array ||
      value instanceof Float32Array || value instanceof Float64Array || value instanceof BigInt64Array ||
      value instanceof BigUint64Array) {
    for (let i = 0; i < value.length; i++) {
      (value as any)[i] = 0;
    }
    return;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const view = value as unknown as { length: number; [i: number]: number };
    for (let i = 0; i < view.length; i++) view[i] = 0;
    return;
  }
  if (Array.isArray(value)) {
    value.length = 0;
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'string') {
        obj[key] = '';
      } else if (typeof v === 'number') {
        obj[key] = 0;
      } else if (typeof v === 'boolean') {
        obj[key] = false;
      } else if (Array.isArray(v)) {
        v.length = 0;
      } else if (v && typeof v === 'object') {
        secureWipe(v);
      }
    }
  }
}

export function secureWipeMessage<T = any>(message: T): T {
  if (!message) return message;
  const target = message as any;
  secureWipe(target);
  target.text = undefined;
  target.mediaUrl = undefined;
  target.voiceNote = undefined;
  target.location = undefined;
  target.poll = undefined;
  target.sticker = undefined;
  target.replyTo = undefined;
  target.forwardedFrom = undefined;
  target.wiped = true;
  return message;
}

export const wipeMessage = secureWipeMessage;
export const wipeMessageSecurely = secureWipeMessage;

export function wipeExpiredMessages<T = any>(
  messages: T[],
  now: number = Date.now(),
): T[] {
  const kept: T[] = [];
  for (const msg of messages) {
    const m = msg as any;
    if (m.expiresAt && m.expiresAt <= now) {
      secureWipeMessage(m);
    } else {
      kept.push(msg);
    }
  }
  return kept;
}

export default secureWipe;