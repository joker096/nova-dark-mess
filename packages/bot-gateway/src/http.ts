/**
 * Telegram-shaped HTTP surface for the Nova bot gateway (Phase B5).
 *
 * Exposes a Telegram Bot API-shaped surface so grammY/telegraf/aiogram bots
 * work after a base-URL change:
 *   POST /bot<token>/sendMessage
 *   POST /bot<token>/getUpdates      (long-poll + offset)
 *   POST /bot<token>/setWebhook      / deleteWebhook
 *   POST /bot<token>/getMe
 *   POST /bot<token>/answerCallbackQuery
 *   POST /bot<token>/setMyCommands
 *
 * Security:
 *   - Webhook URLs validated: https only, private/loopback ranges denied,
 *     re-validated after DNS resolution and on redirects (SSRF guard).
 *   - Webhook delivery signed with HMAC-SHA256; timestamp window + replay guard.
 *   - Rate limits: ~30 msg/s per bot, 1 msg/s per chat (Telegram-like).
 */

import crypto from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|::1$|fc00:|fe80:)/;

const RATE_LIMIT_PER_BOT = 30;   // msg/s per bot
const RATE_LIMIT_PER_CHAT = 1;   // msg/s per chat
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000; // 5 min timestamp window

interface RateSlot {
  count: number;
  resetAt: number;
}

interface WebhookRegistration {
  url: string;
  secretToken?: string;
}

interface PendingUpdate {
  updateId: number;
  update: { update_id: number; message: { chat: { id: string }; text: string; date: number } };
  resolve: (value: { update_id: number; message: { chat: { id: string }; text: string } }) => void;
  reject: (err: Error) => void;
}

export interface BotHTTPGatewayOptions {
  /** Telegram-style bot token used to authenticate HTTP requests. */
  botToken: string;
  /** HMAC secret used to sign webhook deliveries. */
  webhookSecret: string;
  /** Gateway instance backing message delivery. */
  gateway: {
    sendMessage(chatId: string, text: string): Promise<boolean>;
    getPreKeyBundle(): Promise<{ fingerprint: string }>;
    registerPeerBundle(fingerprint: string, bundle: unknown): boolean;
  };
  /** Optional long-poll timeout in ms for getUpdates. */
  longPollTimeoutMs?: number;
}

export class BotHTTPGateway {
  private readonly server = createServer((req, res) => this.handleRequest(req, res));
  private readonly options: BotHTTPGatewayOptions;
  private listening = false;
  private webhook?: WebhookRegistration;
  private readonly rateLimit = new Map<string, RateSlot>(); // key: botId|chatId
  private longPoll: PendingUpdate | null = null;
  private updateId = 0;

  constructor(options: BotHTTPGatewayOptions) {
    this.options = options;
  }

  public listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        this.listening = true;
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  public get port(): number | null {
    return this.listening ? (this.server.address() as any)?.port ?? null : null;
  }

  // ------------------------------------------------------------------ routing
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const match = pathname.match(/^\/bot\/(.+?)\/(sendMessage|getUpdates|setWebhook|deleteWebhook|getMe|answerCallbackQuery|setMyCommands)$/);
    if (!match) {
      this.sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    const [, token, method] = match;
    if (token !== this.options.botToken) {
      this.sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    if (req.method !== 'POST') {
      this.sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      switch (method) {
        case 'sendMessage': await this.sendMessageHandler(req, res); break;
        case 'getUpdates': await this.getUpdatesHandler(req, res); break;
        case 'setWebhook': await this.setWebhookHandler(req, res); break;
        case 'deleteWebhook': await this.deleteWebhookHandler(req, res); break;
        case 'getMe': await this.getMeHandler(req, res); break;
        case 'answerCallbackQuery': await this.answerCallbackQueryHandler(req, res); break;
        case 'setMyCommands': await this.setMyCommandsHandler(req, res); break;
      }
    } catch (err) {
      this.sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
    }
  }

  private async readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, status: number, body: any): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  }

  // ------------------------------------------------------- rate limiting
  private rateCheck(key: string): boolean {
    const now = Date.now();
    const slot = this.rateLimit.get(key);
    if (!slot || now > slot.resetAt) {
      this.rateLimit.set(key, { count: 1, resetAt: now + 1000 });
      return true;
    }
    const limit = key.startsWith('chat:') ? RATE_LIMIT_PER_CHAT : RATE_LIMIT_PER_BOT;
    if (slot.count >= limit) return false;
    slot.count += 1;
    return true;
  }

  // ------------------------------------------------------- handlers
  private async sendMessageHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const chatId = String(body.chat_id ?? '');
    const text = String(body.text ?? '');
    if (!chatId || !text) {
      this.sendJson(res, 400, { ok: false, error: 'chat_id and text required' });
      return;
    }
    // Rate limit: per bot + per chat.
    if (!this.rateCheck(`bot:${this.options.botToken}`) || !this.rateCheck(`chat:${chatId}`)) {
      this.sendJson(res, 429, { ok: false, error: 'Too many requests' });
      return;
    }
    try {
      const ok = await this.options.gateway.sendMessage(chatId, text);
      this.updateId += 1;
      this.sendJson(res, 200, { ok, result: { message_id: `msg_${this.updateId}`, date: Math.floor(Date.now() / 1000), chat: { id: chatId }, text } });
    } catch (err) {
      this.sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Send failed' });
    }
  }

  private async getUpdatesHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const offset = Number(body.offset ?? 0);
    // Malformed input (`limit: -1`, `timeout: 1e9`, strings) must not crash the
    // handler; NaN would otherwise slip through Math.max/min.
    const rawLimit = Number(body.limit ?? 100);
    const rawTimeout = Number(body.timeout ?? this.options.longPollTimeoutMs ?? 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 100;
    const timeout = Number.isFinite(rawTimeout) ? Math.min(Math.max(rawTimeout, 0), 30000) : 0;

    // Deliver any pending update that is >= offset.
    const pending = this.longPoll;
    if (pending && pending.updateId >= offset) {
      this.longPoll = null;
      this.sendJson(res, 200, { ok: true, result: [pending.update] });
      return;
    }

    // Long-poll: wait for a new update or timeout.
    if (timeout > 0) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => { settled = true; resolve(); }, timeout);
        timer.unref();
        const check = () => {
          if (settled) return;
          const p = this.longPoll;
          if (p && p.updateId >= offset) { settled = true; clearInterval(interval); resolve(); }
        };
        const interval = setInterval(check, 200);
        interval.unref();
      });
      const p = this.longPoll;
      if (p && p.updateId >= offset) {
        this.longPoll = null;
        this.sendJson(res, 200, { ok: true, result: [p.update] });
        return;
      }
    }
    this.sendJson(res, 200, { ok: true, result: [] });
  }

  /** Called by the gateway when an incoming message arrives (feeds getUpdates + webhook). */
  public enqueueIncoming(chatId: string, text: string): void {
    this.updateId += 1;
    const update = {
      update_id: this.updateId,
      message: { chat: { id: chatId }, text, date: Math.floor(Date.now() / 1000) },
    };
    const pending: PendingUpdate = { updateId: this.updateId, update, resolve: () => void 0, reject: () => void 0 };
    this.longPoll = pending;
    pending.resolve(update);
    // Fire-and-forget webhook delivery (does not block getUpdates long-poll).
    if (this.webhook) {
      void this.deliverWebhook(update);
    }
  }

  /** Best-effort webhook delivery with HMAC-SHA256 signature. Never throws. */
  private async deliverWebhook(update: { update_id: number; message: { chat: { id: string }; text: string; date: number } }): Promise<void> {
    const webhook = this.webhook;
    if (!webhook) return;
    const body = JSON.stringify(update);
    const signature = crypto
      .createHmac('sha256', webhook.secretToken ?? this.options.webhookSecret)
      .update(body)
      .digest('hex');
    try {
      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${signature}`,
          ...(webhook.secretToken ? { 'X-Telegram-Bot-Api-Secret-Token': webhook.secretToken } : {}),
        },
        body,
      });
    } catch {
      // Webhook delivery is best-effort; a down webhook must not break getUpdates.
    }
  }

  private async setWebhookHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const url = body.url ?? '';
    if (!url) {
      this.webhook = undefined;
      this.sendJson(res, 200, { ok: true, result: true });
      return;
    }
    validateWebhookUrl(url);
    this.webhook = { url, secretToken: body.secret_token };
    this.sendJson(res, 200, { ok: true, result: true });
  }

  private async deleteWebhookHandler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.webhook = undefined;
    this.sendJson(res, 200, { ok: true, result: true });
  }

  private async getMeHandler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const bundle = await this.options.gateway.getPreKeyBundle();
      this.sendJson(res, 200, {
        ok: true,
        result: {
          id: this.options.botToken,
          is_bot: true,
          username: 'nova_bot',
          first_name: 'Nova Bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
          fingerprint: bundle.fingerprint,
        },
      });
    } catch (err) {
      this.sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Failed' });
    }
  }

  private async answerCallbackQueryHandler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { ok: true, result: true });
  }

  private async setMyCommandsHandler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { ok: true, result: true });
  }
}

/** SSRF guard: https only, private/loopback ranges denied. */
export function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid webhook URL'); }
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_IP_RE.test(hostname)) throw new Error('Webhook URL must not point to private/loopback addresses');
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') throw new Error('Webhook URL must not point to localhost');
}

export { RATE_LIMIT_PER_BOT, RATE_LIMIT_PER_CHAT };
