import { describe, it, expect, vi } from 'vitest';
import {
  checkTorRunning,
  createTorFetch,
  DEFAULT_TOR_SOCKS_PORT,
  TAURI_TOR_CHECK_COMMAND,
  TAURI_TOR_COMMAND,
} from './tor';
import { createAnonTransport } from './transport';

const ONION = 'http://abcdefghijklmnopqrstuvwxyz234567.onion';

describe('Tor transport (phase I)', () => {
  it('rejects clearnet endpoints without touching the native bridge', async () => {
    const invoke = vi.fn();
    const torFetch = createTorFetch({ invoke });
    await expect(torFetch('https://relay.example/api/anon/poll')).rejects.toThrow('.onion');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects https onion endpoints with a clear message', async () => {
    const invoke = vi.fn();
    const torFetch = createTorFetch({ invoke });
    await expect(torFetch(`https://${ONION.slice(7)}/api/anon/poll`)).rejects.toThrow(
      'http:// .onion endpoints only',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sends the request through the native SOCKS command', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 200, body: '{"ok":true}' });
    const torFetch = createTorFetch({ invoke });

    const response = await torFetch(`${ONION}/api/anon/poll`, {
      method: 'POST',
      body: '{"queueId":"q_1"}',
    });

    expect(invoke).toHaveBeenCalledWith(TAURI_TOR_COMMAND, {
      request: {
        url: `${ONION}/api/anon/poll`,
        method: 'POST',
        body: '{"queueId":"q_1"}',
        socksPort: DEFAULT_TOR_SOCKS_PORT,
      },
    });
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('forwards a custom SOCKS port', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 204, body: '' });
    const torFetch = createTorFetch({ invoke, socksPort: 9150 });
    const response = await torFetch(`${ONION}/api/anon/health`);
    expect(invoke.mock.calls[0][1]).toMatchObject({ request: { socksPort: 9150 } });
    expect(response.status).toBe(204);
  });

  it('propagates a bridge failure instead of silently going direct', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('Tor SOCKS proxy is not reachable'));
    const torFetch = createTorFetch({ invoke });
    await expect(torFetch(`${ONION}/api/anon/poll`)).rejects.toThrow('not reachable');
  });

  it('lets createAnonTransport use the Tor bridge end to end', async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        ok: true,
        queueId: 'q_tor',
        senderToken: 'tok_send',
        recipientToken: 'tok_recv',
        inviteToken: 'tok_invite',
        expiresAt: 1_900_000_000_000,
      }),
    });
    const transport = createAnonTransport({
      relayUrl: ONION,
      tor: { invoke },
      jitter: false,
    });
    // The Tor fetch rejects non-onion at call time; createQueue builds a
    // signing key locally and then talks to the relay through the bridge.
    const queue = await transport.createQueue();
    expect(queue?.queueId).toBe('q_tor');
    expect(queue?.senderToken).toBe('tok_send');
    expect(queue?.recipientToken).toBe('tok_recv');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].request.url).toBe(`${ONION}/api/anon/queues`);
  });

  it('returns null instead of throwing when the relay answers an error', async () => {
    const invoke = vi.fn().mockResolvedValue({ status: 503, body: '{"error":"busy"}' });
    const transport = createAnonTransport({ relayUrl: ONION, tor: { invoke }, jitter: false });
    await expect(transport.createQueue()).resolves.toBeNull();
  });

  it('checkTorRunning reports ok when the SOCKS greeting succeeds', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, port: DEFAULT_TOR_SOCKS_PORT });
    const result = await checkTorRunning({ invoke });
    expect(result).toEqual({ ok: true, port: DEFAULT_TOR_SOCKS_PORT });
    expect(invoke).toHaveBeenCalledWith(TAURI_TOR_CHECK_COMMAND, { socksPort: DEFAULT_TOR_SOCKS_PORT });
  });

  it('checkTorRunning reports not ok with the bridge error', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: false,
      port: 9150,
      error: 'Tor SOCKS proxy is not reachable on 127.0.0.1:9150: connection refused',
    });
    const result = await checkTorRunning({ socksPort: 9150, invoke });
    expect(result.ok).toBe(false);
    expect(result.port).toBe(9150);
    expect(result.error).toContain('connection refused');
  });

  it('checkTorRunning throws on an invalid bridge response', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    await expect(checkTorRunning({ invoke })).rejects.toThrow('invalid response');
  });
});
