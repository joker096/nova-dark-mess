/**
 * Human-readable handles derived from the public key.
 * No central registry: the handle is a deterministic short id derived from the
 * signing public key, optionally paired with a self-asserted display name.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bufferToHex } from './aes';

export interface NovaHandle {
  handle: string; // nova://<short-id>
  shortId: string;
  displayName?: string;
}

const HANDLE_PREFIX = 'nova://';

export function deriveShortId(signingPublicKey: string): string {
  // signingPublicKey is base64; hash it and take first 12 hex chars.
  const bytes = Uint8Array.from(atob(signingPublicKey), (c) => c.charCodeAt(0));
  const hash = sha256(bytes);
  return bufferToHex(hash).slice(0, 12);
}

export function createHandle(signingPublicKey: string, displayName?: string): NovaHandle {
  const shortId = deriveShortId(signingPublicKey);
  return {
    handle: `${HANDLE_PREFIX}${shortId}`,
    shortId,
    displayName,
  };
}

export function parseHandle(input: string): { shortId: string; displayName?: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(HANDLE_PREFIX)) return null;
  const rest = trimmed.slice(HANDLE_PREFIX.length);
  const [shortId, ...nameParts] = rest.split(/\s+/);
  if (!/^[0-9a-f]{12}$/.test(shortId)) return null;
  const displayName = nameParts.length ? nameParts.join(' ') : undefined;
  return { shortId, displayName };
}

export function isValidHandle(input: string): boolean {
  return parseHandle(input) !== null;
}
