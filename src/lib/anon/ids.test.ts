import { describe, it, expect } from 'vitest';
import { generateQueueId, generateQueueToken, isQueueId, isQueueToken } from './ids';

describe('anon ids', () => {
  it('generates valid queue ids', () => {
    const id = generateQueueId();
    expect(isQueueId(id)).toBe(true);
  });

  it('generates unique queue ids', () => {
    expect(generateQueueId()).not.toBe(generateQueueId());
  });

  it('generates valid queue tokens', () => {
    const token = generateQueueToken();
    expect(isQueueToken(token)).toBe(true);
  });

  it('rejects malformed ids and tokens', () => {
    expect(isQueueId('queue_123')).toBe(false);
    expect(isQueueToken('short')).toBe(false);
  });
});
