/**
 * Optional biometric app unlock.
 *
 * Nova has no accounts, so the biometric check is a local gate in front of the
 * app UI: a platform authenticator (fingerprint / face / device PIN) credential
 * is registered once, and a successful assertion unlocks the session. Nothing
 * leaves the device and no key material is derived from the biometric result.
 */

import { getCachedItem, setCachedItem } from '../storage/localStorageCache';

const CREDENTIAL_ID_KEY = 'nova_biometric_credential_id';

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isBiometricPlatformAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext !== false &&
      typeof PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.credentials)
    );
  } catch {
    return false;
  }
}

export async function isBiometricSupported(): Promise<boolean> {
  if (!isBiometricPlatformAvailable()) return false;
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available === true;
  } catch {
    return false;
  }
}

export function getBiometricCredentialId(): string | null {
  try {
    const cached = getCachedItem<string>(CREDENTIAL_ID_KEY);
    if (cached !== null) return cached;
    const value = localStorage.getItem(CREDENTIAL_ID_KEY);
    setCachedItem(CREDENTIAL_ID_KEY, value);
    return value;
  } catch {
    return null;
  }
}

export function clearBiometricCredential(): void {
  try {
    localStorage.removeItem(CREDENTIAL_ID_KEY);
  } catch {
    void 0;
  }
}

/** Registers a platform credential. Returns the stored credential id, if any. */
export async function registerBiometricCredential(): Promise<string | null> {
  if (!(await isBiometricSupported())) return null;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'Nova Messenger' },
        user: {
          id: new TextEncoder().encode('nova-local-app-lock'),
          name: 'nova-app-lock',
          displayName: 'Nova app unlock',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const id = toBase64Url(credential.rawId);
    localStorage.setItem(CREDENTIAL_ID_KEY, id);
    setCachedItem(CREDENTIAL_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** Asks the platform authenticator to verify the person holding the device. */
export async function verifyBiometricCredential(): Promise<boolean> {
  const id = getBiometricCredentialId();
  if (!id || !isBiometricPlatformAvailable()) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: fromBase64Url(id), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}
