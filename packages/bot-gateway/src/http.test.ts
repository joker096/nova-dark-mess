/// <reference types="vitest/globals" />

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  BotHTTPGateway,
  isPrivateAddress,
  validateWebhookDestination,
  validateWebhookUrl,
} from './http';
import { createHmac } from 'crypto';

describe('BotHTTPGateway', () => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const gateway = {
    sendMessage: async (chatId: string, text: string) => {
      sent.push({ chatId, text });
      return true;
    },
    getPreKeyBundle: async () => ({ fingerprint: 'fp_bot_123' }),
    registerPeerBundle: () => true,
  };

  let server: BotHTTPGateway;
  let port: number | null = null;

  beforeEach(async () => {
    server = new BotHTTPGateway({
      botToken: 'test_token_123',
      webhookSecret: 'wh_secret',
      gateway,
      longPollTimeoutMs: 200,
      // Keep tests offline: public answer unless a test overrides it.
      resolveHost: async () => ['93.184.216.34'],
    });
    await server.listen(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.close();
    sent.length = 0;
  });

  async function post(path: string, body: unknown, token = 'test_token_123'): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const req2 = http.request({
        hostname: '127.0.0.1',
        port,
        path: `/bot/${token}${path}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res: import('http').IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} });
        });
      });
      req2.on('error', reject);
      req2.write(JSON.stringify(body));
      req2.end();
    });
  }

  it('rejects requests with wrong token', async () => {
    const res = await post('/sendMessage', { chat_id: 'c1', text: 'hi' }, 'wrong');
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('rejects non-POST methods', async () => {
    const res = await new Promise<{ status: number; body: any }>((resolve) => {
      const http = require('http');
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/bot/test_token_123/getMe',
        method: 'GET',
      }, (res: import('http').IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} });
        });
      });
      req.on('error', () => resolve({ status: 0, body: {} }));
      req.end();
    });
    expect(res.status).toBe(405);
    expect(res.body.ok).toBe(false);
  });

  it('getMe returns bot info with fingerprint', async () => {
    const res = await post('/getMe', {});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.fingerprint).toBe('fp_bot_123');
    expect(res.body.result.is_bot).toBe(true);
  });

  it('sendMessage delivers and rate-limits per chat', async () => {
    const res = await post('/sendMessage', { chat_id: 'chat1', text: 'hello bot' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ chatId: 'chat1', text: 'hello bot' });

    // Rapid fire from same chat -> 429 after 1 msg/s
    const res2 = await post('/sendMessage', { chat_id: 'chat1', text: 'again' });
    expect(res2.status).toBe(429);
  });

  it('allows messages from different chats', async () => {
    await post('/sendMessage', { chat_id: 'chat1', text: 'a' });
    const res = await post('/sendMessage', { chat_id: 'chat2', text: 'b' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it('rejects missing fields', async () => {
    const res = await post('/sendMessage', { chat_id: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('setWebhook/deleteWebhook toggles webhook', async () => {
    const set = await post('/setWebhook', { url: 'https://example.com/webhook' });
    expect(set.status).toBe(200);
    expect(set.body.ok).toBe(true);

    const del = await post('/deleteWebhook', {});
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  it('rejects non-https webhook URL', async () => {
    const res = await post('/setWebhook', { url: 'http://example.com/webhook' });
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it('rejects private/loopback webhook URL', async () => {
    for (const url of ['https://127.0.0.1/webhook', 'https://localhost/webhook', 'https://10.0.0.1/webhook', 'https://192.168.1.1/webhook']) {
      const res = await post('/setWebhook', { url });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    }
  });

  it('checks every DNS answer and refuses empty resolutions', async () => {
    const res = await post('/setWebhook', { url: 'https://rebind.example/webhook' });
    expect(res.status).toBe(200);

    // The default resolver in this suite is public, so prove the guard directly.
    await expect(
      validateWebhookDestination('https://rebind.example/webhook', async () => ['127.0.0.1']),
    ).rejects.toThrow(/private\/loopback/);
    await expect(
      validateWebhookDestination('https://rebind.example/webhook', async () => ['93.184.216.34', '10.0.0.5']),
    ).rejects.toThrow(/private\/loopback/);
    await expect(
      validateWebhookDestination('https://rebind.example/webhook', async () => []),
    ).rejects.toThrow(/did not resolve/);
  });

  it('classifies private, loopback and IPv6 ranges', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.4', '169.254.1.1',
      '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('validateWebhookUrl rejects invalid schemes and private hosts', () => {
    expect(() => validateWebhookUrl('http://example.com/x')).toThrow();
    expect(() => validateWebhookUrl('https://127.0.0.1/x')).toThrow();
    expect(() => validateWebhookUrl('https://localhost/x')).toThrow();
    expect(() => validateWebhookUrl('not-a-url')).toThrow();
    expect(() => validateWebhookUrl('https://example.com/x')).not.toThrow();
  });

  it('enqueueIncoming delivers via getUpdates long-poll', async () => {
    server.enqueueIncoming('chat1', 'hello from p2p');
    const res = await post('/getUpdates', { offset: 0 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result).toHaveLength(1);
    expect(res.body.result[0].update_id).toBe(1);
    expect(res.body.result[0].message.chat.id).toBe('chat1');
    expect(res.body.result[0].message.text).toBe('hello from p2p');
    expect(typeof res.body.result[0].message.date).toBe('number');
  });

  it('serves a Telegram-shaped client end-to-end', async () => {
    // The same request/response shapes grammY/telegraf use: base URL swap only.
    class FakeTelegramClient {
      constructor(private readonly token: string) {}

      private async call(method: string, payload: Record<string, unknown>): Promise<any> {
        const res = await post(`/${method}`, payload, this.token);
        if (!res.body.ok) throw new Error(res.body.error ?? `HTTP ${res.status}`);
        return res.body.result;
      }

      sendMessage(chatId: string, text: string) {
        return this.call('sendMessage', { chat_id: chatId, text });
      }

      getUpdates(offset = 0) {
        return this.call('getUpdates', { offset, timeout: 0 }) as Promise<any[]>;
      }

      setWebhook(url: string) {
        return this.call('setWebhook', { url });
      }

      deleteWebhook() {
        return this.call('deleteWebhook', {});
      }

      getMe() {
        return this.call('getMe', {});
      }

      setMyCommands(commands: Array<{ command: string; description: string }>) {
        return this.call('setMyCommands', { commands });
      }
    }

    const client = new FakeTelegramClient('test_token_123');
    expect(await client.getMe()).toMatchObject({ username: expect.any(String) });

    const sentMessage = await client.sendMessage('chat42', 'hello from grammY-shaped client');
    expect(sentMessage).toMatchObject({ chat: { id: 'chat42' }, text: 'hello from grammY-shaped client' });

    expect(await client.setMyCommands([{ command: 'start', description: 'Start' }])).toEqual(true);
    expect(await client.setWebhook('https://example.com/hook')).toEqual(true);
    expect(await client.deleteWebhook()).toEqual(true);

    server.enqueueIncoming('chat42', 'incoming');
    const updates = await client.getUpdates(0);
    expect(updates[0].message).toMatchObject({ chat: { id: 'chat42' }, text: 'incoming' });
  });

  it('survives random and malformed bodies (seeded fuzz)', async () => {
    // Deterministic LCG so a failure is reproducible from the seed.
    let state = 0x5eed;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];
    const methods = ['sendMessage', 'getUpdates', 'setWebhook', 'deleteWebhook', 'getMe', 'answerCallbackQuery', 'setMyCommands'];
    const values: unknown[] = [
      null,
      [],
      {},
      { chat_id: 42, text: {} },
      { url: 'javascript:alert(1)' },
      { offset: 'not-a-number', limit: -1, timeout: 10 ** 9 },
      { commands: 'nope' },
      { webhook_url: 'https://127.0.0.1/x' },
      { nested: { deep: [1, 2, { three: true }] } },
    ];

    for (let i = 0; i < 30; i += 1) {
      const method = pick(methods);
      const body = pick(values);
      // getUpdates long-polls for up to 30 s; pin it to an immediate return so
      // the fuzzer cannot turn one random body into a test timeout.
      const payload = method === 'getUpdates'
        ? { ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}), timeout: 0, offset: 0 }
        : body;
      const res = await post(`/${method}`, payload);
      // Any structured error is fine; a hang or crash is not.
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
      expect(typeof res.body).toBe('object');
    }

    // The server is still healthy after the fuzz.
    const ok = await post('/sendMessage', { chat_id: 'c1', text: 'still alive' });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  it('delivers webhook with HMAC signature on incoming message', async () => {
    const fetchCalls: Array<{
      url: string;
      headers: Record<string, string>;
      body: string;
      redirect?: RequestRedirect;
    }> = [];
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn(async (_url: string, init: RequestInit) => {
      fetchCalls.push({
        url: _url as string,
        headers: init.headers as Record<string, string>,
        body: typeof init.body === 'string' ? init.body : '',
        redirect: init.redirect,
      });
      return { ok: true } as Response;
    });

    try {
      await post('/setWebhook', { url: 'https://example.com/webhook', secret_token: 'mysecret' });
      server.enqueueIncoming('chat1', 'webhook test');

      // allow the fire-and-forget deliverWebhook microtask to run
      await new Promise((r) => setTimeout(r, 10));

      expect(fetchCalls).toHaveLength(1);
      const { url, headers, body } = fetchCalls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(fetchCalls[0].redirect).toBe('manual');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Telegram-Bot-Api-Secret-Token']).toBe('mysecret');
      const parsed = JSON.parse(body);
      expect(parsed.message.text).toBe('webhook test');
      expect(parsed.message.chat.id).toBe('chat1');
      const expectedSig = createHmac('sha256', 'mysecret').update(body).digest('hex');
      expect(headers['X-Hub-Signature-256']).toBe(`sha256=${expectedSig}`);
    } finally {
      (globalThis as any).fetch = origFetch;
    }
  });

  it('retries a 5xx webhook delivery and stops after success', async () => {
    let calls = 0;
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn(async () => {
      calls += 1;
      return { ok: calls >= 3, status: calls >= 3 ? 200 : 500 } as Response;
    });

    try {
      await post('/setWebhook', { url: 'https://example.com/webhook' });
      server.enqueueIncoming('chat1', 'retry me');
      await new Promise((r) => setTimeout(r, 500));
      expect(calls).toBe(3);
    } finally {
      (globalThis as any).fetch = origFetch;
    }
  });
});
