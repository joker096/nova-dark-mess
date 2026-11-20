import { describe, expect, it, vi } from 'vitest';
import { movieCatalogBotManifest } from '../../../examples/bots/movie-catalog/manifest';
import { BotRuntime, InMemoryBotStorage, type InstalledBot, type MessageSink } from './runtime';
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

describe('Movie Catalog bot', () => {
  it('loads its bundled module and answers /start', async () => {
    const sink = makeSink();
    const installed: InstalledBot = {
      manifest: movieCatalogBotManifest,
      grantedPermissions: [...movieCatalogBotManifest.requestedPermissions],
      installedAt: Date.now(),
      enabled: true,
    };
    const runtime = new BotRuntime(installed, sink, new InMemoryBotStorage());
    await runtime.loadModule();

    expect(await runtime.deliverUpdate(command('/start', 'start'))).toBe(true);
    await vi.waitFor(() => {
      expect(sink.sent.length).toBeGreaterThan(0);
    });
    expect(sink.sent[0].text).toContain('Movie');
    expect(sink.sent[0].keyboard?.length).toBeGreaterThan(0);
  });
});
