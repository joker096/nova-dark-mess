/**
 * Spam resistance without identity.
 *
 * Nova never asks for a phone number or email to stop spam. Instead the
 * receiving side can require a small proof-of-work before accepting a first
 * contact on a queue. The work is bound to the invite (so it cannot be reused)
 * and is cheap for a single honest client but expensive at spam volume.
 */

import { sha256 } from '@noble/hashes/sha2.js';

export const POW_MIN_DIFFICULTY = 1;
export const POW_MAX_DIFFICULTY = 24;

// One-time invite tokens: the invite carries a random secret the relay hashes
// on queue creation. The first enqueue must present the token; the relay then
// burns it, so a leaked invite cannot establish a second first-contact.
export function createInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function isInviteToken(value) {
  if (typeof value !== 'string') return false;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const bytes = fromBase64Url(value);
  return Boolean(bytes && bytes.length === 32);
}

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (typeof value !== 'string') return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function isDifficulty(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= POW_MIN_DIFFICULTY &&
    value <= POW_MAX_DIFFICULTY
  );
}

export function isPowChallenge(value) {
  if (!value || typeof value !== 'object') return false;
  const challenge = value;
  if (typeof challenge.challenge !== 'string' || !isDifficulty(challenge.difficulty)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(challenge.challenge)) return false;
  const bytes = fromBase64Url(challenge.challenge);
  return Boolean(bytes && bytes.length >= 16 && bytes.length <= 64);
}

export function isPowSolution(value) {
  if (!value || typeof value !== 'object') return false;
  const solution = value;
  if (
    typeof solution.nonce !== 'number' ||
    !Number.isInteger(solution.nonce) ||
    solution.nonce < 0 ||
    typeof solution.digest !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(solution.digest)
  ) {
    return false;
  }
  return fromBase64Url(solution.digest)?.length === 32;
}

export function createPowChallenge(difficulty = 16) {
  if (!isDifficulty(difficulty)) throw new Error('Invalid proof-of-work difficulty');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return { challenge: toBase64Url(bytes), difficulty };
}

function leadingZeroBits(bytes) {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

function digestFor(challenge, nonce) {
  const prefix = new TextEncoder().encode(challenge.challenge);
  const buffer = new Uint8Array(prefix.length + 8);
  buffer.set(prefix, 0);
  new DataView(buffer.buffer).setBigUint64(prefix.length, BigInt(nonce), false);
  return sha256(buffer);
}

export async function solvePow(challenge) {
  if (!isPowChallenge(challenge)) throw new Error('Invalid proof-of-work challenge');
  for (let nonce = 0; ; nonce++) {
    const digest = digestFor(challenge, nonce);
    if (leadingZeroBits(digest) >= challenge.difficulty) {
      return { nonce, digest: toBase64Url(digest) };
    }
    // Yield periodically so a browser/WebView stays responsive.
    if ((nonce & 2047) === 2047) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function verifyPow(challenge, solution) {
  if (!isPowChallenge(challenge) || !isPowSolution(solution)) return false;
  const digest = digestFor(challenge, solution.nonce);
  if (leadingZeroBits(digest) < challenge.difficulty) return false;
  return toBase64Url(digest) === solution.digest;
}
