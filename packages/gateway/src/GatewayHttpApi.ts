/**
 * Gateway HTTP API — Telegram Bot API compatible surface (L3).
 * 
 * Exposes the same endpoints as Telegram Bot API so that libraries like
 * grammY, telegraf, aiogram work after changing the base URL.
 * 
 * Supported methods (subset for v1):
 * - sendMessage, editMessageText, deleteMessage
 * - answerCallbackQuery, sendChatAction (typing)
 * - getMe, getUpdates (long-poll), setWebhook
 * - setMyCommands, getMyCommands
 * - sendPhoto, sendVideo, sendDocument, sendAudio, sendVoice
 * - sendVideoNote, sendAnimation, sendSticker
 * - sendLocation, sendVenue, sendContact
 * - sendPoll, sendDice
 * - forwardMessage, copyMessage
 * - getChat, getChatMember, getChatMembersCount, getChatAdministrators
 * - leaveChat, banChatMember, unbanChatMember, restrictChatMember, promoteChatMember
 * - setChatPermissions, setChatTitle, setChatDescription, setChatPhoto
 * - deleteChatPhoto, pinChatMessage, unpinChatMessage
 * - getFile (returns file_path for download)
 * 
 * Compatibility: Change base URL from "https://api.telegram.org" to
 * "http://localhost:8080" (or your gateway URL) and use the bot token.
 */

import { BotGateway, type GatewayMessage, type ChatPermissions } from './BotGateway';
import { checkHttpRateLimit, getHttpRateLimitKey, DEFAULT_HTTP_RATE_LIMIT_CONFIG } from './httpRateLimit';

export interface GatewayHttpApiOptions {
  gateway: BotGateway;
  port: number;
  host?: string;
  /** Token prefix for bot identification (e.g., "bot") */
  tokenPrefix?: string;
  /** Optional base path (default: "/") */
  basePath?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: string | number; type: string };
  text?: string;
  photo?: Array<{ file_id: string; width: number; height: number }>;
  caption?: string;
  reply_markup?: any;
  date: number;
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  forward_from?: any;
  forward_date?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; is_bot: boolean; first_name: string; username?: string };
    message?: TelegramMessage;
    inline_message_id?: string;
    chat_instance: string;
    data?: string;
    game_short_name?: string;
  };
  inline_query?: {
    id: string;
    from: { id: number; is_bot: boolean; first_name: string; username?: string };
    query: string;
    offset: string;
  };
  chosen_inline_result?: {
    result_id: string;
    from: { id: number; is_bot: boolean; first_name: string; username?: string };
    query: string;
  };
  poll?: any;
  poll_answer?: any;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TelegramChat {
  id: number | string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo?: any;
  description?: string;
  invite_link?: string;
  pinned_message?: TelegramMessage;
  permissions?: any;
  member_count?: number;
}

export class GatewayHttpApi {
  private readonly gateway: BotGateway;
  private readonly port: number;
  private readonly host: string;
  private readonly tokenPrefix: string;
  private readonly basePath: string;
  private server: any = null;
  private pendingUpdates: TelegramUpdate[] = [];
  private longPollWaiters: Array<(updates: TelegramUpdate[]) => void> = [];
  private updateIdCounter = 0;
  private botToken: string;
  private webhookUrl: string | null = null;
  private webhookSecret: string | null = null;
  private allowedUpdates: string[] = [];
  private maxConnections = 40;

  constructor(options: GatewayHttpApiOptions) {
    this.gateway = options.gateway;
    this.port = options.port;
    this.host = options.host ?? '0.0.0.0';
    this.tokenPrefix = options.tokenPrefix ?? 'bot';
    this.basePath = options.basePath ?? '/';
    this.botToken = `${this.tokenPrefix}${this.gateway.getFingerprint().slice(0, 32)}`;
  }

  /** Start the HTTP server. */
  async start(): Promise<void> {
    const http = await import('http');
    const url = await import('url');
    
    this.server = http.createServer(async (req: any, res: any) => {
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname ?? '';
      
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Bot-Api-Secret-Token');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      
      try {
        await this.handleRequest(req, res, path, parsedUrl.query);
      } catch (error) {
        console.error('[GatewayHttpApi] Request error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error_code: 500, description: 'Internal server error' }));
      }
    });
    
    return new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, this.host, (err: any) => {
        if (err) reject(err);
        else {
          console.log(`[GatewayHttpApi] Listening on ${this.host}:${this.port}`);
          console.log(`[GatewayHttpApi] Bot token: ${this.botToken}`);
          console.log(`[GatewayHttpApi] Base URL: http://${this.host}:${this.port}${this.basePath}`);
          resolve();
        }
      });
    });
  }

  /** Stop the HTTP server. */
  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server.close(resolve));
      this.server = null;
    }
  }

  /** Get the bot token for L3 integration. */
  getToken(): string {
    return this.botToken;
  }

  /** Get webhook URL for this bot. */
  getWebhookUrl(baseUrl: string): string {
    return `${baseUrl.replace(/\/$/, '')}/bot${this.botToken}`;
  }

  /** Push an incoming update to the queue (for getUpdates long-polling). */
  pushUpdate(update: TelegramUpdate): void {
    update.update_id = ++this.updateIdCounter;
    this.pendingUpdates.push(update);
    
    // Notify long-poll waiters
    for (const waiter of this.longPollWaiters.splice(0)) {
      waiter([update]);
    }
  }

  /** Set webhook configuration. */
  setWebhook(url: string | null, secretToken?: string, maxConnections?: number, allowedUpdates?: string[]): void {
    this.webhookUrl = url;
    this.webhookSecret = secretToken ?? null;
    this.maxConnections = maxConnections ?? 40;
    this.allowedUpdates = allowedUpdates ?? [];
    
    if (url) {
      console.log('[GatewayHttpApi] Webhook set to:', url);
    } else {
      console.log('[GatewayHttpApi] Webhook deleted');
    }
  }

  /** Get current webhook info. */
  getWebhookInfo(): { url: string | null; has_custom_certificate: boolean; pending_update_count: number; max_connections: number; allowed_updates: string[] } {
    return {
      url: this.webhookUrl,
      has_custom_certificate: false,
      pending_update_count: this.pendingUpdates.length,
      max_connections: this.maxConnections,
      allowed_updates: this.allowedUpdates,
    };
  }

  private async handleRequest(req: any, res: any, path: string | null, query: any): Promise<void> {
    if (!path) {
      this.sendJson(res, 404, { ok: false, error_code: 404, description: 'Not found' });
      return;
    }

    // Rate limiting - check IP + token
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitKey = getHttpRateLimitKey(clientIp, this.botToken);
    const rateLimitResult = checkHttpRateLimit(rateLimitKey, DEFAULT_HTTP_RATE_LIMIT_CONFIG);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', DEFAULT_HTTP_RATE_LIMIT_CONFIG.maxRequests);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000));

    if (!rateLimitResult.allowed) {
      if (rateLimitResult.blocked) {
        res.setHeader('Retry-After', Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000));
        this.sendJson(res, 429, {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests - IP temporarily blocked due to rate limit violations',
          retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        });
      } else {
        this.sendJson(res, 429, {
          ok: false,
          error_code: 429,
          description: 'Too Many Requests - rate limit exceeded',
          retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        });
      }
      return;
    }

    // Handle webhook endpoint (POST /bot<token>/)
    if (path === `${this.basePath}bot${this.botToken}/` || path === `${this.basePath}bot${this.botToken}`) {
      if (req.method !== 'POST') {
        this.sendJson(res, 405, { ok: false, error_code: 405, description: 'Method not allowed' });
        return;
      }
      
      // Verify secret token if set
      if (this.webhookSecret) {
        const secret = req.headers['x-telegram-bot-api-secret-token'];
        if (secret !== this.webhookSecret) {
          this.sendJson(res, 401, { ok: false, error_code: 401, description: 'Unauthorized' });
          return;
        }
      }
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      if (!body) {
        this.sendJson(res, 400, { ok: false, error_code: 400, description: 'Bad request' });
        return;
      }
      
      const update = JSON.parse(body);
      this.pushUpdate(update);
      this.sendJson(res, 200, { ok: true });
      return;
    }

    // Parse path: /bot<token>/method
    const match = path.match(new RegExp(`^${this.basePath}bot([^\/]+)\/(.+)$`));
    if (!match) {
      this.sendJson(res, 404, { ok: false, error_code: 404, description: 'Not found' });
      return;
    }

    const [, token, method] = match;
    if (token !== this.botToken) {
      this.sendJson(res, 401, { ok: false, error_code: 401, description: 'Unauthorized' });
      return;
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const data = body ? JSON.parse(body) : {};

    try {
      const result = await this.executeMethod(method, data, query);
      this.sendJson(res, 200, { ok: true, result });
    } catch (error: any) {
      console.error(`[GatewayHttpApi] ${method} error:`, error);
      this.sendJson(res, 200, { ok: false, error_code: error.code ?? 500, description: error.message });
    }
  }

  private async executeMethod(method: string, data: any, query: any): Promise<any> {
    switch (method) {
      // Core bot info
      case 'getMe':
        return this.handleGetMe();
      case 'getMyCommands':
        return this.handleGetMyCommands(data);

      // Message sending
      case 'sendMessage':
        return this.handleSendMessage(data);
      case 'sendPhoto':
        return this.handleSendPhoto(data);
      case 'sendVideo':
        return this.handleSendVideo(data);
      case 'sendDocument':
        return this.handleSendDocument(data);
      case 'sendAudio':
        return this.handleSendAudio(data);
      case 'sendVoice':
        return this.handleSendVoice(data);
      case 'sendVideoNote':
        return this.handleSendVideoNote(data);
      case 'sendAnimation':
        return this.handleSendAnimation(data);
      case 'sendSticker':
        return this.handleSendSticker(data);
      case 'sendLocation':
        return this.handleSendLocation(data);
      case 'sendVenue':
        return this.handleSendVenue(data);
      case 'sendContact':
        return this.handleSendContact(data);
      case 'sendPoll':
        return this.handleSendPoll(data);
      case 'sendDice':
        return this.handleSendDice(data);
      case 'sendMediaGroup':
        return this.handleSendMediaGroup(data);
      case 'forwardMessage':
        return this.handleForwardMessage(data);
      case 'copyMessage':
        return this.handleCopyMessage(data);

      // Message editing/deleting
      case 'editMessageText':
      case 'editMessageCaption':
      case 'editMessageReplyMarkup':
      case 'editMessageMedia':
      case 'editMessageLiveLocation':
      case 'stopMessageLiveLocation':
        return this.handleEditMessage(method, data);
      case 'deleteMessage':
        return this.handleDeleteMessage(data);

      // Callbacks & inline
      case 'answerCallbackQuery':
        return this.handleAnswerCallbackQuery(data);
      case 'answerInlineQuery':
        return this.handleAnswerInlineQuery(data);

      // Chat actions
      case 'sendChatAction':
        return this.handleSendChatAction(data);

      // Webhook management
      case 'setWebhook':
        return this.handleSetWebhook(data);
      case 'deleteWebhook':
        return this.handleDeleteWebhook(data);
      case 'getWebhookInfo':
        return this.handleGetWebhookInfo();

      // Long polling
      case 'getUpdates':
        return this.handleGetUpdates(query);

      // Bot commands
      case 'setMyCommands':
        return this.handleSetMyCommands(data);

      // Chat management
      case 'getChat':
        return this.handleGetChat(data);
      case 'getChatMember':
        return this.handleGetChatMember(data);
      case 'getChatMembersCount':
        return this.handleGetChatMembersCount(data);
      case 'getChatAdministrators':
        return this.handleGetChatAdministrators(data);
      case 'leaveChat':
        return this.handleLeaveChat(data);
      case 'banChatMember':
        return this.handleBanChatMember(data);
      case 'unbanChatMember':
        return this.handleUnbanChatMember(data);
      case 'restrictChatMember':
        return this.handleRestrictChatMember(data);
      case 'promoteChatMember':
        return this.handlePromoteChatMember(data);
      case 'setChatPermissions':
        return this.handleSetChatPermissions(data);
      case 'setChatTitle':
        return this.handleSetChatTitle(data);
      case 'setChatDescription':
        return this.handleSetChatDescription(data);
      case 'setChatPhoto':
        return this.handleSetChatPhoto(data);
      case 'deleteChatPhoto':
        return this.handleDeleteChatPhoto(data);
      case 'pinChatMessage':
        return this.handlePinChatMessage(data);
      case 'unpinChatMessage':
        return this.handleUnpinChatMessage(data);

      // Files
      case 'getFile':
        return this.handleGetFile(data);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // ---- Handler implementations ----

  private handleGetMe(): any {
    return {
      id: parseInt(this.gateway.getFingerprint().slice(0, 8), 16) % 1000000000,
      is_bot: true,
      first_name: 'Nova Bot',
      username: `nova_${this.gateway.getFingerprint().slice(0, 8)}_bot`,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: true,
    };
  }

  private handleGetMyCommands(data: any): any[] {
    // Would sync with bot runtime commands
    return [];
  }

  private async handleSendMessage(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const text = data.text ?? '';
    const messageId = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text,
      keyboard: data.reply_markup,
      parse_mode: data.parse_mode,
      disable_web_page_preview: data.disable_web_page_preview,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      reply_to_message_id: data.reply_to_message_id,
      allow_sending_without_reply: data.allow_sending_without_reply,
      reply_markup: data.reply_markup,
      timestamp: Date.now(),
    };

    // Resolve chatId to fingerprint (in real impl, this maps via session)
    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendPhoto(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    const photo = data.photo; // file_id or uploaded file
    const caption = data.caption;
    const parse_mode = data.parse_mode;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: caption ?? '',
      photo: photo,
      caption,
      parse_mode,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      photo: [{ file_id: photo, width: 0, height: 0 }],
      caption,
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendVideo(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'video');
  }

  private async handleSendDocument(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'document');
  }

  private async handleSendAudio(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'audio');
  }

  private async handleSendVoice(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'voice');
  }

  private async handleSendVideoNote(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'video_note');
  }

  private async handleSendAnimation(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'animation');
  }

  private async handleSendSticker(data: any): Promise<any> {
    return this.handleMediaMessage(data, 'sticker');
  }

  private async handleMediaMessage(data: any, mediaType: string): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    const media = data[mediaType]; // file_id or file
    const caption = data.caption;
    const parse_mode = data.parse_mode;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: caption ?? '',
      [mediaType]: media,
      caption,
      parse_mode,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      [mediaType]: { file_id: media, file_unique_id: media },
      caption,
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendLocation(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    const latitude = data.latitude;
    const longitude = data.longitude;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: `📍 Location: ${latitude}, ${longitude}`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      location: { latitude, longitude },
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendVenue(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: `📍 ${data.title}: ${data.address}`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      venue: {
        location: { latitude: data.latitude, longitude: data.longitude },
        title: data.title,
        address: data.address,
        foursquare_id: data.foursquare_id,
        foursquare_type: data.foursquare_type,
        google_place_id: data.google_place_id,
        google_place_type: data.google_place_type,
      },
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendContact(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: `👤 ${data.first_name} ${data.last_name ?? ''}: ${data.phone_number}`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      contact: {
        phone_number: data.phone_number,
        first_name: data.first_name,
        last_name: data.last_name,
        vcard: data.vcard,
      },
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendPoll(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: `📊 Poll: ${data.question}\nOptions: ${data.options.map((o: any) => o.text).join(', ')}`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      poll: {
        id: String(messageId),
        question: data.question,
        options: data.options.map((o: any, i: number) => ({ text: o.text, voter_count: 0 })),
        total_voter_count: 0,
        is_closed: false,
        is_anonymous: data.is_anonymous ?? true,
        type: data.type ?? 'regular',
        allows_multiple_answers: data.allows_multiple_answers ?? false,
      },
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendDice(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const messageId = ++this.updateIdCounter;
    const emoji = data.emoji ?? '🎲';
    const value = Math.floor(Math.random() * 6) + 1;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text: `${emoji} ${value}`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      dice: { emoji, value },
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleSendMediaGroup(data: any): Promise<any[]> {
    const chatId = String(data.chat_id);
    const media = data.media;
    const results: any[] = [];
    
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const messageId = ++this.updateIdCounter;
      
      const message: GatewayMessage = {
        type: 'outgoing',
        chatId,
        messageId: String(messageId),
        text: item.caption ?? '',
        [item.type]: item.media,
        caption: item.caption,
        parse_mode: item.parse_mode,
        timestamp: Date.now(),
      };

      const targetFingerprint = await this.resolveChatToFingerprint(chatId);
      if (targetFingerprint) {
        await this.gateway.sendMessage(chatId, targetFingerprint, message);
      }

      results.push({
        message_id: messageId,
        chat: { id: chatId, type: 'private' },
        [item.type]: { file_id: item.media, file_unique_id: item.media },
        caption: item.caption,
        date: Math.floor(Date.now() / 1000),
      });
    }
    
    return results;
  }

  private async handleForwardMessage(data: any): Promise<any> {
    const chatId = String(data.chat_id);
    const fromChatId = String(data.from_chat_id);
    const messageId = data.message_id;
    const messageIdNew = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageIdNew),
      text: `[Forwarded from ${fromChatId}/${messageId}]`,
      reply_markup: data.reply_markup,
      disable_notification: data.disable_notification,
      protect_content: data.protect_content,
      timestamp: Date.now(),
    };

    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.sendMessage(chatId, targetFingerprint, message);
    }

    return {
      message_id: messageIdNew,
      chat: { id: chatId, type: 'private' },
      forward_from_chat: { id: fromChatId },
      forward_from_message_id: messageId,
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleCopyMessage(data: any): Promise<any> {
    return this.handleForwardMessage(data);
  }

  private async handleEditMessage(method: string, data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const messageId = String(data.message_id);
    const text = data.text ?? '';
    const keyboard = data.reply_markup;
    
    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.editMessage(chatId, targetFingerprint, messageId, text, keyboard);
    }
    return true;
  }

  private async handleDeleteMessage(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const messageId = String(data.message_id);
    
    const targetFingerprint = await this.resolveChatToFingerprint(chatId);
    if (targetFingerprint) {
      await this.gateway.deleteMessage(chatId, targetFingerprint, messageId);
    }
    return true;
  }

  private async handleAnswerCallbackQuery(data: any): Promise<boolean> {
    const queryId = data.callback_query_id;
    const text = data.text;
    const showAlert = data.show_alert ?? false;
    const url = data.url;
    const cacheTime = data.cache_time;
    
    await this.gateway.answerCallbackQuery(queryId, { text, showAlert, url, cacheTime });
    return true;
  }

  private async handleAnswerInlineQuery(data: any): Promise<boolean> {
    // Inline query results would be handled by the bot runtime
    console.log('[GatewayHttpApi] answerInlineQuery:', data);
    return true;
  }

  private async handleSendChatAction(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const action = data.action;
    
    if (action === 'typing' || action === 'record_video' || action === 'record_audio' || action === 'upload_photo' || action === 'upload_video' || action === 'upload_document' || action === 'find_location' || action === 'record_video_note' || action === 'upload_video_note') {
      const targetFingerprint = await this.resolveChatToFingerprint(chatId);
      if (targetFingerprint) {
        await this.gateway.sendTyping(chatId, targetFingerprint, action === 'typing');
      }
    }
    return true;
  }

  private async handleSetWebhook(data: any): Promise<boolean> {
    const url = data.url;
    if (!url) return this.handleDeleteWebhook(data);
    
    this.setWebhook(url, data.secret_token, data.max_connections, data.allowed_updates);
    return true;
  }

  private async handleDeleteWebhook(data: any): Promise<boolean> {
    this.setWebhook(null);
    return true;
  }

  private handleGetWebhookInfo(): any {
    return this.getWebhookInfo();
  }

  private async handleGetUpdates(query: any): Promise<any[]> {
    const offset = parseInt(query.offset) || 0;
    const limit = parseInt(query.limit) || 100;
    const timeout = parseInt(query.timeout) || 0;
    const allowedUpdates = query.allowed_updates ? JSON.parse(query.allowed_updates) : [];
    
    if (timeout > 0) {
      // Long polling
      return new Promise<any[]>((resolve) => {
        const waiter = (updates: any[]) => {
          const available = this.pendingUpdates
            .filter(u => u.update_id > offset)
            .filter(u => allowedUpdates.length === 0 || allowedUpdates.includes(u.message ? 'message' : u.callback_query ? 'callback_query' : 'unknown'))
            .slice(0, limit);
          resolve(available);
        };
        this.longPollWaiters.push(waiter);
        
        // Timeout fallback
        setTimeout(() => {
          const idx = this.longPollWaiters.indexOf(waiter);
          if (idx !== -1) this.longPollWaiters.splice(idx, 1);
          resolve([]);
        }, timeout * 1000);
      });
    }
    
    return this.pendingUpdates
      .filter(u => u.update_id > offset)
      .filter(u => allowedUpdates.length === 0 || allowedUpdates.includes(u.message ? 'message' : u.callback_query ? 'callback_query' : 'unknown'))
      .slice(0, limit);
  }

  private async handleSetMyCommands(data: any): Promise<boolean> {
    const commands = data.commands;
    // Sync with bot runtime
    console.log('[GatewayHttpApi] Set commands:', commands);
    return true;
  }

  private handleGetMyCommands(data: any): any[] {
    return [];
  }

  private async handleGetChat(data: any): Promise<any> {
    const chatId = data.chat_id;
    // Return chat info
    return {
      id: chatId,
      type: 'private',
      title: null,
      username: null,
      first_name: 'User',
      last_name: null,
      photo: null,
      description: null,
      invite_link: null,
      pinned_message: null,
      permissions: null,
      member_count: 1,
    };
  }

  private async handleGetChatMember(data: any): Promise<any> {
    const chatId = data.chat_id;
    const userId = data.user_id;
    return {
      user: {
        id: userId,
        is_bot: false,
        first_name: 'User',
        username: null,
      },
      status: 'member',
      until_date: null,
    };
  }

  private async handleGetChatMembersCount(data: any): Promise<number> {
    return 1;
  }

  private async handleGetChatAdministrators(data: any): Promise<any[]> {
    return [];
  }

  private async handleLeaveChat(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] leaveChat:', data.chat_id);
    return true;
  }

  private async handleBanChatMember(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const userId = String(data.user_id);
    const untilDate = data.until_date ? Number(data.until_date) * 1000 : undefined;
    
    // Resolve userId to fingerprint (in real impl, this maps via session)
    const userFingerprint = await this.resolveUserToFingerprint(userId);
    const botFingerprint = this.gateway.getFingerprint();
    
    if (!userFingerprint) {
      throw new Error('User not found');
    }
    
    return this.gateway.banChatMember(chatId, userFingerprint, botFingerprint);
  }

  private async handleUnbanChatMember(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const userId = String(data.user_id);
    
    const userFingerprint = await this.resolveUserToFingerprint(userId);
    const botFingerprint = this.gateway.getFingerprint();
    
    if (!userFingerprint) {
      throw new Error('User not found');
    }
    
    return this.gateway.unbanChatMember(chatId, userFingerprint, botFingerprint);
  }

  private async handleRestrictChatMember(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const userId = String(data.user_id);
    const untilDate = data.until_date ? Number(data.until_date) * 1000 : undefined;
    
    const userFingerprint = await this.resolveUserToFingerprint(userId);
    
    if (!userFingerprint) {
      throw new Error('User not found');
    }
    
    const permissions: ChatPermissions = {
      canSendMessages: data.permissions?.can_send_messages ?? false,
      canSendMediaMessages: data.permissions?.can_send_media_messages ?? false,
      canSendPolls: data.permissions?.can_send_polls ?? false,
      canSendOtherMessages: data.permissions?.can_send_other_messages ?? false,
      canAddWebPagePreviews: data.permissions?.can_add_web_page_previews ?? false,
      canChangeInfo: data.permissions?.can_change_info ?? false,
      canInviteUsers: data.permissions?.can_invite_users ?? false,
      canManageTopics: data.permissions?.can_manage_topics ?? false,
    };
    
    return this.gateway.restrictChatMember(chatId, userFingerprint, permissions, untilDate);
  }

  private async handlePromoteChatMember(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const userId = String(data.user_id);
    
    const userFingerprint = await this.resolveUserToFingerprint(userId);
    
    if (!userFingerprint) {
      throw new Error('User not found');
    }
    
    const isAdmin = data.is_anonymous !== true && (
      data.can_manage_chat === true ||
      data.can_manage_video_chats === true ||
      data.can_delete_messages === true ||
      data.can_restrict_members === true ||
      data.can_promote_members === true ||
      data.can_change_info === true ||
      data.can_invite_users === true ||
      data.can_post_messages === true ||
      data.can_edit_messages === true ||
      data.can_pin_messages === true ||
      data.can_manage_topics === true
    );
    
    return this.gateway.promoteChatMember(chatId, userFingerprint, isAdmin);
  }

  private async handleSetChatPermissions(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    
    const permissions: ChatPermissions = {
      canSendMessages: data.permissions?.can_send_messages ?? true,
      canSendMediaMessages: data.permissions?.can_send_media_messages ?? true,
      canSendPolls: data.permissions?.can_send_polls ?? true,
      canSendOtherMessages: data.permissions?.can_send_other_messages ?? true,
      canAddWebPagePreviews: data.permissions?.can_add_web_page_previews ?? true,
      canChangeInfo: data.permissions?.can_change_info ?? true,
      canInviteUsers: data.permissions?.can_invite_users ?? true,
      canManageTopics: data.permissions?.can_manage_topics ?? true,
    };
    
    return this.gateway.setChatPermissions(chatId, permissions);
  }

  private async handleSetChatTitle(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] setChatTitle:', data);
    return true;
  }

  private async handleSetChatDescription(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] setChatDescription:', data);
    return true;
  }

  private async handleSetChatPhoto(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] setChatPhoto:', data);
    return true;
  }

  private async handleDeleteChatPhoto(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] deleteChatPhoto:', data);
    return true;
  }

  private async handlePinChatMessage(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] pinChatMessage:', data);
    return true;
  }

  private async handleUnpinChatMessage(data: any): Promise<boolean> {
    console.log('[GatewayHttpApi] unpinChatMessage:', data);
    return true;
  }

  private async handleGetFile(data: any): Promise<any> {
    const fileId = data.file_id;
    // In real impl, would return file path for download
    return {
      file_id: fileId,
      file_unique_id: fileId,
      file_size: 0,
      file_path: `files/${fileId}`,
    };
  }

  // ---- Helper methods ----

  private async resolveChatToFingerprint(chatId: string): Promise<string | null> {
    // In a real implementation, this would map chatId -> peer fingerprint
    // via the bot's session/registry. For now, return a placeholder.
    // The BotGateway would need a method to resolve this mapping.
    return null;
  }

  private async resolveUserToFingerprint(userId: string): Promise<string | null> {
    // In a real implementation, this would map Telegram userId -> peer fingerprint
    // via the bot's session/registry. For now, treat userId as fingerprint if it looks like one.
    if (userId.startsWith('nova_pk_') || /^[A-Za-z0-9_-]{40,64}$/.test(userId)) {
      return userId;
    }
    // Could look up in a user registry: this.gateway.getUserFingerprint(userId)
    return null;
  }

  private sendJson(res: any, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}