/**
 * Safety numbers / key verification helpers.
 *
 * These are local, deterministic fingerprints derived from the two peers'
 * public identities. They are meant to be compared out-of-band (QR scan or
 * read aloud) so users can detect a man-in-the-middle.
 */

import { sha256 } from '@noble/hashes/sha2.js';

export const SAFETY_EMOJIS = [
  '🐶',
  '🐱',
  '🦊',
  '🐯',
  '🦁',
  '🐻',
  '🐼',
  '🐨',
  '🐵',
  '🐸',
] as const;

export const SAFETY_NUMBER_GROUPS = 12;
export const SAFETY_NUMBER_GROUP_SIZE = 5;

export function emojiFingerprint(source: string, count = 8): string {
  const chars = source.length > 0 ? source.split('') : [''];
  const result: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const char = chars[i % chars.length];
    result.push(SAFETY_EMOJIS[(char.charCodeAt(0) + i) % SAFETY_EMOJIS.length]);
  }
  return result.join(' ');
}

export function createSafetyQrPayload(fingerprint: string): string {
  return `nova-safety:${fingerprint}`;
}

export function parseSafetyQrPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('nova-safety:')) return null;
  const fingerprint = trimmed.slice('nova-safety:'.length).trim();
  return fingerprint.length > 0 ? fingerprint : null;
}

/**
 * Deterministic 60-digit safety number for a pair of fingerprints.
 * The order of the two inputs does not matter.
 */
export function computeSafetyNumber(localFingerprint: string, peerFingerprint: string): string {
  const sorted = [localFingerprint, peerFingerprint].sort();
  const input = new TextEncoder().encode(sorted.join('\n'));
  const hash = sha256(input);

  const digits: string[] = [];
  for (let i = 0; i < hash.length && digits.length < SAFETY_NUMBER_GROUPS * SAFETY_NUMBER_GROUP_SIZE; i += 1) {
    digits.push(String(Math.floor(hash[i] / 10) % 10));
    digits.push(String(hash[i] % 10));
  }

  const groups: string[] = [];
  for (let i = 0; i < SAFETY_NUMBER_GROUPS; i += 1) {
    groups.push(digits.slice(i * SAFETY_NUMBER_GROUP_SIZE, (i + 1) * SAFETY_NUMBER_GROUP_SIZE).join(''));
  }

  return groups.join(' ');
}

export function safetyNumbersMatch(a: string, b: string): boolean {
  return normalizeSafetyNumber(a) === normalizeSafetyNumber(b);
}

export function normalizeSafetyNumber(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function verifySafetyNumber(
  localFingerprint: string,
  peerFingerprint: string,
  expected: string,
): boolean {
  return safetyNumbersMatch(computeSafetyNumber(localFingerprint, peerFingerprint), expected);
}
