import { describe, it, expect } from 'vitest';
import {
  FAILOVER_AFTER_FAILURES,
  noteRelayFailure,
  noteRelaySuccess,
  shouldFailoverRelay,
} from './relayHealth';

describe('relay failure tracking', () => {
  it('only gives up on a relay after repeated failures', () => {
    let map = {};
    for (let i = 1; i < FAILOVER_AFTER_FAILURES; i++) {
      map = noteRelayFailure(map, 'https://r1.example');
      expect(shouldFailoverRelay(map, 'https://r1.example')).toBe(false);
    }
    map = noteRelayFailure(map, 'https://r1.example');
    expect(shouldFailoverRelay(map, 'https://r1.example')).toBe(true);
    expect(shouldFailoverRelay(map, 'https://r2.example')).toBe(false);
  });

  it('forgets failures as soon as the relay answers again', () => {
    let map = noteRelayFailure(noteRelayFailure({}, 'https://r1.example'), 'https://r1.example');
    expect(noteRelaySuccess(map, 'https://r1.example')).toEqual({});
    map = noteRelaySuccess(map, 'https://r1.example');
    expect(shouldFailoverRelay(map, 'https://r1.example')).toBe(false);
  });

  it('stops counting once a relay is already marked unusable', () => {
    let map = {};
    for (let i = 0; i < FAILOVER_AFTER_FAILURES + 5; i++) {
      map = noteRelayFailure(map, 'https://r1.example');
    }
    expect(map['https://r1.example']).toEqual({ failures: FAILOVER_AFTER_FAILURES });
  });
});
