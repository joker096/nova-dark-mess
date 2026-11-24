/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  wrapMasterKey,
  unwrapMasterKey,
  storeWrappedMasterKey,
  removeWrappedMasterKey,
  hasWrappedMasterKey,
  clearVaultCache,
} from './vaultKey';

beforeEach(() => {
  localStorage.clear();
  clearVaultCache();
});

afterEach(() => {
  localStorage.clear();
  clearVaultCache();
});

describe('vault key wrapping', () => {
  it('wraps and unwraps a master key with a PIN', async () => {
    const masterKey = 'nova_master_key_12345';
    const pin = '123456';

    const wrapped = await wrapMasterKey(pin, masterKey);
    expect(wrapped).toBeDefined();
    expect(typeof wrapped).toBe('string');

    // The wrapped value is JSON with salt, ciphertext, iv.
    const parsed = JSON.parse(wrapped);
    expect(parsed.salt).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.iv).toBeDefined();

    await storeWrappedMasterKey(wrapped);

    const unwrapped = await unwrapMasterKey(pin);
    expect(unwrapped).toBe(masterKey);
  });

  it('rejects a wrong PIN', async () => {
    const masterKey = 'secret_master_key';
    await wrapMasterKey('correct_pin', masterKey);

    const result = await unwrapMasterKey('wrong_pin');
    expect(result).toBeNull();
  });

  it('keeps at most one unwrapped key in memory and drops it on clear', async () => {
    const masterKey = 'cache_isolation_key';
    const wrapped = await wrapMasterKey('real_pin', masterKey);
    await storeWrappedMasterKey(wrapped);
    clearVaultCache();

    expect(await unwrapMasterKey('real_pin')).toBe(masterKey);
    clearVaultCache();
    // After clearing, the cache cannot short-circuit decryption: an incorrect
    // PIN now goes through Argon2id + AES-GCM and fails.
    expect(await unwrapMasterKey('wrong_pin')).toBeNull();
  });

  it('returns null when no wrapped key exists', async () => {
    const result = await unwrapMasterKey('any_pin');
    expect(result).toBeNull();
  });

  it('persists the wrapped key through storeWrappedMasterKey', async () => {
    const wrapped = await wrapMasterKey('pin123', 'mk');
    await storeWrappedMasterKey(wrapped);

    expect(await hasWrappedMasterKey()).toBe(true);
    const unwrapped = await unwrapMasterKey('pin123');
    expect(unwrapped).toBe('mk');
  });

  it('hasWrappedMasterKey returns false before storing', async () => {
    expect(await hasWrappedMasterKey()).toBe(false);
  });

  it('removeWrappedMasterKey deletes the wrapped key', async () => {
    const wrapped = await wrapMasterKey('pin123', 'mk');
    await storeWrappedMasterKey(wrapped);
    expect(await hasWrappedMasterKey()).toBe(true);

    await removeWrappedMasterKey();
    expect(await hasWrappedMasterKey()).toBe(false);
    const result = await unwrapMasterKey('pin123');
    expect(result).toBeNull();
  });

  it('different PINs produce different wrapped blobs', async () => {
    const masterKey = 'same_master_key';
    const wrapped1 = await wrapMasterKey('pin_a', masterKey);
    const wrapped2 = await wrapMasterKey('pin_b', masterKey);
    expect(wrapped1).not.toBe(wrapped2);
  });
});
