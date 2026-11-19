/**
 * HTTP MessageSink for L2/L3 bots (docs/bots-roadmap.md §B4/B5).
 *
 * A bot whose manifest carries a `gatewayUrl` (set via NovaFather
 * `/setgateway`) is reachable over HTTP instead of the local in-process
 * sink. This sink forwards `send`/`edit`/`del`/`answerCallback` to the
 * gateway's store-and-forward surface so the client can talk to a bot that
 * lives outside this device (WebRTC relay / HTTP relay).
 *
 * Endpoints (all relative to gatewayUrl, trailing slash optional):
 *   POST   {gatewayUrl}/messages        body: { messageId, chatId, text, timestamp, keyboard? }
 *   PATCH  {gatewayUrl}/messages/:id    body: { text, keyboard? }
 *   DELETE {gatewayUrl}/messages/:id
 *   POST   {gatewayUrl}/callback        body: { queryId, text?, showAlert? }
 *
 * Failures are surfaced as rejected promises so the bot runtime can report
 * PermissionDenied/transport errors back to the module.
 */

import type { MessageSink } from './runtime';
import type { AnswerCallbackQueryOptions, BotMessageEdit, BotOutgoingMessage } from './types';

export interface HttpSinkOptions {
  gatewayUrl: string;
  /** Fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
  /** Timeout in ms for each request. Default 8000. */
  timeoutMs?: number;
}

export class HttpMessageSink implements MessageSink {
  private readonly base: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor({ gatewayUrl, fetch: fetchImpl, timeoutMs = 8000 }: HttpSinkOptions) {
    this.base = gatewayUrl.endsWith('/') ? gatewayUrl.slice(0, -1) : gatewayUrl;
    this.fetch = fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.timeoutMs = timeoutMs;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  public async send(message: BotOutgoingMessage): Promise<void> {
    const res = await this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({
        messageId: message.messageId,
        chatId: message.chat.id,
        text: message.text,
        timestamp: message.timestamp,
        keyboard: message.keyboard,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gateway send failed: ${res.status} ${body}`);
    }
  }

  public async edit(edit: BotMessageEdit): Promise<boolean> {
    const res = await this.request(`/messages/${encodeURIComponent(edit.messageId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ text: edit.text, keyboard: edit.keyboard }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gateway edit failed: ${res.status} ${body}`);
    }
    return true;
  }

  public async del(chatId: string, messageId: string): Promise<boolean> {
    const res = await this.request(`/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gateway delete failed: ${res.status} ${body}`);
    }
    return true;
  }

  public async answerCallback(queryId: string, options?: AnswerCallbackQueryOptions): Promise<void> {
    const res = await this.request('/callback', {
      method: 'POST',
      body: JSON.stringify({ queryId, ...options }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gateway answerCallback failed: ${res.status} ${body}`);
    }
  }
}

/**
 * Builds a MessageSink for a bot. When the bot has a `gatewayUrl` (L2/L3),
 * returns an HttpMessageSink that forwards to the gateway; otherwise returns
 * a no-op local sink so the caller can layer its own UI rendering on top.
 */
export function makeBotSink(bot: {
  manifest: { gatewayUrl?: string };
}): MessageSink {
  const gatewayUrl = bot.manifest.gatewayUrl;
  if (gatewayUrl) {
    return new HttpMessageSink({ gatewayUrl });
  }
  // Local (L1) sink: the host (ChatScreen) overrides send/edit/del to render
  // into the transcript. Return a no-op sink that does nothing by itself.
  return {
    send: async () => void 0,
    edit: async () => false,
    del: async () => false,
    answerCallback: async () => void 0,
  };
}
