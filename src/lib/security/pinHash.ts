import { deriveKeyFromPassphrase } from '../storage/kdf';
import { constantTimeEqual } from '../crypto/constantTime';

/**
 * PIN hashing and verification.
 *
 * The PIN is hashed with the same Argon2id KDF as the vault, salted per device,
 * and compared in constant time. A hash created before the random salt existed
 * (the fixed `nova-pin-v1` salt) is still verifiable once and is migrated on
 * success, so an existing user does not lose their PIN.
 */
export const LEGACY_PIN_SALT = 'nova-pin-v1';

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const saltBytes = new TextEncoder().encode(salt);
  const key = await deriveKeyFromPassphrase(
    pin,
    saltBytes as unknown as Uint8Array,
    undefined,
    true,
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToHex(new Uint8Array(raw));
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
  if (salt) {
    const hash = await hashPin(pin, salt);
    return { ok: constantTimeEqual(hash, pinHash), migrated: false };
  }

  const legacyHash = await hashPin(pin, LEGACY_PIN_SALT);
  if (!constantTimeEqual(legacyHash, pinHash)) return { ok: false, migrated: false };

  const nextSalt = mintSalt();
  return { ok: true, migrated: true, salt: nextSalt, hash: await hashPin(pin, nextSalt) };
}
