/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  computeRelayReceipt,
  receiptMissing,
  verifyRelayReceipt,
} from './receipt';

describe('A6: relay response receipts', () => {
  const secret = 'recipient-token-for-tests';
  const body = { queueId: 'q_0123456789abcdef0123456789abcdef', packets: [], relayTime: 5 };

  it('accepts the relay tag for the exact body', () => {
    const tag = computeRelayReceipt(secret, 'poll', body);
    expect(verifyRelayReceipt(secret, 'poll', body, tag)).toBe(true);
  });

  it('rejects the tag for a different body (packets removed by a proxy)', () => {
    const tag = computeRelayReceipt(secret, 'poll', body);
    const tampered = { ...body, packets: [{ packetId: 'p_1' }] };
    expect(verifyRelayReceipt(secret, 'poll', tampered, tag)).toBe(false);
  });

  it('rejects a tag from a different secret', () => {
    const tag = computeRelayReceipt('other-secret', 'poll', body);
    expect(verifyRelayReceipt(secret, 'poll', body, tag)).toBe(false);
  });

  it('rejects a tag reused for another action', () => {
    const tag = computeRelayReceipt(secret, 'ack', body);
    expect(verifyRelayReceipt(secret, 'poll', body, tag)).toBe(false);
  });

  it('is insensitive to key order but not to values', () => {
    const tag = computeRelayReceipt(secret, 'poll', { b: 2, a: 1 });
    expect(verifyRelayReceipt(secret, 'poll', { a: 1, b: 2 }, tag)).toBe(true);
    expect(verifyRelayReceipt(secret, 'poll', { a: 1, b: 3 }, tag)).toBe(false);
  });

  it('reports a missing receipt separately from an invalid one', () => {
    expect(verifyRelayReceipt(secret, 'poll', body, undefined)).toBeNull();
    expect(verifyRelayReceipt(secret, 'poll', body, null)).toBeNull();
    expect(verifyRelayReceipt(secret, 'poll', body, '')).toBe(false);
    expect(verifyRelayReceipt(secret, 'poll', body, 'garbage')).toBe(false);
    expect(receiptMissing(undefined)).toBe(true);
    expect(receiptMissing('abc')).toBe(false);
  });
});
