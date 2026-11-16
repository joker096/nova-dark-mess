import {
  base64ToBuffer,
  bufferToBase64,
  decryptAESGCM,
  encryptAESGCM,
  EncryptedData,
} from '../crypto/aes';
import { UserIdentity } from '../crypto/identity';
import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_PARAMS,
  deriveKeyFromPassphrase,
  generateSalt,
  KdfParams,
} from './kdf';
import type { DatabaseSnapshot } from './db';

export interface BackupPayload {
  version: number;
  identity: UserIdentity;
  chatsMetadata: Array<{ id: string; name: string; isEncrypted: boolean }>;
  exportedAt: string;
  data?: DatabaseSnapshot;
}

interface BackupFile {
  magic: 'NOVA_BACKUP';
  version: 1 | 2;
  kdf: KdfParams;
  salt: string;
  ciphertext: string;
  iv: string;
  exportedAt: string;
}

function validatePbkdf2(params: Partial<KdfParams>): KdfParams {
  if (params.hash !== 'SHA-256') {
    throw new Error('Unsupported backup key derivation parameters');
  }
  const iterations = Number(params.iterations);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 2000000) {
    throw new Error('Invalid backup key derivation strength');
  }
  return { name: 'PBKDF2', hash: 'SHA-256', iterations };
}

function validateArgon2id(params: Partial<KdfParams>): KdfParams {
  const memoryKiB = Number(params.memoryKiB);
  const iterations = Number(params.iterations);
  const parallelism = Number(params.parallelism ?? 1);
  if (!Number.isInteger(memoryKiB) || memoryKiB < 8192 || memoryKiB > 1048576) {
    throw new Error('Invalid backup memory parameter');
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 16) {
    throw new Error('Invalid backup key derivation strength');
  }
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 8) {
    throw new Error('Invalid backup parallelism parameter');
  }
  return { name: 'Argon2id', memoryKiB, iterations, parallelism };
}

function validateKdfParams(params: unknown): KdfParams {
  if (!params || typeof params !== 'object') {
    // Legacy files (v1) carried the default PBKDF2 params implicitly.
    return DEFAULT_KDF_PARAMS;
  }
  const candidate = params as Partial<KdfParams>;
  if (candidate.name === 'Argon2id') return validateArgon2id(candidate);
  if (candidate.name === 'PBKDF2' || candidate.name === undefined) {
    return validatePbkdf2(candidate);
  }
  throw new Error('Unsupported backup key derivation parameters');
}

export async function createEncryptedBackupBlob(
  payload: BackupPayload,
  passphrase: string
): Promise<Blob> {
  if (passphrase.length < 8) {
    throw new Error('Backup passphrase must contain at least 8 characters');
  }

  const salt = generateSalt(16);
  // New backups use Argon2id (memory-hard, GPU-resistant). Legacy PBKDF2
  // backups remain restorable via the version field.
  const kdf = DEFAULT_ARGON2ID_PARAMS;
  const masterKey = await deriveKeyFromPassphrase(passphrase, salt, kdf);
  const encrypted: EncryptedData = await encryptAESGCM(JSON.stringify(payload), masterKey);

  const file: BackupFile = {
    magic: 'NOVA_BACKUP',
    version: 2,
    kdf,
    salt: bufferToBase64(salt),
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    exportedAt: new Date().toISOString(),
  };

  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export async function restoreEncryptedBackup(
  backupFileContent: string,
  passphrase: string
): Promise<BackupPayload> {
  let file: Partial<BackupFile> & { saltHex?: string };
  try {
    file = JSON.parse(backupFileContent);
  } catch {
    throw new Error('Invalid .nova-backup file');
  }

  if (file.magic !== 'NOVA_BACKUP' || (file.version !== 1 && file.version !== 2)) {
    throw new Error('Unsupported .nova-backup format');
  }
  if (!file.salt || !file.ciphertext || !file.iv) {
    throw new Error('Incomplete .nova-backup file');
  }

  const kdf = validateKdfParams(file.kdf);
  const salt = base64ToBuffer(file.salt);
  if (salt.length < 16) {
    throw new Error('Corrupted salt in backup file');
  }

  const masterKey = await deriveKeyFromPassphrase(passphrase, salt, kdf);
  let decryptedJson: string;
  try {
    decryptedJson = await decryptAESGCM(
      { ciphertext: file.ciphertext, iv: file.iv },
      masterKey
    );
  } catch {
    throw new Error('Invalid passphrase or corrupted backup file');
  }

  const payload = JSON.parse(decryptedJson) as BackupPayload;
  if (!payload || typeof payload.version !== 'number' || !payload.identity) {
    throw new Error('Backup payload is invalid');
  }
  return payload;
}
