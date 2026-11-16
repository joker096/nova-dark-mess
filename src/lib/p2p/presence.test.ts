/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  heartbeatPresence,
  presenceIdFor,
  resolvePresenceIds,
} from './presence';

function fetchRecorder() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  return { impl, calls };
}

beforeEach(() => {
  localStorage.clear();
});

describe('presence privacy', () => {
  it('hashes fingerprints into opaque presence ids deterministically', async () => {
    const a = await presenceIdFor('ABCD-1234', true);
    const b = await presenceIdFor('ABCD-1234', true);
    expect(a).toBe(b);
    expect(a).toMatch(/^ph1\.[0-9a-f]{32}$/);
    expect(a).not.toContain('ABCD');
  });

  it('passes the fingerprint through when hashing is off', async () => {
    await expect(presenceIdFor('ABCD-1234', false)).resolves.toBe('ABCD-1234');
  });

  it('sends a hashed id and TTL on the heartbeat', async () => {
    const { impl, calls } = fetchRecorder();
    await heartbeatPresence('ABCD-1234', impl, { hash: true, ttl: 'long' });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.fingerprint).toMatch(/^ph1\.[0-9a-f]{32}$/);
    expect(body.ttlMs).toBe(300_000);
  });

  it('sends the raw fingerprint when hashing is disabled', async () => {
    const { impl, calls } = fetchRecorder();
    await heartbeatPresence('ABCD-1234', impl, { hash: false });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.fingerprint).toBe('ABCD-1234');
  });

  it('resolves hashed ids back to locally known fingerprints', async () => {
    const ids = [
      await presenceIdFor('peer-A', true),
      await presenceIdFor('stranger', true),
      'raw-peer',
    ];
    const peers = await resolvePresenceIds(ids, ['peer-A', 'raw-peer'], true);
    expect(peers.sort()).toEqual(['peer-A', 'raw-peer'].sort());
  });

  it('keeps unknown hashed ids opaque (never leaks a guess)', async () => {
    const ids = [await presenceIdFor('stranger', true)];
    const peers = await resolvePresenceIds(ids, ['peer-A'], true);
    expect(peers).toEqual([]);
  });

  it('resolves raw fingerprints when hashing is off', async () => {
    const peers = await resolvePresenceIds(['peer-A', 'ghost'], ['peer-A'], false);
    expect(peers).toEqual(['peer-A']);
  });
});
