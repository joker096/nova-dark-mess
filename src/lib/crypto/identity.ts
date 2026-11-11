import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base64ToBuffer, bufferToBase64, bufferToHex } from './aes';

export interface UserIdentity {
  version: 2;
  fingerprint: string;
  publicKey: string;
  signingPublicKey: string;
  privateKeyRaw: string;
  mnemonic: string;
  createdAt: string;
}

export interface IdentityPrivateKeys {
  x25519Secret: Uint8Array;
  ed25519Secret: Uint8Array;
}

export interface SignedPreKey {
  keyId: number;
  publicKey: string;
  secretKey: string;
  signature: string;
}

export interface OneTimePreKey {
  keyId: number;
  publicKey: string;
  secretKey: string;
}

export interface PreKeyBundle {
  identityKey: string;
  signingKey: string;
  fingerprint: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey?: {
    keyId: number;
    publicKey: string;
  };
}

const encoder = new TextEncoder();
const IDENTITY_INFO_X = 'nova-identity-v2/x25519';
const IDENTITY_INFO_E = 'nova-identity-v2/ed25519';
const SPK_SIGNATURE_PREFIX = 'nova-spk:';

export function createMnemonic(wordCount: 12 | 24 = 24): string {
  return generateMnemonic(wordlist, wordCount === 12 ? 128 : 256);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function fingerprintFromSigningKey(signingPublicKey: Uint8Array | string): string {
  const bytes =
    typeof signingPublicKey === 'string' ? base64ToBuffer(signingPublicKey) : signingPublicKey;
  return `nova_pk_${bufferToHex(sha256(bytes)).substring(0, 16)}`;
}

export function encodePrivateKeyBundle(keys: IdentityPrivateKeys): string {
  const combined = new Uint8Array(64);
  combined.set(keys.x25519Secret, 0);
  combined.set(keys.ed25519Secret, 32);
  return bufferToBase64(combined);
}

export function decodePrivateKeyBundle(privateKeyRaw: string): IdentityPrivateKeys {
  const combined = base64ToBuffer(privateKeyRaw);
  if (combined.length !== 64) {
    throw new Error('Invalid identity private key bundle');
  }
  return {
    x25519Secret: combined.slice(0, 32),
    ed25519Secret: combined.slice(32, 64),
  };
}

export function identityPrivateKeys(identity: UserIdentity): IdentityPrivateKeys {
  return decodePrivateKeyBundle(identity.privateKeyRaw);
}

export function deriveIdentityFromMnemonic(mnemonic: string, createdAt?: string): UserIdentity {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic');
  }

  const seed = mnemonicToSeedSync(normalized);
  const xSecret = hkdf(sha256, seed, new Uint8Array(32), encoder.encode(IDENTITY_INFO_X), 32);
  const eSecret = hkdf(sha256, seed, new Uint8Array(32), encoder.encode(IDENTITY_INFO_E), 32);
  const xPublic = x25519.getPublicKey(xSecret);
  const ePublic = ed25519.getPublicKey(eSecret);

  return {
    version: 2,
    fingerprint: fingerprintFromSigningKey(ePublic),
    publicKey: bufferToBase64(xPublic),
    signingPublicKey: bufferToBase64(ePublic),
    privateKeyRaw: encodePrivateKeyBundle({ x25519Secret: xSecret, ed25519Secret: eSecret }),
    mnemonic: normalized,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export async function createAnonymousIdentity(): Promise<UserIdentity> {
  return deriveIdentityFromMnemonic(createMnemonic(24));
}

export function identityEncryptionPublicKey(identity: UserIdentity): Uint8Array {
  return base64ToBuffer(identity.publicKey);
}

export function identitySigningPublicKey(identity: UserIdentity): Uint8Array {
  return base64ToBuffer(identity.signingPublicKey);
}

export function signWithIdentity(identity: UserIdentity, message: string | Uint8Array): string {
  const payload = typeof message === 'string' ? encoder.encode(message) : message;
  const { ed25519Secret } = decodePrivateKeyBundle(identity.privateKeyRaw);
  return bufferToBase64(ed25519.sign(payload, ed25519Secret));
}

export function verifyIdentitySignature(
  signingPublicKey: string,
  message: string | Uint8Array,
  signature: string
): boolean {
  try {
    const payload = typeof message === 'string' ? encoder.encode(message) : message;
    return ed25519.verify(
      base64ToBuffer(signature),
      payload,
      base64ToBuffer(signingPublicKey)
    );
  } catch {
    return false;
  }
}

export function createSignedPreKey(identity: UserIdentity, keyId = 1): SignedPreKey {
  const secretKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secretKey);
  const publicKeyB64 = bufferToBase64(publicKey);
  return {
    keyId,
    publicKey: publicKeyB64,
    secretKey: bufferToBase64(secretKey),
    signature: signWithIdentity(identity, `${SPK_SIGNATURE_PREFIX}${keyId}:${publicKeyB64}`),
  };
}

export function createOneTimePreKey(keyId: number): OneTimePreKey {
  const secretKey = x25519.utils.randomSecretKey();
  return {
    keyId,
    publicKey: bufferToBase64(x25519.getPublicKey(secretKey)),
    secretKey: bufferToBase64(secretKey),
  };
}

export function createPreKeyBundle(
  identity: UserIdentity,
  signedPreKey: SignedPreKey,
  oneTimePreKey?: OneTimePreKey
): PreKeyBundle {
  return {
    identityKey: identity.publicKey,
    signingKey: identity.signingPublicKey,
    fingerprint: identity.fingerprint,
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature,
    },
    oneTimePreKey: oneTimePreKey
      ? { keyId: oneTimePreKey.keyId, publicKey: oneTimePreKey.publicKey }
      : undefined,
  };
}

export function verifyPreKeyBundle(bundle: PreKeyBundle): boolean {
  try {
    if (fingerprintFromSigningKey(bundle.signingKey) !== bundle.fingerprint) {
      return false;
    }
    return verifyIdentitySignature(
      bundle.signingKey,
      `${SPK_SIGNATURE_PREFIX}${bundle.signedPreKey.keyId}:${bundle.signedPreKey.publicKey}`,
      bundle.signedPreKey.signature
    );
  } catch {
    return false;
  }
}

export function signedPreKeyPair(signedPreKey: SignedPreKey): {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
} {
  return {
    secretKey: base64ToBuffer(signedPreKey.secretKey),
    publicKey: base64ToBuffer(signedPreKey.publicKey),
  };
}

export function oneTimePreKeyPair(oneTimePreKey: OneTimePreKey): {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
} {
  return {
    secretKey: base64ToBuffer(oneTimePreKey.secretKey),
    publicKey: base64ToBuffer(oneTimePreKey.publicKey),
  };
}
