import {
  DEFAULT_ARGON2ID_PARAMS,
  DEFAULT_KDF_PARAMS,
  deriveKeyFromPassphrase,
  type KdfParams,
} from '../storage/kdf';
import { constantTimeEqual } from '../crypto/constantTime';

/**
 * PIN hashing and verification.
 *
 * The PIN is hashed with Argon2id, salted per device, and compared in constant
 * time. Hashes created by older builds (plain PBKDF2 hex, with either a random
 * salt or the fixed `nova-pin-v1` salt) are still verifiable once and are
 * re-hashed with Argon2id on success, so an existing user does not lose their
 * PIN.
 */
export const LEGACY_PIN_SALT = 'nova-pin-v1';
const ARGON2_PREFIX = 'argon2id$';

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function derivePinHash(
  pin: string,
  salt: string,
  params: KdfParams,
): Promise<string> {
  const saltBytes = new TextEncoder().encode(salt);
  const key = await deriveKeyFromPassphrase(pin, saltBytes, params, true);
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToHex(new Uint8Array(raw));
}

/** Current format: `argon2id$<64 hex chars>`. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return `${ARGON2_PREFIX}${await derivePinHash(pin, salt, DEFAULT_ARGON2ID_PARAMS)}`;
}

/** Pre-Argon2id format: plain 64 hex chars derived with PBKDF2-600k. */
async function hashPinLegacy(pin: string, salt: string): Promise<string> {
  return derivePinHash(pin, salt, DEFAULT_KDF_PARAMS);
}

export interface PinCheckInput {
  pin: string;
  pinHash: string;
  /** Per-device random salt, or null for a hash created before it existed. */
  salt: string | null;
}

export interface PinCheckResult {
  ok: boolean;
  /** True when a legacy hash matched and should be replaced. */
  migrated: boolean;
  hash?: string;
  salt?: string;
}

/**
 * Checks a PIN against the stored hash. `mintSalt` is injected so the migration
 * path is deterministic in tests.
 */
export async function checkPin(
  { pin, pinHash, salt }: PinCheckInput,
  mintSalt: () => string,
): Promise<PinCheckResult> {
  const existingSalt = salt ?? LEGACY_PIN_SALT;
  const argonHash = await hashPin(pin, existingSalt);
  if (constantTimeEqual(argonHash, pinHash)) return { ok: true, migrated: false };

  // An Argon2id hash can only mean a wrong PIN: never fall through to the
  // cheaper legacy check (that would needlessly double the work per failure).
  if (pinHash.startsWith(ARGON2_PREFIX)) return { ok: false, migrated: false };

  const legacyHash = await hashPinLegacy(pin, existingSalt);
  if (!constantTimeEqual(legacyHash, pinHash)) return { ok: false, migrated: false };

  // A legacy hash matched. Keep the random salt when there is one and upgrade
  // the KDF in place; otherwise mint a per-device salt while upgrading.
  const nextSalt = salt ?? mintSalt();
  return { ok: true, migrated: true, salt: nextSalt, hash: await hashPin(pin, nextSalt) };
}
