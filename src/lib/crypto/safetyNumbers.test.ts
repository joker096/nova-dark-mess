import { describe, it, expect } from 'vitest';
import {
  SAFETY_EMOJIS,
  computeSafetyNumber,
  emojiFingerprint,
  createSafetyQrPayload,
  parseSafetyQrPayload,
  safetyNumbersMatch,
  verifySafetyNumber,
} from './safetyNumbers';

describe('safetyNumbers', () => {
  it('is deterministic and order-independent', () => {
    const a = computeSafetyNumber('fp-alice', 'fp-bob');
    const b = computeSafetyNumber('fp-bob', 'fp-alice');
    expect(a).toBe(b);
    expect(a).toMatch(/^(\d{5} ){11}\d{5}$/);
  });

  it('differs for different peers', () => {
    expect(computeSafetyNumber('fp-alice', 'fp-bob')).not.toBe(
      computeSafetyNumber('fp-alice', 'fp-carol'),
    );
  });

  it('matches when expected equals computed', () => {
    const number = computeSafetyNumber('fp-alice', 'fp-bob');
    expect(safetyNumbersMatch(number, number)).toBe(true);
    expect(verifySafetyNumber('fp-alice', 'fp-bob', number)).toBe(true);
    expect(verifySafetyNumber('fp-alice', 'fp-bob', '00000 00000')).toBe(false);
  });

  it('creates and parses QR payloads', () => {
    const payload = createSafetyQrPayload('nova_pk_abc');
    expect(parseSafetyQrPayload(payload)).toBe('nova_pk_abc');
    expect(parseSafetyQrPayload('not-a-safety-payload')).toBeNull();
    expect(parseSafetyQrPayload('nova-safety:')).toBeNull();
  });

  it('produces emoji fingerprints', () => {
    const emojis = emojiFingerprint('abc', 4);
    expect(emojis.split(' ')).toHaveLength(4);
    for (const emoji of emojis.split(' ')) {
      expect(SAFETY_EMOJIS).toContain(emoji);
    }
  });
});
