import { decryptAESGCM, encryptAESGCM, EncryptedData } from '../crypto/aes';
import { UserIdentity } from '../crypto/identity';
import { deriveKeyFromRandomSecret } from './kdf';
import { createKeychain } from './keychain';

const IDENTITY_KEY = 'nova_security_identity_v2';
const LEGACY_IDENTITY_KEY = 'nova_security_identity';
const DEVICE_SECRET_KEY = 'nova_device_secret';
const DEVICE_SALT_KEY = 'nova_device_salt';
const KEYCHAIN_SERVICE = 'nova-dark-messenger';

let cachedDeviceKey: Promise<CryptoKey> | null = null;

function randomBase64(length: number): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length))));
}

async function getOrCreateDeviceMaterial(): Promise<{ secret: string; salt: Uint8Array }> {
  const kc = createKeychain();
  let secret = await kc.get(KEYCHAIN_SERVICE, DEVICE_SECRET_KEY);
  if (!secret) {
    secret = randomBase64(32);
    await kc.set(KEYCHAIN_SERVICE, DEVICE_SECRET_KEY, secret);
  }

  let saltB64 = await kc.get(KEYCHAIN_SERVICE, DEVICE_SALT_KEY);
  if (!saltB64) {
    saltB64 = randomBase64(16);
    await kc.set(KEYCHAIN_SERVICE, DEVICE_SALT_KEY, saltB64);
  }

  const binary = atob(saltB64);
  const salt = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    salt[i] = binary.charCodeAt(i);
  }

  return { secret, salt };
}

async function getDeviceKey(): Promise<CryptoKey> {
  if (!cachedDeviceKey) {
    const { secret, salt } = await getOrCreateDeviceMaterial();
    cachedDeviceKey = deriveKeyFromRandomSecret(secret, salt);
  }
  return cachedDeviceKey;
}

export function isStoredIdentity(value: unknown): value is UserIdentity {
  if (!value || typeof value !== 'object') return false;
  const identity = value as Partial<UserIdentity>;
  return (
    identity.version === 2 &&
    typeof identity.fingerprint === 'string' &&
    identity.fingerprint.startsWith('nova_pk_') &&
    typeof identity.publicKey === 'string' &&
    typeof identity.signingPublicKey === 'string' &&
    typeof identity.privateKeyRaw === 'string' &&
    typeof identity.mnemonic === 'string'
  );
}

export async function loadStoredIdentity(): Promise<UserIdentity | null> {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const encrypted = JSON.parse(raw) as EncryptedData;
      const plaintext = await decryptAESGCM(encrypted, await getDeviceKey());
      const identity = JSON.parse(plaintext);
      if (isStoredIdentity(identity)) return identity;
    }
  } catch {
    return null;
  }

  try {
    const legacy = localStorage.getItem(LEGACY_IDENTITY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (isStoredIdentity(parsed)) {
        await saveStoredIdentity(parsed);
        localStorage.removeItem(LEGACY_IDENTITY_KEY);
        return parsed;
      }
      localStorage.removeItem(LEGACY_IDENTITY_KEY);
    }
  } catch {
    localStorage.removeItem(LEGACY_IDENTITY_KEY);
  }

  return null;
}

export async function saveStoredIdentity(identity: UserIdentity): Promise<void> {
  const encrypted = await encryptAESGCM(JSON.stringify(identity), await getDeviceKey());
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(encrypted));
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
}

export function clearStoredIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
}
