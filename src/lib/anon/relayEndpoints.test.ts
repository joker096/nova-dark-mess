import { describe, expect, it } from 'vitest';
import { planRelayEndpoints, relayEndpointsFromEnv } from './relayEndpoints';
import type { RelayEndpoint } from './relays';

const list: RelayEndpoint[] = [
  { id: 'https://relay.example', url: 'https://relay.example' },
  { id: 'https://relay2.example', url: 'https://relay2.example' },
];

describe('relay endpoints from the build', () => {
  it('takes the primary first, then fallbacks, without duplicates', () => {
    expect(
      relayEndpointsFromEnv('https://relay.example/', ' https://relay2.example ', 'https://relay.example'),
    ).toEqual(list);
  });

  it('ignores empty and unusable entries instead of failing the build', () => {
    expect(relayEndpointsFromEnv('', undefined, null, 'http://relay.example')).toEqual([]);
  });

  it('keeps onion mirrors, which the Tor mode can reach', () => {
    expect(relayEndpointsFromEnv('http://abcdefghijklmnopqrstuvwxyz234567.onion')).toEqual([
      { id: 'http://abcdefghijklmnopqrstuvwxyz234567.onion', url: 'http://abcdefghijklmnopqrstuvwxyz234567.onion' },
    ]);
  });
});

describe('relay plan for a conversation', () => {
  it('uses the configured order when the queue already lives on our relay', () => {
    expect(planRelayEndpoints('https://relay.example', 'https://relay.example', list)).toEqual(list);
  });

  it('starts at the peer relay when it lives on another host, so rotation crosses hosts', () => {
    expect(planRelayEndpoints('https://relay.example', 'https://peer.example', list)).toEqual(list);
  });

  it('rotates an older queue off its own unlisted relay onto the configured ones', () => {
    expect(planRelayEndpoints('https://old.example', 'https://old.example', list)).toEqual([
      { id: 'https://old.example', url: 'https://old.example' },
      ...list,
    ]);
  });

  it('has no plan without configured relays (local-only mode)', () => {
    expect(planRelayEndpoints('', '', [])).toEqual([]);
  });
});
