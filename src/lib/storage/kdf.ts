import { argon2id } from '@noble/hashes/argon2.js';

export interface KdfParams {
  name: 'PBKDF2' | 'Argon2id';
  hash?: 'SHA-256';
  iterations?: number;
  /** Argon2id only. */
  memoryKiB?: number;
  /** Argon2id only. */
  parallelism?: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = {
  name: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 600000,
};

/** New-backup KDF: Argon2id, memory-hard, GPU/ASIC resistant. Balanced so it
 * stays interactive on mid-range phones (about 1 s) while being far harder to
 * brute-force on GPUs than PBKDF2-600k. */
export const DEFAULT_ARGON2ID_PARAMS: KdfParams = {
  name: 'Argon2id',
  memoryKiB: 32768, // 32 MiB
  iterations: 2, // passes
  parallelism: 1,
};

export function generateSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKeyFromRandomSecret(
  secret: string,
  salt: Uint8Array,
  info = 'nova-device-storage-key'
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: encoder.encode(info),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
  extractable: boolean = false,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const aesParams = { name: 'AES-GCM', length: 256 } as const;

  if (params.name === 'Argon2id') {
    const memoryKiB = params.memoryKiB ?? DEFAULT_ARGON2ID_PARAMS.memoryKiB!;
    const passes = params.iterations ?? DEFAULT_ARGON2ID_PARAMS.iterations!;
    const parallelism = params.parallelism ?? DEFAULT_ARGON2ID_PARAMS.parallelism!;
    const raw = argon2id(encoder.encode(passphrase), salt, {
      m: memoryKiB,
      t: passes,
      p: parallelism,
    });
    return crypto.subtle.importKey('raw', raw, aesParams, extractable, [
      'encrypt',
      'decrypt',
    ]);
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: params.iterations,
      hash: params.hash,
    },
    keyMaterial,
    aesParams,
    extractable,
    ['encrypt', 'decrypt']
  );
}
