/**
 * OS keychain integration for the master key.
 * Uses Tauri's strongbox when available, falls back to localStorage in browser.
 */

export interface Keychain {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  remove(service: string, account: string): Promise<void>;
}

const SERVICE = 'nova-dark-messenger';

class LocalStorageKeychain implements Keychain {
  private key(service: string, account: string): string {
    return `nova_keychain_${service}_${account}`;
  }
  async get(service: string, account: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.key(service, account));
    } catch {
      return null;
    }
  }
  async set(service: string, account: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.key(service, account), value);
    } catch {
      /* ignore */
    }
  }
  async remove(service: string, account: string): Promise<void> {
    try {
      localStorage.removeItem(this.key(service, account));
    } catch {
      /* ignore */
    }
  }
}

export function createKeychain(): Keychain {
  // Tauri v2 strongbox is not yet wired; fallback to localStorage.
  // When Tauri plugin is available, detect via window.__TAURI__ and use it.
  return new LocalStorageKeychain();
}

export async function storeMasterKey(masterKey: string): Promise<void> {
  const kc = createKeychain();
  await kc.set(SERVICE, 'master_key', masterKey);
}

export async function loadMasterKey(): Promise<string | null> {
  const kc = createKeychain();
  return kc.get(SERVICE, 'master_key');
}
