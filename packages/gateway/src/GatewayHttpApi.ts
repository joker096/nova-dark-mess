/**
 * Gateway HTTP API — Telegram Bot API compatible surface (L3).
 * 
 * Exposes the same endpoints as Telegram Bot API:
 * - POST /bot<token>/sendMessage
 * - POST /bot<token>/editMessageText
 * - POST /bot<token>/deleteMessage
 * - POST /bot<token>/answerCallbackQuery
 * - POST /bot<token>/sendChatAction (typing)
 * - GET  /bot<token>/getMe
 * - POST /bot<token>/setWebhook
 * - GET  /bot<token>/getUpdates (long-poll)
 * - POST /bot<token>/setMyCommands
 */

import { BotGateway, type GatewayMessage } from './BotGateway';

export interface GatewayHttpApiOptions {
  gateway: BotGateway;
  port: number;
  host?: string;
  /** Token prefix for bot identification (e.g., "bot") */
  tokenPrefix?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: string | number; type: string };
  text?: string;
  photo?: Array<{ file_id: string; width: number; height: number }>;
  caption?: string;
  reply_markup?: any;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; is_bot: boolean; first_name: string };
    message?: TelegramMessage;
    data: string;
  };
}

export class GatewayHttpApi {
  private readonly gateway: BotGateway;
  private readonly port: number;
  private readonly host: string;
  private readonly tokenPrefix: string;
  private server: any = null;
  private pendingUpdates: TelegramUpdate[] = [];
  private longPollWaiters: Array<(updates: TelegramUpdate[]) => void> = [];
  private updateIdCounter = 0;
  private botToken: string;

  constructor(options: GatewayHttpApiOptions) {
    this.gateway = options.gateway;
    this.port = options.port;
    this.host = options.host ?? '0.0.0.0';
    this.tokenPrefix = options.tokenPrefix ?? 'bot';
    this.botToken = `${this.tokenPrefix}${this.gateway.getFingerprint().slice(0, 32)}`;
  }

  /** Start the HTTP server. */
  async start(): Promise<void> {
    const http = await import('http');
    const url = await import('url');
    
    this.server = http.createServer(async (req: any, res: any) => {
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;
      
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
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
    return `${baseUrl}/bot${this.botToken}`;
  }

  private async handleRequest(req: any, res: any, path: string | null, query: any): Promise<void> {
    if (!path) {
      this.sendJson(res, 404, { ok: false, error_code: 404, description: 'Not found' });
      return;
    }

    // Parse path: /bot<token>/method
    const match = path.match(/^\/bot([^\/]+)\/(.+)$/);
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
      case 'getMe':
        return {
          id: parseInt(this.gateway.getFingerprint().slice(0, 8), 16) % 1000000000,
          is_bot: true,
          first_name: 'Nova Bot',
          username: `nova_${this.gateway.getFingerprint().slice(0, 8)}_bot`,
        };

      case 'sendMessage':
        return this.handleSendMessage(data);

      case 'editMessageText':
      case 'editMessageCaption':
      case 'editMessageReplyMarkup':
        return this.handleEditMessage(method, data);

      case 'deleteMessage':
        return this.handleDeleteMessage(data);

      case 'answerCallbackQuery':
        return this.handleAnswerCallbackQuery(data);

      case 'sendChatAction':
        return this.handleSendChatAction(data);

      case 'setWebhook':
        return this.handleSetWebhook(data);

      case 'getUpdates':
        return this.handleGetUpdates(query);

      case 'setMyCommands':
        return this.handleSetMyCommands(data);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async handleSendMessage(data: any): Promise<TelegramMessage> {
    const chatId = String(data.chat_id);
    const text = data.text ?? '';
    const messageId = ++this.updateIdCounter;
    
    const message: GatewayMessage = {
      type: 'outgoing',
      chatId,
      messageId: String(messageId),
      text,
      keyboard: data.reply_markup,
      photo: data.photo,
      caption: data.caption,
      timestamp: Date.now(),
    };

    // For L2/L3, we need a target fingerprint. 
    // In real implementation, this would be resolved from chatId -> fingerprint mapping.
    // For now, we'll need the gateway to have a way to resolve chatId -> peer fingerprint.
    // This is a simplified implementation.
    
    // await this.gateway.sendMessage(chatId, targetFingerprint, message);
    
    return {
      message_id: messageId,
      chat: { id: chatId, type: 'private' },
      text,
      date: Math.floor(Date.now() / 1000),
    };
  }

  private async handleEditMessage(method: string, data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const messageId = String(data.message_id);
    const text = data.text ?? '';
    const keyboard = data.reply_markup;
    
    // await this.gateway.editMessage(chatId, targetFingerprint, messageId, text, keyboard);
    return true;
  }

  private async handleDeleteMessage(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const messageId = String(data.message_id);
    
    // await this.gateway.deleteMessage(chatId, targetFingerprint, messageId);
    return true;
  }

  private async handleAnswerCallbackQuery(data: any): Promise<boolean> {
    const queryId = data.callback_query_id;
    const text = data.text;
    const showAlert = data.show_alert ?? false;
    
    await this.gateway.answerCallbackQuery(queryId, { text, showAlert });
    return true;
  }

  private async handleSendChatAction(data: any): Promise<boolean> {
    const chatId = String(data.chat_id);
    const action = data.action;
    
    if (action === 'typing') {
      // await this.gateway.sendTyping(chatId, targetFingerprint, true);
    }
    return true;
  }

  private async handleSetWebhook(data: any): Promise<boolean> {
    const url = data.url;
    if (!url) return true;
    
    // Store webhook URL for this bot
    // In real implementation, would set up webhook forwarding
    console.log('[GatewayHttpApi] Set webhook:', url);
    return true;
  }

  private async handleGetUpdates(query: any): Promise<TelegramUpdate[]> {
    const offset = parseInt(query.offset) || 0;
    const limit = parseInt(query.limit) || 100;
    const timeout = parseInt(query.timeout) || 0;
    
    if (timeout > 0) {
      // Long polling
      return new Promise<TelegramUpdate[]>((resolve) => {
        const waiter = (updates: TelegramUpdate[]) => {
          const available = this.pendingUpdates.filter(u => u.update_id > offset).slice(0, limit);
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
    
    return this.pendingUpdates.filter(u => u.update_id > offset).slice(0, limit);
  }

  private async handleSetMyCommands(data: any): Promise<boolean> {
    // Bot commands would be synced with the bot runtime
    console.log('[GatewayHttpApi] Set commands:', data.commands);
    return true;
  }

  /** Push an incoming message to the update queue (for getUpdates). */
  pushUpdate(update: TelegramUpdate): void {
    update.update_id = ++this.updateIdCounter;
    this.pendingUpdates.push(update);
    
    // Notify long-poll waiters
    for (const waiter of this.longPollWaiters.splice(0)) {
      waiter([update]);
    }
  }

  private sendJson(res: any, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}