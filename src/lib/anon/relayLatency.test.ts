import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordRelayLatency,
  getRelayLatency,
  getAllRelayLatencies,
  clearRelayLatency,
} from './relayLatency';

beforeEach(() => clearRelayLatency());

describe('relay latency', () => {
  it('records and returns round-trip latency per relay', () => {
    recordRelayLatency('https://relay.example', 123);
    expect(getRelayLatency('https://relay.example')).toBe(123);
    expect(getRelayLatency('https://other.example')).toBeUndefined();
  });

  it('ignores invalid inputs', () => {
    recordRelayLatency('', 10);
    recordRelayLatency('https://relay.example', -1);
    recordRelayLatency('https://relay.example', NaN);
    expect(getAllRelayLatencies().size).toBe(0);
  });

  it('updates an existing sample in place', () => {
    recordRelayLatency('https://relay.example', 10);
    recordRelayLatency('https://relay.example', 50);
    expect(getRelayLatency('https://relay.example')).toBe(50);
    expect(getAllRelayLatencies().size).toBe(1);
  });

  it('clears all samples', () => {
    recordRelayLatency('https://relay.example', 10);
    clearRelayLatency();
    expect(getRelayLatency('https://relay.example')).toBeUndefined();
  });

  it('caps the sample table and evicts the oldest entry', () => {
    for (let i = 0; i < 300; i++) recordRelayLatency(`https://relay-${i}.example`, i);
    expect(getAllRelayLatencies().size).toBe(256);
    expect(getRelayLatency('https://relay-0.example')).toBeUndefined();
    expect(getRelayLatency('https://relay-299.example')).toBe(299);
  });
});
