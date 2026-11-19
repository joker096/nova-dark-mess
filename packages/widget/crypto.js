/**
 * Mess&Anger widget crypto — pure functions, testable in isolation.
 * E2EE: guest X25519 ephemeral per message, ECDH with site_pubkey,
 * HKDF-SHA256, AES-256-GCM.
 * Proof-of-work: hashcash-style SHA-256 leading-zero-bits challenge.
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';

/* ───── base64url ───── */
export function b64u(bytes) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromB64u(s) {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}

export function ab2str(buf) {
  return new TextDecoder().decode(buf);
}

export function str2ab(str) {
  return new TextEncoder().encode(str);
}

/* ───── X25519 keys ───── */
export function generateGuestKeys() {
  const priv = x25519.utils.randomSecretKey();
  const pub = x25519.getPublicKey(priv);
  return { priv, pub };
}

/* ───── proof-of-work ───── */
export function powDigest(challenge, nonce) {
  const buf = new Uint8Array(challenge.length + 8);
  buf.set(challenge, 0);
  const view = new DataView(buf.buffer);
  view.setBigUint64(challenge.length, BigInt(nonce), false);
  return new Uint8Array(sha256(buf));
}

export function leadingZeroBits(hash) {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export async function solvePow(challenge, difficulty) {
  for (let nonce = 0; ; nonce++) {
    const hash = await powDigest(challenge, nonce);
    if (leadingZeroBits(hash) >= difficulty) {
      return { nonce, digest: b64u(hash) };
    }
    if ((nonce & 1023) === 1023) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/* ───── E2EE encrypt/decrypt ───── */
export async function encryptMessage(plaintext, peerPubKeyB64, threadId) {
  const ephemeral = x25519.utils.randomSecretKey();
  const shared = x25519.getSharedSecret(ephemeral, fromB64u(peerPubKeyB64));
  /* HKDF-SHA256 -> 32-byte AES key (matches site-gateway server derivation) */
  const keyBytes = hkdf(sha256, shared, str2ab('site-gateway-v1'), str2ab(threadId), 32);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, str2ab(plaintext));
  return {
    ciphertext: b64u(new Uint8Array(ct)),
    nonce: b64u(iv),
    ephemeral_pubkey: b64u(x25519.getPublicKey(ephemeral)),
  };
}

export async function decryptMessage(ciphertextB64, nonceB64, ephemeralPubKeyB64, guestPrivKey, threadId) {
  const shared = x25519.getSharedSecret(guestPrivKey, fromB64u(ephemeralPubKeyB64));
  const keyBytes = hkdf(sha256, shared, str2ab('site-gateway-v1'), str2ab(threadId), 32);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const iv = fromB64u(nonceB64);
  const ct = fromB64u(ciphertextB64);
  return ab2str(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}
