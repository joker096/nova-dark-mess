/**
 * Vault key wrapping.
 *
 * The IndexedDB master key (`STORAGE_SECRET_KEY`) is encrypted with a wrapping
 * key derived from the user's PIN (Argon2id). Without a correct PIN the master
 * key cannot be recovered, so an attacker who obtains the encrypted IndexedDB
 * records or the keychain value still cannot read message history.
 *
 * The wrapped master key is stored under `WRAPPED_MASTER_KEY_KEY` in the same
 * keychain service as the raw master key. When no PIN is set the raw master key
 * remains usable (backwards compatibility); once a PIN exists the wrapped copy
 * is the authoritative source.
 */

import { createKeychain, KEYCHAIN_SERVICE } from '../storage/keychain';
import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_PARAMS,
  deriveKeyFromPassphrase,
  type KdfParams,
} from '../storage/kdf';
import { encryptAESGCM, decryptAESGCM } from '../crypto/aes';

const WRAPPED_MASTER_KEY_KEY = 'nova_wrapped_master_key';
const WRAP_SALT_KEY = 'nova_wrap_salt';

/**
 * In-memory (RAM-only) cache for the unwrapped master key. Never persisted.
 *
 * Deliberately NOT keyed by the PIN: the PIN is the low-entropy secret this
 * wrapping is meant to protect, and a map keyed by it leaves every correct PIN
 * (plus the plaintext master key) sitting in a heap snapshot forever. One
 * cache entry is enough — the vault is per-device and unlocked by one PIN —
 * and a fresh unwrap replaces the previous entry.
 */
let unwrappedCache: string | null = null;

/** Clear all in-memory vault caches. Call on PIN removal or logout. */
export function clearVaultCache(): void {
  unwrappedCache = null;
}

function randomBase64(length: number): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length))));
}

async function ensureWrapSalt(): Promise<string> {
  const kc = createKeychain();
  let salt = await kc.get(KEYCHAIN_SERVICE, WRAP_SALT_KEY);
  if (!salt) {
    salt = randomBase64(16);
    await kc.set(KEYCHAIN_SERVICE, WRAP_SALT_KEY, salt);
  }
  return salt;
}

interface WrappedKeyFile {
  /** v2 blobs use Argon2id; blobs without a marker were PBKDF2. */
  v?: number;
  kdf?: string;
  salt: string;
  ciphertext: string;
  iv: string;
}

async function deriveWrappingKey(
  pin: string,
  salt: string,
  params: KdfParams,
): Promise<CryptoKey> {
  const saltBytes = new TextEncoder().encode(salt);
  return deriveKeyFromPassphrase(pin, saltBytes, params, false);
}

/**
 * Encrypts the raw master key with a wrapping key derived from `pin`.
 * Returns the encrypted blob (JSON string) safe to store at rest.
 */
export async function wrapMasterKey(pin: string, masterKey: string): Promise<string> {
  const salt = await ensureWrapSalt();
  // A 4-digit PIN has only 10k candidates. Wrap with a memory-hard KDF so an
  // attacker holding the keychain blob cannot cheaply brute-force it offline.
  const wrappingKey = await deriveWrappingKey(pin, salt, DEFAULT_ARGON2ID_PARAMS);
  const encrypted = await encryptAESGCM(masterKey, wrappingKey);
  return JSON.stringify({
    v: 2,
    kdf: DEFAULT_ARGON2ID_PARAMS.name,
    salt,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
  } satisfies WrappedKeyFile);
}

/**
 * Decrypts the wrapped master key with the user's PIN. Returns null if the PIN
 * is wrong or no wrapped key exists.
 */
export async function unwrapMasterKey(pin: string): Promise<string | null> {
  // RAM-only cache: unwrapped master key never touches disk. It is reused only
  // for the most recent successful unwrap (see `unwrappedCache` above) and is
  // dropped by every failure path below.
  const cached = unwrappedCache as string | null;
  if (cached !== null) return cached;

  const kc = createKeychain();
  const wrapped = await kc.get(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY);
  if (!wrapped) return null;

  let parsed: WrappedKeyFile;
  try {
    parsed = JSON.parse(wrapped) as WrappedKeyFile;
  } catch {
    return null;
  }

  // Old blobs have no kdf marker and were wrapped with PBKDF2-600k. Keep
  // reading them so an update does not lock existing users out; every new
  // wrap uses Argon2id above.
  const params = parsed.kdf === 'Argon2id' ? DEFAULT_ARGON2ID_PARAMS : DEFAULT_KDF_PARAMS;
  const wrappingKey = await deriveWrappingKey(pin, parsed.salt, params);
  try {
    const decrypted = await decryptAESGCM({ ciphertext: parsed.ciphertext, iv: parsed.iv }, wrappingKey);
    unwrappedCache = decrypted;
    return decrypted;
  } catch {
    unwrappedCache = null;
    return null;
  }
}

/**
 * Stores the wrapped master key in the keychain. Call after a successful PIN set.
 */
export async function storeWrappedMasterKey(wrapped: string): Promise<void> {
  const kc = createKeychain();
  await kc.set(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY, wrapped);
}

/**
 * Removes the wrapped master key. Call on PIN removal.
 */
export async function removeWrappedMasterKey(): Promise<void> {
  const kc = createKeychain();
  await kc.remove(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY);
  unwrappedCache = null;
}

/**
 * Returns true when a wrapped master key exists (i.e. a PIN protects the vault).
 */
export async function hasWrappedMasterKey(): Promise<boolean> {
  const kc = createKeychain();
  const wrapped = await kc.get(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY);
  return wrapped !== null && wrapped.length > 0;
}
