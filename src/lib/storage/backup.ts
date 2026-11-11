import {
  base64ToBuffer,
  bufferToBase64,
  decryptAESGCM,
  encryptAESGCM,
  EncryptedData,
} from '../crypto/aes';
import { UserIdentity } from '../crypto/identity';
import {
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
  version: 1;
  kdf: KdfParams;
  salt: string;
  ciphertext: string;
  iv: string;
  exportedAt: string;
}

function validateKdfParams(params: unknown): KdfParams {
  if (!params || typeof params !== 'object') {
    return DEFAULT_KDF_PARAMS;
  }
  const candidate = params as Partial<KdfParams>;
  if (candidate.name !== 'PBKDF2' || candidate.hash !== 'SHA-256') {
    throw new Error('Unsupported backup key derivation parameters');
  }
  const iterations = Number(candidate.iterations);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 2000000) {
    throw new Error('Invalid backup key derivation strength');
  }
  return { name: 'PBKDF2', hash: 'SHA-256', iterations };
}

export async function createEncryptedBackupBlob(
  payload: BackupPayload,
  passphrase: string
): Promise<Blob> {
  if (passphrase.length < 8) {
    throw new Error('Backup passphrase must contain at least 8 characters');
  }

  const salt = generateSalt(16);
  const masterKey = await deriveKeyFromPassphrase(passphrase, salt);
  const encrypted: EncryptedData = await encryptAESGCM(JSON.stringify(payload), masterKey);

  const file: BackupFile = {
    magic: 'NOVA_BACKUP',
    version: 1,
    kdf: DEFAULT_KDF_PARAMS,
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

  if (file.magic !== 'NOVA_BACKUP' || file.version !== 1) {
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
