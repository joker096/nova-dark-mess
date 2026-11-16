/**
 * Hybrid post-quantum layer for the Nova handshake.
 *
 * Design (Signal PQXDH-style, adapted to Nova's X3DH-v2):
 *  - Every prekey bundle and every X3DH header may carry an ML-KEM-768
 *    encapsulation key / ciphertext (`pq` fields).
 *  - The shared secret becomes HKDF(X25519 DH chain ‖ ML-KEM shared secret),
 *    so session security holds if *either* X25519 or ML-KEM-768 survives a
 *    quantum attacker ("harvest now, decrypt later").
 *  - Protocol version negotiation is fail-closed: a responder that advertised
 *    PQ support (`pqKem` in its bundle) rejects any header without a PQ
 *    ciphertext, and both sides bind the negotiated version into the KDF info
 *    and the header signature — a downgrade to the classical-only path is
 *    detected as an invalid signature instead of silently succeeding.
 *  - Identities created before PQ roll-out have no PQ keys: they negotiate
 *    `pq:0` honestly, and both peers derive the identical classical secret.
 *
 * Free & dependency-light: ML-KEM-768 comes from @noble/post-quantum (pure JS,
 * audited noble family), no server is involved.
 */
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { bufferToBase64, base64ToBuffer } from './aes';

/** ML-KEM-768 sizes in bytes (fixed by FIPS 203). */
const PQ_PUBLIC_KEY_BYTES = 1184;
const PQ_CIPHERTEXT_BYTES = 1088;

/** Negotiated handshake version. */
export const PROTOCOL_VERSION_PQ = 3;
export const PROTOCOL_VERSION_CLASSICAL = 2;

export interface PqKemKeyPair {
  publicKey: string; // base64
  secretKeyRaw: string; // base64 of the raw ML-KEM secret key
}

export function generatePqKemKeyPair(): PqKemKeyPair {
  const keys = ml_kem768.keygen();
  return {
    publicKey: bufferToBase64(keys.publicKey),
    secretKeyRaw: bufferToBase64(keys.secretKey),
  };
}

/** Prefix for ML-KEM secret keys so storage can identify them unambiguously. */
export const PQ_SECRET_PREFIX = 'pqkem768.';

export function encodePqSecret(secretKeyRaw: string): string {
  return PQ_SECRET_PREFIX + secretKeyRaw;
}

export function decodePqSecret(stored: string): Uint8Array {
  if (!stored.startsWith(PQ_SECRET_PREFIX)) {
    throw new Error('Not a PQ secret key');
  }
  return base64ToBuffer(stored.slice(PQ_SECRET_PREFIX.length));
}

/**
 * Initiator side: encapsulate against the peer's PQ public key.
 * Returns the ciphertext to ship in the X3DH header and the shared secret.
 * ML-KEM's built-in implicit-rejection hash check is always verified:
 * a malformed or tampered key fails loudly instead of silently weakening
 * the session (fail closed, no downgrade).
 */
export function pqEncapsulate(peerPqPublicKeyB64: string): {
  ciphertextB64: string;
  sharedSecret: Uint8Array;
} {
  const publicKey = base64ToBuffer(peerPqPublicKeyB64);
  if (publicKey.length !== PQ_PUBLIC_KEY_BYTES) {
    throw new Error('Malformed ML-KEM public key');
  }
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  return { ciphertextB64: bufferToBase64(cipherText), sharedSecret };
}

/**
 * Responder side: decapsulate the header's PQ ciphertext.
 * Fail-closed on tampering: a corrupted ciphertext yields the wrong shared
 * secret which the HKDF binds into an unusable session key; explicit length
 * checks reject malformed input before that point.
 */
export function pqDecapsulate(storedSecretKey: string, ciphertextB64: string): Uint8Array {
  const secretKey = decodePqSecret(storedSecretKey);
  const ciphertext = base64ToBuffer(ciphertextB64);
  if (ciphertext.length !== PQ_CIPHERTEXT_BYTES) {
    throw new Error('Malformed ML-KEM ciphertext');
  }
  return ml_kem768.decapsulate(ciphertext, secretKey);
}

export function pqKeySizes() {
  return {
    publicKey: PQ_PUBLIC_KEY_BYTES,
    cipherText: PQ_CIPHERTEXT_BYTES,
    sharedSecret: 32,
  };
}
