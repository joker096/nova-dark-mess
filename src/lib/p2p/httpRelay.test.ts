import { describe, it, expect, vi } from 'vitest';
import type { RelayEnvelope } from './relay';
import { pushRelayEnvelope, pullRelayEnvelopes, HttpRelayTransport } from './httpRelay';

function makeEnvelope(overrides: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    id: 'abc123',
    origin: 'fp-origin',
    destination: 'fp-dest',
    ttl: 3,
    createdAt: 1000,
    hops: ['fp-origin'],
    sealed: true,
    payload: { hello: 'world' },
    ...overrides,
  };
}

describe('httpRelay', () => {
  it('pushRelayEnvelope POSTs the envelope and returns true on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const env = makeEnvelope();
    const ok = await pushRelayEnvelope({ baseUrl: 'https://relay.example.com/', fetchImpl: fetchMock as any }, env);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/api/relay',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('pushRelayEnvelope returns false on network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('net'));
    const ok = await pushRelayEnvelope({ baseUrl: 'https://relay.example.com', fetchImpl: fetchMock as any }, makeEnvelope());
    expect(ok).toBe(false);
  });

  it('pullRelayEnvelopes returns envelopes on 2xx', async () => {
    const env = makeEnvelope();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ envelopes: [env] }),
    });
    const out = await pullRelayEnvelopes({ baseUrl: 'https://relay.example.com', fetchImpl: fetchMock as any }, 'fp-dest');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('abc123');
  });

  it('pullRelayEnvelopes returns [] on non-2xx or error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await pullRelayEnvelopes({ baseUrl: 'https://relay.example.com', fetchImpl: fetchMock as any }, 'fp-dest')).toEqual([]);
    const fetchErr = vi.fn().mockRejectedValue(new Error('net'));
    expect(await pullRelayEnvelopes({ baseUrl: 'https://relay.example.com', fetchImpl: fetchErr as any }, 'fp-dest')).toEqual([]);
  });

  it('HttpRelayTransport wraps push/pull', async () => {
    const env = makeEnvelope();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ envelopes: [env] }) });
    const t = new HttpRelayTransport({ baseUrl: 'https://relay.example.com', fetchImpl: fetchMock as any });
    expect(await t.push(env)).toBe(true);
    const pulled = await t.pull('fp-dest');
    expect(pulled).toHaveLength(1);
  });
});
