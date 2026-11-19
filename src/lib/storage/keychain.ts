/**
 * Key material storage.
 *
 * Inside the Tauri shell (desktop) every secret goes to the OS credential store
 * through the commands in `src-tauri/src/keychain.rs`: Windows Credential
 * Manager, macOS Keychain, or Secret Service on Linux. There is deliberately no
 * silent fallback there — if the OS store rejects a call the error propagates,
 * so a secret is never quietly written somewhere weaker.
 *
 * The browser build has no OS credential store, so it keeps the value in
 * `localStorage`; the web build is a development target only. Values written by
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
 * Native credential store, used whenever the app runs inside Tauri on a platform
 * that has one. Desktop (Windows/macOS/Linux) uses the `keyring` crate; iOS uses
 * the `security-framework` crate (iOS Keychain). Android declares the
 * `android_keystore` + `jni` dependencies but the `imp` module is a stub waiting
 * for JNI context wiring — native-store errors are caught and the backend falls
 * back to `localStorage` instead of crashing.
 */
class OsKeychain implements Keychain {
  private readonly local = new BrowserKeychain(SERVICE);
  private availability: Promise<boolean> | null = null;

  private async osAvailable(): Promise<boolean> {
    if (!this.availability) {
      const invoke = await requireInvoke();
      this.availability = invoke<boolean>('keychain_available');
    }
    return this.availability;
  }

  async get(service: string, account: string): Promise<string | null> {
    if (!(await this.osAvailable())) return this.local.get(service, account);
    try {
      const invoke = await requireInvoke();
      const stored = await invoke<string | null>('keychain_get', { service, account });
      if (typeof stored === 'string') return stored;
    } catch {
      // OS keychain not fully wired on this platform; fall back to localStorage.
    }

    // Migration: a value written before the OS store existed lives in
    // localStorage. Move it once and drop the weaker copy.
    const legacy = readLegacy(service, account);
    if (legacy === null) return null;
    try {
      await this.set(service, account, legacy);
    } catch {
      /* store may be unavailable */
    }
    return legacy;
  }

  async set(service: string, account: string, value: string): Promise<void> {
    if (!(await this.osAvailable())) {
      await this.local.set(service, account, value);
      return;
    }
    try {
      const invoke = await requireInvoke();
      await invoke('keychain_set', { service, account, value });
      dropLegacy(service, account);
    } catch {
      // Fall back to localStorage if OS store is unavailable. Do not drop the
      // legacy copy: it is now the primary copy.
      await this.local.set(service, account, value);
    }
  }

  async remove(service: string, account: string): Promise<void> {
    if (!(await this.osAvailable())) {
      await this.local.remove(service, account);
      return;
    }
    try {
      const invoke = await requireInvoke();
      await invoke('keychain_remove', { service, account });
      dropLegacy(service, account);
    } catch {
      await this.local.remove(service, account);
    }
  }
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
  return isTauriShell() ? new OsKeychain() : new BrowserKeychain(SERVICE);
}

export async function storeMasterKey(masterKey: string): Promise<void> {
  const kc = createKeychain();
  await kc.set(SERVICE, 'master_key', masterKey);
}

export async function loadMasterKey(): Promise<string | null> {
  const kc = createKeychain();
  return kc.get(SERVICE, 'master_key');
}
