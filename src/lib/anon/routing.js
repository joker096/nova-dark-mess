import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const ROUTING_VERSION = 1;
export const ROUTING_INFO = new TextEncoder().encode('nova-anon-routing-v1');

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (typeof value !== 'string') throw new Error('Expected base64url string');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function requireKey(bytes, length, label) {
  if (bytes.length !== length) throw new Error(`Invalid ${label} length`);
  return bytes;
}

async function deriveAesKey(sharedSecret, salt) {
  const raw = hkdf(sha256, sharedSecret, salt, ROUTING_INFO, 32);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function routingPublicKey(privateKey) {
  const secret = requireKey(fromBase64Url(privateKey), 32, 'routing private key');
  return toBase64Url(x25519.getPublicKey(secret));
}

export function generateRoutingKeyPair() {
  const privateKey = x25519.utils.randomSecretKey();
  return {
    privateKey: toBase64Url(privateKey),
    publicKey: toBase64Url(x25519.getPublicKey(privateKey)),
  };
}

export async function sealRoutingEnvelope(relayPublicKey, route) {
  const relayKey = requireKey(fromBase64Url(relayPublicKey), 32, 'routing public key');
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const shared = x25519.getSharedSecret(ephemeralSecret, relayKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(shared, salt);
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      ...route,
      v: ROUTING_VERSION,
      iat: Date.now(),
      nonce: toBase64Url(randomBytes(16)),
    }),
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: ROUTING_INFO },
      key,
      plaintext,
    ),
  );

  return {
    v: ROUTING_VERSION,
    epk: toBase64Url(ephemeralPublic),
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ct: toBase64Url(ciphertext),
  };
}

export async function openRoutingEnvelope(relayPrivateKey, envelope) {
  if (!envelope || typeof envelope !== 'object' || envelope.v !== ROUTING_VERSION) {
    throw new Error('Invalid routing envelope');
  }
  const secret = requireKey(fromBase64Url(relayPrivateKey), 32, 'routing private key');
  const ephemeralPublic = requireKey(fromBase64Url(envelope.epk), 32, 'ephemeral key');
  const salt = requireKey(fromBase64Url(envelope.salt), 16, 'salt');
  const iv = requireKey(fromBase64Url(envelope.iv), 12, 'iv');
  const ciphertext = fromBase64Url(envelope.ct);
  const shared = x25519.getSharedSecret(secret, ephemeralPublic);
  const key = await deriveAesKey(shared, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: ROUTING_INFO },
    key,
    ciphertext,
  );
  const route = JSON.parse(new TextDecoder().decode(plaintext));
  if (!route || route.v !== ROUTING_VERSION) throw new Error('Invalid routing payload');
  return route;
}
