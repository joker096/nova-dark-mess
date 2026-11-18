import { describe, it, expect } from 'vitest';
import { constantTimeEqual } from './constantTime';

describe('constantTimeEqual', () => {
  it('accepts identical strings', () => {
    expect(constantTimeEqual('a3f1c9', 'a3f1c9')).toBe(true);
  });

  it('rejects a difference at the first and at the last character', () => {
    expect(constantTimeEqual('a3f1c9', 'b3f1c9')).toBe(false);
    expect(constantTimeEqual('a3f1c9', 'a3f1c8')).toBe(false);
  });

  it('rejects a prefix of the expected value', () => {
    expect(constantTimeEqual('a3f1c', 'a3f1c9')).toBe(false);
    expect(constantTimeEqual('', 'a3f1c9')).toBe(false);
  });

  it('treats two empty strings as equal', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
