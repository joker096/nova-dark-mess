/**
 * Sealed sender: encrypts a message to a recipient's X25519 public key using an
 * ephemeral keypair, so intermediaries (relays) learn neither sender nor
 * recipient identity beyond routing. The recipient recovers the plaintext with
 * their X25519 private key.
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  base64ToBuffer,
  bufferToBase64,
  EncryptedData,
  encryptAESGCM,
  decryptAESGCM,
} from '../crypto/aes';

const encoder = new TextEncoder();
const SEALED_INFO = encoder.encode('nova-sealed-sender-v1');

export interface SealedEnvelope {
  ephemeralPublicKey: string; // base64
  encrypted: EncryptedData;
}

export async function sealMessageAsync(
  recipientPublicKey: string,
  plaintext: string,
): Promise<SealedEnvelope> {
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const shared = x25519.getSharedSecret(ephemeralSecret, base64ToBuffer(recipientPublicKey));
  const keyBytes = hkdf(sha256, shared, new Uint8Array(32), SEALED_INFO, 32);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const encrypted = await encryptAESGCM(plaintext, cryptoKey);
  return { ephemeralPublicKey: bufferToBase64(ephemeralPublic), encrypted };
}

export async function unsealMessageAsync(
  recipientPrivateKey: string,
  envelope: SealedEnvelope,
): Promise<string> {
  const shared = x25519.getSharedSecret(
    base64ToBuffer(recipientPrivateKey),
    base64ToBuffer(envelope.ephemeralPublicKey),
  );
  const keyBytes = hkdf(sha256, shared, new Uint8Array(32), SEALED_INFO, 32);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  return decryptAESGCM(envelope.encrypted, cryptoKey);
}
