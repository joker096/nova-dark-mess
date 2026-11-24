/**
 * Key material storage.
 *
 * Inside the Tauri shell every secret goes to the OS credential store through
 * the commands in `src-tauri/src/keychain.rs`: Windows Credential Manager,
 * macOS Keychain, iOS Keychain, Secret Service on Linux, or AndroidKeyStore via
 * JNI. There is deliberately no fallback there — if the native store is
 * unavailable or rejects a call, `createKeychain()` throws instead of quietly
 * writing the secret somewhere weaker (F2.1: fail closed).
 *
 * The plain web build has no OS credential store, so it keeps the value in
 * `localStorage`; that build is a development target only. Values written by
 * older builds live under `nova_keychain_*` and are migrated into the OS store
 * the first time they are read.
 */

export interface Keychain {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  remove(service: string, account: string): Promise<void>;
}

const SERVICE = 'nova-dark-messenger';
const LEGACY_PREFIX = 'nova_keychain_';

/**
 * Thrown when the native credential store cannot be used.
 *
 * Callers must treat this as "no secure storage": keep nothing secret on disk
 * rather than degrade to `localStorage`. Historically this path silently wrote
 * the vault passphrase and the seed-phrase key next to the ciphertext.
 */
export class KeychainUnavailableError extends Error {
  constructor(reason: string) {
    super(`Secure key storage is unavailable: ${reason}`);
    this.name = 'KeychainUnavailableError';
  }
}

export { SERVICE as KEYCHAIN_SERVICE };

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

let invokePromise: Promise<Invoke> | null = null;

/** True when the page runs inside the Tauri webview rather than a browser. */
export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function requireInvoke(): Promise<Invoke> {
  if (!invokePromise) {
    invokePromise = import('@tauri-apps/api/core').then((module) => {
      const invoke = (module as { invoke?: Invoke }).invoke;
      if (typeof invoke !== 'function') throw new Error('Tauri invoke API is unavailable');
      return invoke;
    });
  }
  return invokePromise;
}

function legacyKey(service: string, account: string): string {
  return `${LEGACY_PREFIX}${service}_${account}`;
}

function readLegacy(service: string, account: string): string | null {
  try {
    return localStorage.getItem(legacyKey(service, account));
  } catch {
    return null;
  }
}

function dropLegacy(service: string, account: string): void {
  try {
    localStorage.removeItem(legacyKey(service, account));
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Native credential store, used whenever the app runs inside Tauri.
 *
 * Every failure is surfaced as `KeychainUnavailableError`: writing the vault
 * passphrase or the seed phrase to `localStorage` next to the ciphertext is
 * exactly the defect this class exists to remove (F2.1).
 */
class OsKeychain implements Keychain {
  private availability: Promise<boolean> | null = null;

  private async osAvailable(): Promise<boolean> {
    if (!this.availability) {
      this.availability = requireInvoke()
        .then((invoke) => invoke<boolean>('keychain_available'))
        .catch((error: unknown) => {
          this.availability = null;
          throw new KeychainUnavailableError(describeError(error));
        });
    }
    return this.availability;
  }

  private async requireStore(): Promise<Invoke> {
    const invoke = await requireInvoke().catch((error: unknown) => {
      throw new KeychainUnavailableError(describeError(error));
    });
    if (!(await this.osAvailable())) {
      throw new KeychainUnavailableError('no native credential store on this platform');
    }
    return invoke;
  }

  async get(service: string, account: string): Promise<string | null> {
    const invoke = await this.requireStore();
    try {
      const stored = await invoke<string | null>('keychain_get', { service, account });
      if (typeof stored === 'string') return stored;
    } catch (error) {
      throw new KeychainUnavailableError(describeError(error));
    }

    // Migration: a value written before the OS store existed lives in
    // localStorage. Move it once and drop the weaker copy. If the move fails we
    // keep reading the legacy copy so an existing install is not locked out,
    // but nothing new is ever written there.
    const legacy = readLegacy(service, account);
    if (legacy === null) return null;
    try {
      await this.set(service, account, legacy);
    } catch {
      return legacy;
    }
    return legacy;
  }

  async set(service: string, account: string, value: string): Promise<void> {
    const invoke = await this.requireStore();
    try {
      await invoke('keychain_set', { service, account, value });
    } catch (error) {
      throw new KeychainUnavailableError(describeError(error));
    }
    dropLegacy(service, account);
  }

  async remove(service: string, account: string): Promise<void> {
    const invoke = await this.requireStore();
    try {
      await invoke('keychain_remove', { service, account });
    } catch (error) {
      throw new KeychainUnavailableError(describeError(error));
    }
    dropLegacy(service, account);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Browser-only storage; the web build is a development target. */
class BrowserKeychain implements Keychain {
  private readonly service: string;

  constructor(service: string) {
    this.service = service;
  }

  private key(account: string): string {
    return legacyKey(this.service, account);
  }

  async get(_service: string, account: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.key(account));
    } catch {
      return null;
    }
  }

  async set(_service: string, account: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.key(account), value);
    } catch {
      /* ignore */
    }
  }

  async remove(_service: string, account: string): Promise<void> {
    try {
      localStorage.removeItem(this.key(account));
    } catch {
      /* ignore */
    }
  }
}

export function createKeychain(): Keychain {
  if (isTauriShell()) return new OsKeychain();
  if (import.meta.env.DEV) return new BrowserKeychain(SERVICE);
  throw new KeychainUnavailableError('Secure storage unavailable: no native keychain in production web build');
}

/**
 * True when secrets can be stored securely on this build. Used by the UI to
 * explain why encrypted storage is disabled instead of silently degrading.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  if (!isTauriShell()) return true; // browser dev build: localStorage backend
  try {
    const invoke = await requireInvoke();
    return (await invoke<boolean>('keychain_available')) === true;
  } catch {
    return false;
  }
}

export async function storeMasterKey(masterKey: string): Promise<void> {
  const kc = createKeychain();
  await kc.set(SERVICE, 'master_key', masterKey);
}

export async function loadMasterKey(): Promise<string | null> {
  const kc = createKeychain();
  return kc.get(SERVICE, 'master_key');
}
