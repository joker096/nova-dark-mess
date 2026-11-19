import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createKeychain, isTauriShell, loadMasterKey, storeMasterKey } from './keychain';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

const SERVICE = 'nova-dark-messenger';

function enterTauriShell(enabled: boolean): void {
  if (enabled) {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  enterTauriShell(false);
});

afterEach(() => {
  enterTauriShell(false);
});

describe('browser keychain', () => {
  it('round-trips a secret through localStorage', async () => {
    const kc = createKeychain();
    await kc.set(SERVICE, 'master_key', 'secret-1');
    expect(await kc.get(SERVICE, 'master_key')).toBe('secret-1');

    await kc.remove(SERVICE, 'master_key');
    expect(await kc.get(SERVICE, 'master_key')).toBeNull();
  });

  it('keeps the historical storage key so existing installs still resolve', async () => {
    localStorage.setItem(`nova_keychain_${SERVICE}_master_key`, 'legacy');
    expect(await loadMasterKey()).toBe('legacy');

    await storeMasterKey('fresh');
    expect(localStorage.getItem(`nova_keychain_${SERVICE}_master_key`)).toBe('fresh');
  });
});

describe('OS keychain (Tauri shell)', () => {
  it('uses native commands instead of localStorage', async () => {
    enterTauriShell(true);
    expect(isTauriShell()).toBe(true);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'keychain_available') return true;
      if (command === 'keychain_get') return null;
      return undefined;
    });

    const kc = createKeychain();
    expect(await kc.get(SERVICE, 'master_key')).toBeNull();
    await kc.set(SERVICE, 'master_key', 'os-secret');
    await kc.remove(SERVICE, 'master_key');

    expect(invokeMock.mock.calls).toEqual([
      ['keychain_available'],
      ['keychain_get', { service: SERVICE, account: 'master_key' }],
      ['keychain_set', { service: SERVICE, account: 'master_key', value: 'os-secret' }],
      ['keychain_remove', { service: SERVICE, account: 'master_key' }],
    ]);
    expect(localStorage.getItem(`nova_keychain_${SERVICE}_master_key`)).toBeNull();
  });

  it('keeps the local backend on a shell without a native store', async () => {
    enterTauriShell(true);
    invokeMock.mockImplementation(async (command: string) =>
      command === 'keychain_available' ? false : undefined,
    );

    const kc = createKeychain();
    await kc.set(SERVICE, 'master_key', 'mobile-secret');
    expect(await kc.get(SERVICE, 'master_key')).toBe('mobile-secret');
    expect(invokeMock).not.toHaveBeenCalledWith('keychain_get', expect.anything());
  });

  it('migrates a value written by the pre-keychain build', async () => {
    enterTauriShell(true);
    localStorage.setItem(`nova_keychain_${SERVICE}_nova_pin_hash`, 'old-hash');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'keychain_available') return true;
      return command === 'keychain_get' ? null : undefined;
    });

    const kc = createKeychain();
    expect(await kc.get(SERVICE, 'nova_pin_hash')).toBe('old-hash');

    expect(invokeMock).toHaveBeenCalledWith('keychain_set', {
      service: SERVICE,
      account: 'nova_pin_hash',
      value: 'old-hash',
    });
    expect(localStorage.getItem(`nova_keychain_${SERVICE}_nova_pin_hash`)).toBeNull();
  });

  it('falls back to localStorage when the OS store fails', async () => {
    enterTauriShell(true);
    const legacyKey = `nova_keychain_${SERVICE}_master_key`;
    localStorage.setItem(legacyKey, 'weak-copy');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'keychain_available') return true;
      throw new Error('credential manager unavailable');
    });

    const kc = createKeychain();
    // Falls back to the legacy localStorage copy instead of propagating the error.
    expect(await kc.get(SERVICE, 'master_key')).toBe('weak-copy');
    // The legacy copy stays in localStorage since the OS store write failed.
    expect(localStorage.getItem(legacyKey)).toBe('weak-copy');
  });
});
