import { describe, it, expect } from 'vitest';
import { LEGACY_PIN_SALT, checkPin, hashPin } from './pinHash';

const SALT = 'device-salt-1';

describe('pinHash', () => {
  it('is deterministic for the same PIN and salt, and salt-specific', async () => {
    const a = await hashPin('123456', SALT);
    const b = await hashPin('123456', SALT);
    const c = await hashPin('123456', 'other-salt');

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts the right PIN and rejects a wrong one', async () => {
    const pinHash = await hashPin('123456', SALT);

    expect((await checkPin({ pin: '123456', pinHash, salt: SALT }, () => 'x')).ok).toBe(true);
    const wrong = await checkPin({ pin: '123457', pinHash, salt: SALT }, () => 'x');
    expect(wrong.ok).toBe(false);
    expect(wrong.migrated).toBe(false);
  });

  it('verifies a legacy fixed-salt hash and migrates it to a random salt', async () => {
    const legacy = await hashPin('654321', LEGACY_PIN_SALT);

    const result = await checkPin({ pin: '654321', pinHash: legacy, salt: null }, () => 'fresh-salt');

    expect(result.ok).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.salt).toBe('fresh-salt');
    expect(result.hash).toBeDefined();
    expect(result.hash).not.toBe(legacy);

    // The migrated hash verifies on the next attempt with the new salt only.
    expect((await checkPin({ pin: '654321', pinHash: result.hash!, salt: 'fresh-salt' }, () => 'x')).ok).toBe(
      true,
    );
    expect((await checkPin({ pin: '654321', pinHash: result.hash!, salt: null }, () => 'x')).ok).toBe(
      false,
    );
  });

  it('does not migrate when the legacy hash does not match', async () => {
    const legacy = await hashPin('654321', LEGACY_PIN_SALT);
    const result = await checkPin({ pin: '000000', pinHash: legacy, salt: null }, () => 'fresh-salt');

    expect(result.ok).toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.salt).toBeUndefined();
  });
});
