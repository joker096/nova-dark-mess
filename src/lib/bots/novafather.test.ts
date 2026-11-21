import { beforeEach, describe, expect, it, vi } from 'vitest';
import novafatherBot from '../../../examples/bots/novafather';
import { novafatherManifest } from '../../../examples/bots/novafather/manifest';
import { echoBotManifest } from '../../../examples/bots/echo/manifest';
import {
  BotRuntime,
  InMemoryBotStorage,
  type BotAdminApi,
  type InstalledBot,
  type MessageSink,
} from './runtime';
import type { BotOutgoingMessage, BotUpdate } from './types';

function makeSink(): MessageSink & { sent: BotOutgoingMessage[] } {
  return {
    sent: [],
    async send(message) {
      this.sent.push(message);
    },
    async edit() {
      return false;
    },
    async del() {
      return false;
    },
    async answerCallback() {
      /* no-op */
    },
    async sendTyping() {
      /* no-op */
    },
  };
}

function command(text: string, name: string): BotUpdate {
  return {
    type: 'message',
    payload: {
      messageId: `m_${name}`,
      chat: { id: 'chat_novafather', kind: 'direct' },
      text,
      command: name,
      isCommand: true,
      mentionsBot: true,
      from: 'fp_owner',
      timestamp: Date.now(),
    },
  };
}

function setup(bots: InstalledBot[] = []) {
  const sink = makeSink();
  const installed: InstalledBot = {
    manifest: novafatherManifest,
    grantedPermissions: [...novafatherManifest.requestedPermissions],
    installedAt: Date.now(),
    enabled: true,
  };
  const admin = {
    listBots: vi.fn(() => bots),
    installBot: vi.fn(),
    setBotEnabled: vi.fn(async (botId: string, enabled: boolean) => {
      const bot = bots.find((b) => b.manifest.id === botId);
      if (bot) bot.enabled = enabled;
    }),
    installBotFromDraft: vi.fn() as unknown as BotAdminApi['installBotFromDraft'],
    setGatewayUrl: vi.fn(async () => {}) as BotAdminApi['setGatewayUrl'],
    setPeerFingerprint: vi.fn(async () => {}) as BotAdminApi['setPeerFingerprint'],
    setBotCommands: vi.fn(async () => {}) as BotAdminApi['setBotCommands'],
    setBotDescription: vi.fn(async () => {}) as BotAdminApi['setBotDescription'],
    uninstallBot: vi.fn(async (botId: string) => {
      const index = bots.findIndex((b) => b.manifest.id === botId);
      if (index >= 0) bots.splice(index, 1);
    }),
  } satisfies BotAdminApi;
  const runtime = new BotRuntime(installed, sink, new InMemoryBotStorage(), admin);
  return { sink, runtime, admin };
}

describe('NovaFather system bot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('answers /start with its main menu keyboard', async () => {
    const { sink, runtime } = setup();
    await novafatherBot.init(runtime.createContext());

    expect(await runtime.deliverUpdate(command('/start', 'start'))).toBe(true);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0].text).toContain('Welcome to NovaFather');
    expect(sink.sent[0].keyboard?.length).toBeGreaterThan(0);
  });

  it('reports an empty installed-bot list', async () => {
    const { sink, runtime } = setup();
    await novafatherBot.init(runtime.createContext());

    expect(await runtime.deliverUpdate(command('/mybots', 'mybots'))).toBe(true);
    expect(sink.sent[0].text).toContain('No bots are installed');
  });

  it('lists installed bots and toggles one through the admin API', async () => {
    const echo: InstalledBot = {
      manifest: echoBotManifest,
      grantedPermissions: [...echoBotManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const { sink, runtime, admin } = setup([echo]);
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/mybots', 'mybots'));
    expect(sink.sent[0].text).toContain('My Bots</b> (1)');

    await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_toggle',
        chat: { id: 'chat_novafather', kind: 'direct' },
        messageId: 'm_list',
        data: 'toggle:echo',
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });

    expect(admin.setBotEnabled).toHaveBeenCalledWith('echo', false);
  });

  it('sets a gateway URL through the admin API', async () => {
    const echo: InstalledBot = {
      manifest: echoBotManifest,
      grantedPermissions: [...echoBotManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const { sink, runtime, admin } = setup([echo]);
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/mybots', 'mybots'));
    await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_gateway',
        chat: { id: 'chat_novafather', kind: 'direct' },
        messageId: 'm_list',
        data: 'gateway:echo',
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });
    await runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: 'm_gateway_url',
        chat: { id: 'chat_novafather', kind: 'direct' },
        text: 'https://gateway.example.com',
        isCommand: false,
        mentionsBot: false,
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });

    expect(admin.setGatewayUrl).toHaveBeenCalledWith('echo', 'https://gateway.example.com');
    expect(sink.sent.some((m) => m.text.includes('Gateway URL set'))).toBe(true);
  });

  it('sets a gateway bot peer fingerprint through the admin API', async () => {
    const echo: InstalledBot = {
      manifest: echoBotManifest,
      grantedPermissions: [...echoBotManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const { sink, runtime, admin } = setup([echo]);
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/mybots', 'mybots'));
    await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_peer',
        chat: { id: 'chat_novafather', kind: 'direct' },
        messageId: 'm_list',
        data: 'peer:echo',
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });
    await runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: 'm_peer_fp',
        chat: { id: 'chat_novafather', kind: 'direct' },
        text: 'gw_fp_0001',
        isCommand: false,
        mentionsBot: false,
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });

    expect(admin.setPeerFingerprint).toHaveBeenCalledWith('echo', 'gw_fp_0001');
    expect(sink.sent.some((m) => m.text.includes('Peer fingerprint set'))).toBe(true);
  });

  it('updates a bot command list through the admin API', async () => {
    const echo: InstalledBot = {
      manifest: echoBotManifest,
      grantedPermissions: [...echoBotManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const { runtime, admin } = setup([echo]);
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/mybots', 'mybots'));
    await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_commands',
        chat: { id: 'chat_novafather', kind: 'direct' },
        messageId: 'm_list',
        data: 'commands:echo',
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });
    await runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: 'm_commands',
        chat: { id: 'chat_novafather', kind: 'direct' },
        text: '[{"command":"ping","description":"Ping the bot"}]',
        isCommand: false,
        mentionsBot: false,
        from: 'fp_owner',
        timestamp: Date.now(),
      },
    });

    expect(admin.setBotCommands).toHaveBeenCalledWith('echo', [
      { command: 'ping', description: 'Ping the bot' },
    ]);
  });

  it('installs a drafted bot manifest through /newbot', async () => {
    const installedDrafts: unknown[] = [];
    const { sink, runtime, admin } = setup();
    (admin.installBotFromDraft as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      async (draft: unknown) => {
        installedDrafts.push(draft);
        return {
          manifest: { ...echoBotManifest, id: 'moviebot', username: 'moviebot', name: 'Movie Bot', entryPoint: '/movie' },
          grantedPermissions: ['send_messages'],
          installedAt: Date.now(),
          enabled: true,
        };
      },
    );
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/newbot', 'newbot'));
    expect(sink.sent.at(-1)?.text).toContain('Enter the bot');

    const reply = (text: string) => runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: `m_${text}`, chat: { id: 'chat_novafather', kind: 'direct' }, text,
        isCommand: false, mentionsBot: false, from: 'fp_owner', timestamp: Date.now(),
      },
    });

    await reply('Movie Bot');
    await reply('moviebot');
    await reply('Finds movies');
    await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_perm', chat: { id: 'chat_novafather', kind: 'direct' }, messageId: 'm_perms',
        data: 'perm_toggle:send_messages', from: 'fp_owner', timestamp: Date.now(),
      },
    });
    await reply('/movie');

    expect(installedDrafts).toEqual([{
      entryPoint: '/movie',
      name: 'Movie Bot',
      username: 'moviebot',
      description: 'Finds movies',
      commands: undefined,
      permissions: ['send_messages'],
    }]);
    expect(sink.sent.at(-1)?.text).toContain('Bot installed');
  });

  it('rejects a username the manifest validator would refuse', async () => {
    const { sink, runtime } = setup();
    await novafatherBot.init(runtime.createContext());

    await runtime.deliverUpdate(command('/newbot', 'newbot'));
    await runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: 'm_name', chat: { id: 'chat_novafather', kind: 'direct' }, text: 'Bad Bot',
        isCommand: false, mentionsBot: false, from: 'fp_owner', timestamp: Date.now(),
      },
    });
    await runtime.deliverUpdate({
      type: 'message',
      payload: {
        messageId: 'm_user', chat: { id: 'chat_novafather', kind: 'direct' }, text: 'not_a_bot_name',
        isCommand: false, mentionsBot: false, from: 'fp_owner', timestamp: Date.now(),
      },
    });

    expect(sink.sent.at(-1)?.text).toContain('Invalid username');
  });
});
