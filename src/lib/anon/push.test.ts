import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerPush, fetchPushHint, sanitizePushRegistration, createPushHintPoller } from './push';

function mockFetch(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init || {} });
    return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

describe('push registration', () => {
  it('registers a push token with a queue id', async () => {
    const { fn, calls } = mockFetch({ ok: true });
    const ok = await registerPush({ baseUrl: 'https://relay.example', fetchImpl: fn }, 'push-token-123', 'q_0123456789abcdef0123456789abcdef');
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://relay.example/api/anon/push/register');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      pushToken: 'push-token-123',
      queueId: 'q_0123456789abcdef0123456789abcdef',
    });
  });

  it('returns false on a failed registration', async () => {
    const { fn } = mockFetch({ ok: false, reason: 'INVALID_QUEUE_ID' }, 400);
    const ok = await registerPush({ baseUrl: 'https://relay.example', fetchImpl: fn }, 'push-token-123', 'not-a-queue-id');
    expect(ok).toBe(false);
  });

  it('fetches an empty push hint', async () => {
    const { fn, calls } = mockFetch({ ok: true, queueId: 'q_0123456789abcdef0123456789abcdef', hint: '' });
    const hint = await fetchPushHint({ baseUrl: 'https://relay.example', fetchImpl: fn }, 'push-token-123');
    expect(hint).toEqual({ queueId: 'q_0123456789abcdef0123456789abcdef' });
    expect(calls[0].url).toContain('/api/anon/push/hint?pushToken=push-token-123');
  });

  it('returns null when the hint is not found', async () => {
    const { fn } = mockFetch({ ok: false, reason: 'PUSH_TOKEN_NOT_FOUND' }, 404);
    const hint = await fetchPushHint({ baseUrl: 'https://relay.example', fetchImpl: fn }, 'push-token-123');
    expect(hint).toBeNull();
  });
});

describe('push registration sanitizer', () => {
  it('accepts a valid registration', () => {
    const reg = sanitizePushRegistration({ pushToken: 'token', queueId: 'q_0123456789abcdef0123456789abcdef' });
    expect(reg).toEqual({ pushToken: 'token', queueId: 'q_0123456789abcdef0123456789abcdef' });
  });

  it('rejects bad inputs', () => {
    expect(sanitizePushRegistration({ pushToken: '', queueId: 'q_x' })).toBeNull();
    expect(sanitizePushRegistration({ pushToken: 'token', queueId: 'bad-queue-id' })).toBeNull();
    expect(sanitizePushRegistration(null)).toBeNull();
    expect(sanitizePushRegistration({ pushToken: 'token', queueId: 'q_0123456789abcdef0123456789abcdef', extra: 'nope' })).toEqual({
      pushToken: 'token',
      queueId: 'q_0123456789abcdef0123456789abcdef',
    });
  });
});

const QUEUE_A = 'q_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const QUEUE_B = 'q_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function hintFetch(responses: Record<string, { queueId: string } | 'miss'>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const token = url.searchParams.get('pushToken') || '';
    calls.push(token);
    const response = responses[token];
    if (!response || response === 'miss') {
      return { ok: false, status: 404, json: async () => ({ ok: false }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, queueId: response.queueId, hint: '' }),
    } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('push hint poller', () => {
  it('skips polling while hidden or offline', async () => {
    const { fn, calls } = hintFetch({ 'token-a': { queueId: QUEUE_A } });
    const poller = createPushHintPoller({
      config: { baseUrl: 'https://relay.example', fetchImpl: fn },
      subscriptions: () => [{ pushToken: 'token-a', queueId: QUEUE_A }],
      onHint: () => {},
      isVisible: () => false,
      isOnline: () => true,
    });
    expect(await poller.pollOnce()).toEqual([]);
    const offline = createPushHintPoller({
      config: { baseUrl: 'https://relay.example', fetchImpl: fn },
      subscriptions: () => [{ pushToken: 'token-a', queueId: QUEUE_A }],
      onHint: () => {},
      isVisible: () => true,
      isOnline: () => false,
    });
    expect(await offline.pollOnce()).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('reports each hinted queue once and ignores invalid subscriptions', async () => {
    const { fn } = hintFetch({ 'token-a': { queueId: QUEUE_A }, 'token-b': { queueId: QUEUE_A } });
    const hinted: string[] = [];
    const poller = createPushHintPoller({
      config: { baseUrl: 'https://relay.example', fetchImpl: fn },
      subscriptions: () => [
        { pushToken: 'token-a', queueId: QUEUE_A },
        { pushToken: 'token-b', queueId: QUEUE_A },
        { pushToken: '', queueId: QUEUE_B },
        { pushToken: 'token-c', queueId: 'not-a-queue' },
      ],
      onHint: (queueId) => {
        hinted.push(queueId);
      },
      isVisible: () => true,
      isOnline: () => true,
    });
    expect(await poller.pollOnce()).toEqual([QUEUE_A]);
    expect(hinted).toEqual([QUEUE_A]);
  });

  it('backs off a failing token without touching healthy ones', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { fn, calls } = hintFetch({ 'token-a': { queueId: QUEUE_A }, 'token-b': 'miss' });
    const poller = createPushHintPoller({
      config: { baseUrl: 'https://relay.example', fetchImpl: fn },
      subscriptions: () => [
        { pushToken: 'token-a', queueId: QUEUE_A },
        { pushToken: 'token-b', queueId: QUEUE_B },
      ],
      onHint: () => {},
      intervalMs: 60_000,
      jitter: () => 0,
      isVisible: () => true,
      isOnline: () => true,
    });

    expect(await poller.pollOnce()).toEqual([QUEUE_A]);
    expect(calls).toContain('token-a');
    expect(calls).toContain('token-b');

    calls.length = 0;
    expect(await poller.pollOnce()).toEqual([]);
    expect(calls).toEqual([]);

    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    expect(await poller.pollOnce()).toEqual([QUEUE_A]);
    expect(calls).toEqual(['token-a', 'token-b']);
  });

  it('stops polling after stop()', async () => {
    vi.useFakeTimers();
    const { fn, calls } = hintFetch({ 'token-a': { queueId: QUEUE_A } });
    const poller = createPushHintPoller({
      config: { baseUrl: 'https://relay.example', fetchImpl: fn },
      subscriptions: () => [{ pushToken: 'token-a', queueId: QUEUE_A }],
      onHint: () => {},
      intervalMs: 1000,
      jitter: () => 0,
      isVisible: () => true,
      isOnline: () => true,
    });
    const stop = poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBe(1);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.length).toBe(1);
  });
});
