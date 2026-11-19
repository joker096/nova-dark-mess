/**
 * Crypto helpers for site-gateway.
 *
 * Reuses the same primitives as the messenger client (@noble/curves x25519,
 * @noble/hashes hmac/sha256) so widget E2EE is interoperable with the app.
 * Server-side AES-256-GCM via Node's built-in crypto.
 *
 * Message encryption flow (guest → owner):
 *   1. Guest generates ephemeral X25519 pair.
 *   2. sharedSecret = X25519(guest_ephemeral_priv, site_pubkey)
 *   3. key = HKDF-SHA256(sharedSecret, salt="site-gateway-v1", info=threadId, 32)
 *   4. ciphertext = AES-256-GCM(key, nonce=12 random bytes, plaintext)
 *   5. Server stores { ciphertext, nonce, ephemeral_pubkey } — never plaintext.
 *
 * Owner decrypts: sharedSecret = X25519(site_privkey, ephemeral_pubkey), same HKDF.
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

const ENCODING = 'base64url';

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString(ENCODING);
}

function fromBase64Url(value) {
  if (typeof value !== 'string') return null;
  try {
    return Buffer.from(value, ENCODING);
  } catch {
    return null;
  }
}

function requireLength(bytes, length, label) {
  if (bytes.length !== length) throw new Error(`Invalid ${label} length`);
  return bytes;
}

/** Generate an X25519 key pair. Returns base64url-encoded private + public key. */
export function generateX25519KeyPair() {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey: toBase64Url(privateKey),
    publicKey: toBase64Url(publicKey),
  };
}

/** X25519 Diffie-Hellman shared secret. Both inputs base64url. Returns 32 bytes. */
export function sharedSecret(privateKeyB64, publicKeyB64) {
  const secret = requireLength(fromBase64Url(privateKeyB64), 32, 'private key');
  const pub = requireLength(fromBase64Url(publicKeyB64), 32, 'public key');
  return x25519.getSharedSecret(secret, pub);
}

/**
 * HKDF-SHA256 extract + expand.
 *   ikm: input key material (shared secret)
 *   salt: optional salt (defaults to zeros)
 *   info: context/application binding
 *   length: output key length in bytes
 */
export function hkdfSha256(ikm, salt, info, length) {
  const ikmBuf = Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm);
  const saltBuf = salt ? Buffer.from(salt) : Buffer.alloc(32, 0);
  const infoBuf = Buffer.from(info);

  // Extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = hmac(sha256, saltBuf, ikmBuf);

  // Expand: OKM = T(1) || T(2) || ... where T(n) = HMAC-SHA256(PRK, T(n-1) || info || n)
  const out = [];
  let tPrev = Buffer.alloc(0);
  let counter = 1;
  while (out.reduce((a, b) => a + b.length, 0) < length) {
    const input = Buffer.concat([tPrev, infoBuf, Buffer.from([counter])]);
    tPrev = hmac(sha256, prk, input);
    out.push(tPrev);
    counter += 1;
  }
  return Buffer.concat(out).subarray(0, length);
}

/**
 * Derive a 32-byte AES-256-GCM key from an X25519 shared secret.
 * salt and info are strings bound to the thread/session context.
 */
export function deriveAesKey(sharedSecret, salt, info) {
  return hkdfSha256(sharedSecret, Buffer.from(salt), Buffer.from(info), 32);
}

/**
 * AES-256-GCM encrypt. key: 32 bytes. Returns { ciphertext, nonce } as base64url.
 * Nonce is 12 random bytes (GCM standard).
 */
export function encryptAes256Gcm(key, plaintext) {
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: toBase64Url(Buffer.concat([encrypted, tag])),
    nonce: toBase64Url(nonce),
  };
}

/**
 * AES-256-GCM decrypt. ciphertext and nonce base64url. Returns plaintext Buffer.
 * ciphertext includes the 16-byte GCM tag appended.
 */
export function decryptAes256Gcm(key, ciphertextB64, nonceB64) {
  const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
  const nonce = requireLength(fromBase64Url(nonceB64), 12, 'nonce');
  const full = requireLength(fromBase64Url(ciphertextB64), 0, 'ciphertext');
  if (full.length < 16) throw new Error('Ciphertext too short (missing tag)');
  const encrypted = full.subarray(0, full.length - 16);
  const tag = full.subarray(full.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', keyBuf, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/** Constant-time comparison of two base64url strings. */
export function safeEqual(a, b) {
  const ba = fromBase64Url(a);
  const bb = fromBase64Url(b);
  if (!ba || !bb || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Generate cryptographically random bytes, base64url encoded. */
export function randomToken(bytes = 32) {
  return toBase64Url(randomBytes(bytes));
}
