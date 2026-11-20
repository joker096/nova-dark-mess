import { describe, expect, it, vi } from 'vitest';
import { movieCatalogBotManifest } from '../../../examples/bots/movie-catalog/manifest';
import { BotRuntime, InMemoryBotStorage, type InstalledBot, type MessageSink } from './runtime';
import type { BotOutgoingMessage, BotUpdate } from './types';

function makeSink(): MessageSink & { sent: BotOutgoingMessage[]; edited: string[] } {
  return {
    sent: [],
    edited: [],
    async send(message) {
      this.sent.push(message);
    },
    async edit(edit) {
      this.edited.push(edit.text);
      return true;
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
      chat: { id: 'chat_movies', kind: 'direct' },
      text,
      command: name,
      isCommand: true,
      mentionsBot: true,
      from: 'fp_movie_fan',
      timestamp: Date.now(),
    },
  };
}

function setup() {
  const sink = makeSink();
  const installed: InstalledBot = {
    manifest: movieCatalogBotManifest,
    grantedPermissions: [...movieCatalogBotManifest.requestedPermissions],
    installedAt: Date.now(),
    enabled: true,
  };
  const runtime = new BotRuntime(installed, sink, new InMemoryBotStorage());
  return { sink, runtime };
}

describe('Movie Catalog bot', () => {
  it('loads its bundled module and answers /start', async () => {
    const { sink, runtime } = setup();
    await runtime.loadModule();

    expect(await runtime.deliverUpdate(command('/start', 'start'))).toBe(true);
    await vi.waitFor(() => {
      expect(sink.sent.length).toBeGreaterThan(0);
    });
    expect(sink.sent[0].text).toContain('Movie');
    expect(sink.sent[0].keyboard?.length).toBeGreaterThan(0);
  });

  it('renders a FAQ answer for a faq_q callback', async () => {
    const { sink, runtime } = setup();
    await runtime.loadModule();

    const delivered = await runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: 'cb_faq',
        chat: { id: 'chat_movies', kind: 'direct' },
        messageId: 'm_faq',
        data: 'faq_q:getting_started:0',
        from: 'fp_movie_fan',
        timestamp: Date.now(),
        language: 'ru',
      },
    } as BotUpdate);

    expect(delivered).toBe(true);
    await vi.waitFor(() => {
      expect(sink.edited.length).toBeGreaterThan(0);
    });
    expect(sink.edited[0]).toContain('Question 1/');
  });
});
