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
});
