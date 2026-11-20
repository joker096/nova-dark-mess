import { beforeEach, describe, expect, it } from 'vitest';
import novafatherBot from '../../../examples/bots/novafather';
import { novafatherManifest } from '../../../examples/bots/novafather/manifest';
import {
  BotRuntime,
  InMemoryBotStorage,
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

describe('NovaFather system bot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('answers /start with its main menu keyboard', async () => {
    const sink = makeSink();
    const installed: InstalledBot = {
      manifest: novafatherManifest,
      grantedPermissions: [...novafatherManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const runtime = new BotRuntime(installed, sink, new InMemoryBotStorage());
    await novafatherBot.init(runtime.createContext());

    expect(await runtime.deliverUpdate(command('/start', 'start'))).toBe(true);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0].text).toContain('Welcome to NovaFather');
    expect(sink.sent[0].keyboard?.length).toBeGreaterThan(0);
  });

  it('reports an empty bot list before /newbot creates one', async () => {
    const sink = makeSink();
    const installed: InstalledBot = {
      manifest: novafatherManifest,
      grantedPermissions: [...novafatherManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const runtime = new BotRuntime(installed, sink, new InMemoryBotStorage());
    await novafatherBot.init(runtime.createContext());

    expect(await runtime.deliverUpdate(command('/mybots', 'mybots'))).toBe(true);
    expect(sink.sent[0].text).toContain('no bots yet');
  });
});
