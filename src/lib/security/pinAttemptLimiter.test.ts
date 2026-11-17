/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPinFailures,
  getPinLockoutUntil,
  recordPinFailure,
} from './pinAttemptLimiter';

afterEach(() => {
  localStorage.clear();
});

describe('PIN attempt limiter', () => {
  it('applies increasing lockouts after repeated incorrect PINs', () => {
    expect(recordPinFailure(1000)).toBeNull();
    expect(recordPinFailure(1001)).toBeNull();
    expect(recordPinFailure(1002)).toBe(2002);
    expect(getPinLockoutUntil(2001)).toBe(2002);
    expect(getPinLockoutUntil(2002)).toBeNull();
    expect(recordPinFailure(2002)).toBe(4002);
  });

  it('clears the retry state only when explicitly reset', () => {
    recordPinFailure(1000);
    recordPinFailure(1001);
    recordPinFailure(1002);

    clearPinFailures();

    expect(getPinLockoutUntil(1002)).toBeNull();
    expect(recordPinFailure(1003)).toBeNull();
  });

  it('refuses to silently reset corrupted retry state', () => {
    localStorage.setItem('nova_pin_attempts_v1', '{invalid');
    expect(() => getPinLockoutUntil()).toThrow('corrupted');
    expect(localStorage.getItem('nova_pin_attempts_v1')).toBe('{invalid');
  });
});
