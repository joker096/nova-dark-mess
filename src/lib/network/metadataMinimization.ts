/**
 * Metadata minimization helpers: message padding, randomized send timing and
 * optional cover traffic to resist traffic analysis. All opt-in and
 * battery-aware (callers decide whether to enable).
 */

export interface PaddingOptions {
  blockSize?: number; // default 256
  maxPadding?: number;
}

export function padPayload(payload: string, options: PaddingOptions = {}): string {
  const blockSize = options.blockSize ?? 256;
  const maxPadding = options.maxPadding ?? blockSize;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  const targetLength =
    Math.ceil((bytes.length + 4) / blockSize) * blockSize; // 4 bytes for length prefix
  const paddingLength = Math.max(0, targetLength - bytes.length - 4);
  const cappedPadding = Math.min(paddingLength, maxPadding);

  const buffer = new Uint8Array(4 + bytes.length + cappedPadding);
  // 4-byte big-endian length prefix
  new DataView(buffer.buffer).setUint32(0, bytes.length, false);
  buffer.set(bytes, 4);
  // fill padding with random bytes
  const padding = crypto.getRandomValues(new Uint8Array(cappedPadding));
  buffer.set(padding, 4 + bytes.length);
  return btoa(String.fromCharCode(...buffer));
}

export function unpadPayload(padded: string): string {
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length < 4) throw new Error('Invalid padded payload');
  const length = new DataView(bytes.buffer).getUint32(0, false);
  if (length > bytes.length - 4) throw new Error('Invalid padding length');
  const decoder = new TextDecoder();
  return decoder.decode(bytes.slice(4, 4 + length));
}

export function randomizedDelay(minMs = 50, maxMs = 500): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export interface CoverTrafficOptions {
  intervalMs?: number;
  minBytes?: number;
  maxBytes?: number;
}

export function generateCoverPayload(options: CoverTrafficOptions = {}): string {
  const minBytes = options.minBytes ?? 32;
  const maxBytes = options.maxBytes ?? 256;
  const size = minBytes + Math.floor(Math.random() * (maxBytes - minBytes + 1));
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes));
}
