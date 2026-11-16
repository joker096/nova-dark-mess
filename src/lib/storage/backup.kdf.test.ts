/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  createEncryptedBackupBlob,
  restoreEncryptedBackup,
  type BackupPayload,
} from './backup';
import { DEFAULT_ARGON2ID_PARAMS } from './kdf';

const payload: BackupPayload = {
  version: 1,
  identity: {
    // minimal shape — restore only round-trips it
    fingerprint: 'nova_pk_test',
  } as unknown as BackupPayload['identity'],
  chatsMetadata: [],
  exportedAt: new Date().toISOString(),
};

async function blobText(blob: Blob): Promise<string> {
  return blob.text();
}

describe('.nova-backup KDF', () => {
  it('writes new backups with Argon2id params (v2 file)', async () => {
    const blob = await createEncryptedBackupBlob(payload, 'correct horse battery');
    const file = JSON.parse(await blobText(blob));
    expect(file.version).toBe(2);
    expect(file.kdf).toEqual(DEFAULT_ARGON2ID_PARAMS);
    expect(file.kdf.memoryKiB).toBeGreaterThanOrEqual(8192);
  });

  it('round-trips a v2 Argon2id backup', async () => {
    const blob = await createEncryptedBackupBlob(payload, 'correct horse battery');
    const restored = await restoreEncryptedBackup(await blobText(blob), 'correct horse battery');
    expect(restored.identity.fingerprint).toBe('nova_pk_test');
  });

  it('rejects a wrong passphrase on an Argon2id backup', async () => {
    const blob = await createEncryptedBackupBlob(payload, 'correct horse battery');
    await expect(
      restoreEncryptedBackup(await blobText(blob), 'wrong passphrase'),
    ).rejects.toThrow('Invalid passphrase or corrupted backup file');
  });

  it('still restores legacy PBKDF2 v1 files', async () => {
    // Hand-crafted v1 fixture with the historical default PBKDF2 params.
    const { encryptAESGCM } = await import('../crypto/aes');
    const { deriveKeyFromPassphrase, generateSalt, DEFAULT_KDF_PARAMS } = await import('./kdf');
    const { bufferToBase64 } = await import('../crypto/aes');
    const salt = generateSalt(16);
    const key = await deriveKeyFromPassphrase('old passphrase', salt, DEFAULT_KDF_PARAMS);
    const enc = await encryptAESGCM(JSON.stringify(payload), key);
    const legacy = {
      magic: 'NOVA_BACKUP',
      version: 1,
      kdf: DEFAULT_KDF_PARAMS,
      salt: bufferToBase64(salt),
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      exportedAt: payload.exportedAt,
    };
    const restored = await restoreEncryptedBackup(JSON.stringify(legacy), 'old passphrase');
    expect(restored.identity.fingerprint).toBe('nova_pk_test');
  });

  it('rejects out-of-range Argon2id params (no downgrade attacks)', async () => {
    const evil = {
      magic: 'NOVA_BACKUP',
      version: 2,
      kdf: { name: 'Argon2id', memoryKiB: 8, iterations: 1, parallelism: 1 },
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      ciphertext: 'AAAA',
      iv: 'AAAA',
      exportedAt: '',
    };
    await expect(
      restoreEncryptedBackup(JSON.stringify(evil), 'x'),
    ).rejects.toThrow('Invalid backup memory parameter');
  });

  it('rejects unknown KDF names', async () => {
    const evil = {
      magic: 'NOVA_BACKUP',
      version: 2,
      kdf: { name: 'bcrypt' },
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      ciphertext: 'AAAA',
      iv: 'AAAA',
      exportedAt: '',
    };
    await expect(
      restoreEncryptedBackup(JSON.stringify(evil), 'x'),
    ).rejects.toThrow('Unsupported backup key derivation parameters');
  });
});
