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
import { deriveKeyFromPassphrase } from '../storage/kdf';
import { encryptAESGCM, decryptAESGCM } from '../crypto/aes';

const WRAPPED_MASTER_KEY_KEY = 'nova_wrapped_master_key';
const WRAP_SALT_KEY = 'nova_wrap_salt';

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

async function deriveWrappingKey(pin: string, salt: string): Promise<CryptoKey> {
  const saltBytes = new TextEncoder().encode(salt);
  return deriveKeyFromPassphrase(pin, saltBytes, undefined, false);
}

/**
 * Encrypts the raw master key with a wrapping key derived from `pin`.
 * Returns the encrypted blob (JSON string) safe to store at rest.
 */
export async function wrapMasterKey(pin: string, masterKey: string): Promise<string> {
  const salt = await ensureWrapSalt();
  const wrappingKey = await deriveWrappingKey(pin, salt);
  const encrypted = await encryptAESGCM(masterKey, wrappingKey);
  return JSON.stringify({ salt, ciphertext: encrypted.ciphertext, iv: encrypted.iv });
}

/**
 * Decrypts the wrapped master key with the user's PIN. Returns null if the PIN
 * is wrong or no wrapped key exists.
 */
export async function unwrapMasterKey(pin: string): Promise<string | null> {
  const kc = createKeychain();
  const wrapped = await kc.get(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY);
  if (!wrapped) return null;

  let parsed: { salt: string; ciphertext: string; iv: string };
  try {
    parsed = JSON.parse(wrapped);
  } catch {
    return null;
  }

  const wrappingKey = await deriveWrappingKey(pin, parsed.salt);
  try {
    return decryptAESGCM({ ciphertext: parsed.ciphertext, iv: parsed.iv }, wrappingKey);
  } catch {
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
}

/**
 * Returns true when a wrapped master key exists (i.e. a PIN protects the vault).
 */
export async function hasWrappedMasterKey(): Promise<boolean> {
  const kc = createKeychain();
  const wrapped = await kc.get(KEYCHAIN_SERVICE, WRAPPED_MASTER_KEY_KEY);
  return wrapped !== null && wrapped.length > 0;
}
