import { describe, expect, it } from 'vitest';
import { formatCount } from './formatCount';

describe('formatCount', () => {
  it('keeps small numbers untouched', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999)).toBe('999');
  });

  it('compacts thousands and millions', () => {
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(12_000)).toBe('12K');
    expect(formatCount(120_000)).toBe('120K');
    expect(formatCount(1_234_567)).toBe('1.2M');
    expect(formatCount(3_500_000_000)).toBe('3.5B');
  });

  it('caps at max with a plus sign', () => {
    expect(formatCount(99, { max: 99 })).toBe('99');
    expect(formatCount(150, { max: 99 })).toBe('99+');
    expect(formatCount(1500, { max: 99 })).toBe('99+');
  });

  it('survives bad input and negatives', () => {
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(-5)).toBe('0');
    expect(formatCount(12.7)).toBe('12');
  });

  it('accepts a custom locale', () => {
    expect(formatCount(1500, { locale: 'de' })).toBe('1,5K');
  });
});
