import { describe, expect, it } from 'vitest';
import echoBot, { manifest } from './index';
import { echoBotManifest } from './manifest';
import { BotRuntime, InMemoryBotStorage, type MessageSink } from '../../../src/lib/bots/runtime';
import type { BotOutgoingMessage } from '../../../src/lib/bots/types';

function makeSink() {
  const sent: BotOutgoingMessage[] = [];
  const toasts: Array<{ id: string; text?: string }> = [];
  const sink: MessageSink & { sent: BotOutgoingMessage[]; toasts: Array<{ id: string; text?: string }> } = {
    sent,
    toasts,
    async send(message) {
      sent.push(message);
    },
    async edit() {
      return true;
    },
    async del() {
      return true;
    },
    async answerCallback(queryId, options) {
      toasts.push({ id: queryId, text: options?.text });
    },
  };
  return sink;
}

function msg(text: string, overrides: Record<string, unknown> = {}): Parameters<BotRuntime['deliverUpdate']>[0] {
  return {
    type: 'message',
    payload: {
      messageId: `m_${Math.random()}`,
      chat: { id: 'chat1', kind: 'direct' },
      text,
      isCommand: text.startsWith('/'),
      command: text.startsWith('/') ? text.slice(1).split(' ')[0] : undefined,
      mentionsBot: false,
      from: 'fp_user',
      timestamp: Date.now(),
      ...overrides,
    },
  };
}

describe('echo bot example', () => {
  it('has a valid manifest shape', () => {
    expect(manifest.username).toBe('echo_bot');
    expect(manifest.requestedPermissions).toContain('send_messages');
  });

  it('echoes messages and renders /start with a keyboard', async () => {
    const sink = makeSink();
    const runtime = new BotRuntime(
      {
        manifest: echoBotManifest,
        grantedPermissions: ['read_messages', 'send_messages', 'inline_keyboard'],
        installedAt: 0,
        enabled: true,
      },
      sink,
      new InMemoryBotStorage(),
    );
    echoBot.init(runtime.createContext());

    await runtime.deliverUpdate(msg('hello world'));
    await runtime.deliverUpdate(msg('/start'));

    expect(sink.sent.map((m) => m.text)).toEqual(['hello world', 'Press a button — I will echo it back.']);
    expect(sink.sent[1].keyboard).toEqual([
      [{ text: 'Ping', callback_data: 'echo:ping' }],
      [{ text: 'Nova docs', url: 'https://mess.cvr.name/' }],
    ]);
  });
});
