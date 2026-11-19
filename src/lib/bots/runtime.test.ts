import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BotInstallError,
  BotRuntime,
  type BotUpdate,
  EncryptedBotStorage,
  InMemoryBotStorage,
  type InstalledBot,
  type MessageSink,
  createRuntimes,
  dispatchUpdate,
  emptyBotRegistry,
  grantAdditionalPermissions,
  installBot,
  pendingConsent,
  setBotEnabled,
  uninstallBot,
} from './runtime';
import type { BotManifest, BotOutgoingMessage } from './types';

const manifest: BotManifest = {
  id: 'echo',
  name: 'Echo Bot',
  username: 'echo_bot',
  version: '1.0.0',
  commands: [{ command: 'start', description: 'Start' }],
  requestedPermissions: ['send_messages', 'inline_keyboard', 'read_messages'],
  entryPoint: '/bots/echo.js',
};

function makeMessageUpdate(overrides: Partial<Extract<BotUpdate, { type: 'message' }>['payload']> = {}): BotUpdate {
  return {
    type: 'message',
    payload: {
      messageId: 'm1',
      chat: { id: 'chat1', kind: 'direct' },
      text: 'hello',
      isCommand: false,
      mentionsBot: false,
      from: 'fp_alice',
      timestamp: Date.now(),
      ...overrides,
    },
  };
}

function makeSink(): MessageSink & { sent: BotOutgoingMessage[]; callbackAnswers: Array<{ id: string; text?: string }> } {
  return {
    sent: [],
    callbackAnswers: [],
    async send(message) {
      this.sent.push(message);
    },
    async edit() {
      return true;
    },
    async del() {
      return true;
    },
    async answerCallback(queryId, options) {
      this.callbackAnswers.push({ id: queryId, text: options?.text });
    },
  };
}

function makeInstalledBot(overrides: Partial<InstalledBot> = {}): InstalledBot {
  return {
    manifest,
    grantedPermissions: ['send_messages', 'inline_keyboard', 'read_messages'],
    installedAt: Date.now(),
    enabled: true,
    ...overrides,
  };
}

describe('bot registry storage', () => {
  let storage: InMemoryBotStorage;

  beforeEach(() => {
    storage = new InMemoryBotStorage();
  });

  it('installs a bot with granted permissions only', async () => {
    const installed = await installBot(manifest, ['send_messages'], storage);
    expect(installed.grantedPermissions).toEqual(['send_messages']);
    expect(installed.enabled).toBe(true);
    const registry = await storage.load();
    expect(registry.bots).toHaveLength(1);
  });

  it('rejects invalid manifests, duplicates and taken usernames', async () => {
    await installBot(manifest, [], storage);
    await expect(installBot({ ...manifest, id: 'other', username: 'echo_bot' }, [], storage)).rejects.toThrow(BotInstallError);
    await expect(installBot({ ...manifest, id: 'other', username: 'not valid' }, [], storage)).rejects.toThrow(BotInstallError);
    await expect(installBot({ ...manifest, version: undefined }, [], storage)).rejects.toThrow(BotInstallError);
  });

  it('filters out unknown permissions at install time (deny by default)', async () => {
    const installed = await installBot(manifest, ['send_messages', 'root' as never], storage);
    expect(installed.grantedPermissions).toEqual(['send_messages']);
  });

  it('uninstalls and toggles enabled state', async () => {
    await installBot(manifest, ['send_messages'], storage);
    await setBotEnabled('echo', false, storage);
    expect((await storage.load()).bots[0].enabled).toBe(false);
    await uninstallBot('echo', storage);
    expect(await storage.load()).toEqual(emptyBotRegistry());
    await expect(setBotEnabled('echo', true, storage)).rejects.toThrow(BotInstallError);
  });

  it('rejects invalid manifests, duplicates and taken usernames (valid case passes)', async () => {
    await expect(installBot({ ...manifest, username: 'bad name' }, [], storage)).rejects.toThrow(BotInstallError);
    await expect(installBot({ ...manifest, username: 'dup_bot', gatewayUrl: undefined, entryPoint: undefined }, [], storage)).rejects.toThrow(BotInstallError);
    const ok = await installBot({ ...manifest, id: 'other', username: 'other_bot' }, [], storage);
    expect(ok.manifest.username).toBe('other_bot');
  });

  it('reports pending consent for newly requested permissions', async () => {
    const installed = await installBot(manifest, ['send_messages'], storage);
    expect(pendingConsent(installed)).toEqual(['inline_keyboard', 'read_messages']);
    await grantAdditionalPermissions('echo', ['inline_keyboard'], storage);
    const registry = await storage.load();
    expect(pendingConsent(registry.bots[0])).toEqual(['read_messages']);
  });
});

describe('EncryptedBotStorage', () => {
  it('persists through the encrypted settings store and drops corrupt rows', async () => {
    const backing = new Map<string, unknown>();
    const store = {
      async saveSetting(key: string, value: unknown) {
        backing.set(key, value);
      },
      async loadSetting<T>(key: string): Promise<T | null> {
        return (backing.get(key) as T) ?? null;
      },
    };
    const storage = new EncryptedBotStorage(store);
    await installBot(manifest, ['send_messages'], storage);
    expect(backing.has('nova_bots_registry_v1')).toBe(true);

    // Corrupt the manifest of one row; load() must drop only that row.
    const raw = backing.get('nova_bots_registry_v1') as { bots: InstalledBot[] };
    raw.bots.push({
      manifest: { ...manifest, id: 'evil', username: 'not-a-bot-name' } as unknown as BotManifest,
      grantedPermissions: ['root' as never],
      installedAt: 0,
      enabled: true,
    });
    const reloaded = await new EncryptedBotStorage(store).load();
    expect(reloaded.bots).toHaveLength(1);
    expect(reloaded.bots[0].manifest.id).toBe('echo');
  });

  it('returns an empty registry on storage failure', async () => {
    const store = {
      async saveSetting(): Promise<void> {
        throw new Error('disk full');
      },
      async loadSetting<T>(): Promise<T | null> {
        throw new Error('io error');
      },
    };
    const storage = new EncryptedBotStorage(store);
    expect(await storage.load()).toEqual(emptyBotRegistry());
    await expect(installBot(manifest, [], storage)).rejects.toThrow();
  });
});

describe('BotRuntime permission gate', () => {
  it('blocks sendMessage without send_messages permission', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(makeInstalledBot({ grantedPermissions: [] }), sink, new InMemoryBotStorage());
    const ctx = runtime.createContext();
    await expect(ctx.sendMessage('chat1', 'hi')).rejects.toThrow('lacks permission: send_messages');
    expect(sink.sent).toHaveLength(0);
  });

  it('allows sendMessage with permission and delivers to the sink', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage());
    const ctx = runtime.createContext();
    const sent = await ctx.sendMessage('chat1', 'hello from bot');
    expect(sink.sent).toHaveLength(1);
    expect(sent.text).toBe('hello from bot');
    expect(sent.messageId).toMatch(/^bot_echo_/);
  });

  it('blocks inline keyboards without inline_keyboard permission', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(
      makeInstalledBot({ grantedPermissions: ['send_messages'] }),
      sink,
      new InMemoryBotStorage(),
    );
    const ctx = runtime.createContext();
    await expect(
      ctx.sendMessage('chat1', 'hi', { keyboard: [[{ text: 'a', callback_data: 'x' }]] }),
    ).rejects.toThrow('lacks permission: inline_keyboard');

    const allowed = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage()).createContext();
    await allowed.sendMessage('chat1', 'hi', { keyboard: [[{ text: 'a', callback_data: 'x' }]] });
    expect(sink.sent).toHaveLength(1);
  });

  it('rejects invalid keyboards and overlong text', async () => {
    const sink = makeSink();
    const ctx = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage()).createContext();
    await expect(ctx.sendMessage('c', 'x'.repeat(4097))).rejects.toThrow();
    await expect(ctx.sendMessage('c', 'hi', { keyboard: [[{ text: '', callback_data: 'x' }]] })).rejects.toThrow();
    await expect(
      ctx.sendMessage('c', 'hi', { keyboard: [[{ text: 'a', callback_data: 'x', url: 'https://e.com' }]] }),
    ).rejects.toThrow();
  });

  it('setCommands persists commands and validates input', async () => {
    const storage = new InMemoryBotStorage();
    await installBot(manifest, ['send_messages'], storage);
    const ctx = new BotRuntime(makeInstalledBot(), makeSink(), storage).createContext();
    await ctx.setCommands([{ command: 'HELP', description: 'Show help' }]);
    const registry = await storage.load();
    expect(registry.bots[0].manifest.commands[0].command).toBe('help');

    const failing = new BotRuntime(makeInstalledBot(), makeSink(), new InMemoryBotStorage()).createContext();
    await expect(failing.setCommands([{ command: 'has space', description: 'x' }])).rejects.toThrow();
    const okRuntime = new BotRuntime(makeInstalledBot(), makeSink(), storage);
    await okRuntime.createContext().setCommands([{ command: 'UPPER_OK', description: 'x' }]);
    expect((await storage.load()).bots[0].manifest.commands[0].command).toBe('upper_ok');
  });
});

describe('update delivery', () => {
  it('delivers updates to the registered handler only when enabled', async () => {
    const sink = makeSink();
    const bot = makeInstalledBot();
    const runtime = new BotRuntime(bot, sink, new InMemoryBotStorage());
    const ctx = runtime.createContext();
    const received: BotUpdate[] = [];
    ctx.onUpdate((u) => {
      received.push(u);
      return Promise.resolve();
    });

    expect(await runtime.deliverUpdate(makeMessageUpdate())).toBe(true);
    expect(received).toHaveLength(1);

    bot.enabled = false;
    expect(await runtime.deliverUpdate(makeMessageUpdate())).toBe(false);
  });

  it('drops updates for bots with no handler', async () => {
    const runtime = new BotRuntime(makeInstalledBot(), makeSink(), new InMemoryBotStorage());
    expect(await runtime.deliverUpdate(makeMessageUpdate())).toBe(false);
  });

  it('mention-only bots receive only commands and mentions', async () => {
    const runtime = new BotRuntime(
      makeInstalledBot({ grantedPermissions: ['read_messages', 'mention_only'] }),
      makeSink(),
      new InMemoryBotStorage(),
    );
    const ctx = runtime.createContext();
    const received: BotUpdate[] = [];
    ctx.onUpdate((u) => {
      received.push(u);
      return Promise.resolve();
    });

    expect(await runtime.deliverUpdate(makeMessageUpdate({ text: 'plain chat' }))).toBe(false);
    expect(await runtime.deliverUpdate(makeMessageUpdate({ text: '/start', isCommand: true }))).toBe(true);
    expect(await runtime.deliverUpdate(makeMessageUpdate({ text: 'hey @echo_bot', mentionsBot: true }))).toBe(true);
    expect(
      await runtime.deliverUpdate({
        type: 'callback_query',
        payload: { id: 'q1', chat: { id: 'chat1', kind: 'direct' }, messageId: 'm1', data: 'x', from: 'fp', timestamp: 0 },
      }),
    ).toBe(true);
    expect(received).toHaveLength(3);
  });

  it('dispatchUpdate routes to the right bot', async () => {
    const storage = new InMemoryBotStorage();
    const bot = makeInstalledBot();
    await storage.save({ bots: [bot] });
    const runtimes = createRuntimes(await storage.load(), makeSink(), storage);
    const ctx = runtimes.get('echo')!.createContext();
    const received: BotUpdate[] = [];
    ctx.onUpdate((u) => {
      received.push(u);
      return Promise.resolve();
    });

    expect(await dispatchUpdate(runtimes, 'unknown', makeMessageUpdate())).toBe(false);
    expect(await dispatchUpdate(runtimes, 'echo', makeMessageUpdate())).toBe(true);
    expect(received).toHaveLength(1);
  });
});

describe('BotRuntime resilience', () => {
  it('calls all registered onUpdate handlers (no overwrite)', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage());
    const ctx = runtime.createContext();
    const a: BotUpdate[] = [];
    const b: BotUpdate[] = [];
    ctx.onUpdate((u) => { a.push(u); });
    ctx.onUpdate((u) => { b.push(u); });

    await runtime.deliverUpdate(makeMessageUpdate());
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('isolates handler errors: one throwing handler does not break others', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage());
    const ctx = runtime.createContext();
    const ok: BotUpdate[] = [];
    ctx.onUpdate((u) => { ok.push(u); });
    ctx.onUpdate(() => { throw new Error('boom'); });

    const result = await runtime.deliverUpdate(makeMessageUpdate());
    expect(result).toBe(true);
    expect(ok).toHaveLength(1);
  });

  it('rate limits sendMessage per bot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const sink = makeSink();
      const runtime = new BotRuntime(makeInstalledBot(), sink, new InMemoryBotStorage());
      const ctx = runtime.createContext();
      // 20 allowed, then rate-limited. Time is frozen so all calls share one
      // Date.now() slot.
      for (let i = 0; i < 20; i++) {
        await ctx.sendMessage('c', `msg ${i}`);
      }
      expect(sink.sent).toHaveLength(20);
      await expect(ctx.sendMessage('c', 'one too many')).rejects.toThrow('rate limit exceeded');
      expect(sink.sent).toHaveLength(20);
    } finally {
      vi.useRealTimers();
    }
  });
});
