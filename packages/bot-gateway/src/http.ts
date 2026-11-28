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
 *     resolved and checked right before every delivery, then the checked IP is
 *     pinned in the connection lookup (no DNS re-resolution) and redirects are
 *     never followed (SSRF guard).
 *   - Webhook delivery signed with HMAC-SHA256 and an optional secret token.
 *     Replay/timestamp enforcement is the receiver's job.
 *   - Rate limits: ~30 msg/s per bot, 1 msg/s per chat (Telegram-like).
 */

import crypto from 'crypto';
import { lookup } from 'dns/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { isIP } from 'net';
import { Agent } from 'undici';
import { URL } from 'url';

/** Maximum accepted request body size (Telegram payloads are far smaller). */
const MAX_BODY_BYTES = 1024 * 1024;

/** Error carrying the HTTP status the handler should return. */
class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** True for loopback, private, link-local, CGNAT and other non-public IPs. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (version === 6) {
    // Drop an optional zone id (`fe80::1%eth0`) before matching.
    const lower = address.toLowerCase().split('%')[0];
    if (lower === '::' || lower === '::1') return true;
    // Unique-local (fc00::/7), link-local (fe80::/10) and multicast (ff00::/8).
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower)) return true;
    // Documentation (2001:db8::/32, 3fff::/20), discard (100::/64),
    // Teredo (2001::/32), 6to4 (2002::/16) and NAT64 (64:ff9b::/96).
    if (/^2001:0?db8:/.test(lower) || /^3fff:/.test(lower) || /^100:/.test(lower)) return true;
    if (/^2001:0(?::|$)/.test(lower) || /^2001:0000:/.test(lower) || /^2002:/.test(lower)) return true;
    if (/^64:ff9b:/.test(lower)) return true;
    // IPv4-mapped in dotted form: `::ffff:192.168.0.1`.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    // IPv4-mapped/compatible in hex form: `::ffff:7f00:1` (127.0.0.1) and
    // deprecated `::7f00:1`. Without this a webhook URL like
    // https://[::ffff:7f00:1]/ would bypass the guard.
    const hexMapped = lower.match(/^(?:::ffff|0:0:0:0:0:ffff):([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const compatHex = lower.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const hexIpv4 = hexMapped ?? compatHex;
    if (hexIpv4) {
      const high = parseInt(hexIpv4[1], 16);
      const low = parseInt(hexIpv4[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    // IPv4-compatible in dotted form: `::192.168.0.1`.
    const compatDotted = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (compatDotted) return isPrivateAddress(compatDotted[1]);
    return false;
  }
  // Not a literal IP: callers resolve first; treat unknown input as unsafe.
  return true;
}

async function resolveHostname(hostname: string): Promise<string[]> {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
}

/**
 * Dispatcher whose DNS lookup always answers with the address that already
 * passed the SSRF guard. The socket therefore connects to the checked IP even
 * if the name re-resolves in between (TOCTOU), while SNI still comes from the
 * URL hostname so certificate validation is unaffected.
 */
function pinnedDispatcher(targets: Array<{ address: string; family: 4 | 6 }>): Agent {
  return new Agent({
    connect: {
      lookup(
        _hostname: string,
        options: { all?: boolean } | undefined,
        callback: (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
      ) {
        if (options && options.all) callback(null, targets);
        else callback(null, targets[0].address, targets[0].family);
      },
    },
  });
}

/** Release the response body so undici can close the connection. */
async function drainResponse(response: Response | undefined): Promise<void> {
  if (response && typeof response.arrayBuffer === 'function') await response.arrayBuffer();
}

const RATE_LIMIT_PER_BOT = 30;   // msg/s per bot
const RATE_LIMIT_PER_CHAT = 1;   // msg/s per chat
const WEBHOOK_MAX_ATTEMPTS = 3;

interface RateSlot {
  count: number;
  resetAt: number;
}

interface WebhookRegistration {
  url: string;
  secretToken?: string;
}

type IncomingUpdate = { update_id: number; message: { chat: { id: string }; text: string; date: number } };

interface PendingUpdate {
  updateId: number;
  update: IncomingUpdate;
}

/** Cap the offline queue so a busy chat cannot exhaust gateway memory. */
const MAX_PENDING_UPDATES = 1000;

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
  /** DNS resolver override (tests pass a stub; production uses dns.lookup). */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export class BotHTTPGateway {
  private readonly server = createServer((req, res) => this.handleRequest(req, res));
  private readonly options: BotHTTPGatewayOptions;
  private listening = false;
  private webhook?: WebhookRegistration;
  private readonly rateLimit = new Map<string, RateSlot>(); // key: botId|chatId
  private pendingUpdates: PendingUpdate[] = [];
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
    if (!tokenMatches(token, this.options.botToken)) {
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
      const status = err instanceof HttpError ? err.status : 500;
      this.sendJson(res, status, { ok: false, error: err instanceof Error ? err.message : 'Internal error' });
    }
  }

  private async readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      let bytes = 0;
      let aborted = false;
      req.on('data', (chunk: Buffer | string) => {
        if (aborted) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BODY_BYTES) {
          aborted = true;
          // Stop reading and surface a client error instead of buffering
          // unbounded input (memory-exhaustion DoS). The handler still writes
          // the 413 response; `aborted` swallows any later end/error events.
          req.pause();
          reject(new HttpError(413, 'Request body too large'));
          return;
        }
        data += chunk;
      });
      req.on('end', () => {
        if (aborted) return;
        try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); }
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
      this.pruneRateLimit(now);
      return true;
    }
    const limit = key.startsWith('chat:') ? RATE_LIMIT_PER_CHAT : RATE_LIMIT_PER_BOT;
    if (slot.count >= limit) return false;
    slot.count += 1;
    return true;
  }

  /** Drop expired slots so a stream of distinct chat ids cannot grow forever. */
  private pruneRateLimit(now: number): void {
    if (this.rateLimit.size < 10_000) return;
    for (const [key, slot] of this.rateLimit) {
      if (now > slot.resetAt) this.rateLimit.delete(key);
    }
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
    // Rate limit: per bot + per chat. The bot key is constant: never put the
    // bearer token into a map key that may be logged or dumped.
    if (!this.rateCheck('bot') || !this.rateCheck(`chat:${chatId}`)) {
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

  /** Remove and return pending updates with `updateId >= offset`, up to `limit`. */
  private takeUpdates(offset: number, limit: number): IncomingUpdate[] | null {
    const ready = this.pendingUpdates.filter((p) => p.updateId >= offset);
    if (ready.length === 0) return null;
    const taken = ready.slice(0, limit);
    const takenIds = new Set(taken.map((p) => p.updateId));
    this.pendingUpdates = this.pendingUpdates.filter((p) => !takenIds.has(p.updateId));
    return taken.map((p) => p.update);
  }

  private async getUpdatesHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const rawOffset = Number(body.offset ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    // Malformed input (`timeout: 1e9`, strings) must not crash the handler;
    // NaN would otherwise slip through Math.max/min.
    const rawTimeout = Number(body.timeout ?? this.options.longPollTimeoutMs ?? 0);
    const timeout = Number.isFinite(rawTimeout) ? Math.min(Math.max(rawTimeout, 0), 30000) : 0;
    const rawLimit = Number(body.limit ?? 100);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 100;

    // Deliver every pending update that is >= offset; a single slot used to
    // drop all but the last message when several arrived between polls.
    const ready = this.takeUpdates(offset, limit);
    if (ready) {
      this.sendJson(res, 200, { ok: true, result: ready });
      return;
    }

    // Long-poll: wait for new updates or timeout.
    if (timeout > 0) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Math.min(200, deadline - Date.now()));
          timer.unref();
        });
        const arrived = this.takeUpdates(offset, limit);
        if (arrived) {
          this.sendJson(res, 200, { ok: true, result: arrived });
          return;
        }
      }
    }
    this.sendJson(res, 200, { ok: true, result: [] });
  }

  /** Called by the gateway when an incoming message arrives (feeds getUpdates + webhook). */
  public enqueueIncoming(chatId: string, text: string): void {
    this.updateId += 1;
    const update: IncomingUpdate = {
      update_id: this.updateId,
      message: { chat: { id: chatId }, text, date: Math.floor(Date.now() / 1000) },
    };
    this.pendingUpdates.push({ updateId: this.updateId, update });
    if (this.pendingUpdates.length > MAX_PENDING_UPDATES) {
      // Drop the oldest, like Telegram does when a bot stops polling.
      this.pendingUpdates.splice(0, this.pendingUpdates.length - MAX_PENDING_UPDATES);
    }
    // Fire-and-forget webhook delivery (does not block getUpdates long-poll).
    if (this.webhook) {
      void this.deliverWebhook(update);
    }
  }

  /** Best-effort webhook delivery with HMAC-SHA256 signature. Never throws. */
  private async deliverWebhook(update: IncomingUpdate): Promise<void> {
    const webhook = this.webhook;
    if (!webhook) return;
    const body = JSON.stringify(update);
    const signature = crypto
      .createHmac('sha256', webhook.secretToken ?? this.options.webhookSecret)
      .update(body)
      .digest('hex');
    for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
      let dispatcher: Agent | undefined;
      try {
        // Re-check on every attempt (DNS can change after registration) and pin
        // the address that passed the check into the connection lookup.
        const targets = await resolveWebhookTargets(webhook.url, this.options.resolveHost ?? resolveHostname);
        dispatcher = pinnedDispatcher(targets);
        const response = await fetch(webhook.url, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': `sha256=${signature}`,
            ...(webhook.secretToken ? { 'X-Telegram-Bot-Api-Secret-Token': webhook.secretToken } : {}),
          },
          body,
          dispatcher,
        } as RequestInit);
        await drainResponse(response);
        // 2xx delivered; 3xx is not followed and 4xx will not improve on retry.
        if (response.ok || (response.status >= 300 && response.status < 500)) return;
      } catch {
        // Network/DNS failure: retry below.
      } finally {
        if (dispatcher) await dispatcher.close().catch(() => {});
      }
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
      }
    }
    // Webhook delivery is best-effort; a down webhook must not break getUpdates.
  }

  private async setWebhookHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const url = body.url ?? '';
    if (!url) {
      this.webhook = undefined;
      this.sendJson(res, 200, { ok: true, result: true });
      return;
    }
    if (typeof url !== 'string') throw new HttpError(400, 'Webhook URL must be a string');
    if (body.secret_token !== undefined &&
      (typeof body.secret_token !== 'string' || body.secret_token.length > 256)) {
      throw new HttpError(400, 'secret_token must be a string of at most 256 chars');
    }
    try {
      await validateWebhookDestination(url, this.options.resolveHost ?? resolveHostname);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Invalid webhook URL');
    }
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

/**
 * Compare two secrets without leaking their contents through timing.
 * Hashing first makes the comparison length-independent.
 */
export function tokenMatches(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** `URL.hostname` keeps IPv6 brackets; strip them so isIP works. */
function hostOnly(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** SSRF guard: https only, private/loopback hostnames refused. Synchronous shape check. */
export function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid webhook URL'); }
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  if (parsed.username || parsed.password) throw new Error('Webhook URL must not contain credentials');
  const hostname = hostOnly(parsed);
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    throw new Error('Webhook URL must not point to localhost');
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw new Error('Webhook URL must not point to private/loopback addresses');
  }
}

/**
 * Full SSRF guard: shape check, then resolve the hostname and reject if any
 * answer is non-public. Returns the first validated address so callers can pin
 * it in the connection instead of letting the socket resolve the name again.
 */
export async function resolveWebhookTargets(
  url: string,
  resolveHost: (hostname: string) => Promise<string[]> = resolveHostname,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  validateWebhookUrl(url);
  const hostname = hostOnly(new URL(url));
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (addresses.length === 0) throw new Error('Webhook host did not resolve');
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error('Webhook URL must not resolve to a private/loopback address');
    }
  }
  return addresses.map((address) => {
    const family = isIP(address);
    if (family !== 4 && family !== 6) throw new Error('Webhook host resolved to an invalid address');
    return { address, family: family as 4 | 6 };
  });
}

/**
 * Full SSRF guard (see resolveWebhookTargets). Used before storing a webhook and
 * before every delivery, so a hostname that starts resolving privately is
 * rejected.
 */
export async function validateWebhookDestination(
  url: string,
  resolveHost: (hostname: string) => Promise<string[]> = resolveHostname,
): Promise<void> {
  await resolveWebhookTargets(url, resolveHost);
}

export { RATE_LIMIT_PER_BOT, RATE_LIMIT_PER_CHAT };
