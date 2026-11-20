/**
 * Bot platform contracts — Tier L1 (local bots).
 *
 * See docs/bots-roadmap.md. One inline-button format only (the old
 * neumorphic-ui repo had two incompatible ones); `callback_data` is limited
 * to 64 bytes like Telegram. Bots are stored in the encrypted settings store
 * (src/lib/storage/db.ts), never as plaintext IndexedDB rows.
 */

/** Permissions a bot can request; every call is denied unless granted. */
export type BotPermission =
  | 'read_messages'      // receive chat messages as updates
  | 'send_messages'      // sendMessage / editMessage / deleteMessage
  | 'inline_keyboard'    // attach inline keyboards to its own messages
  | 'media'              // send media attachments
  | 'mention_only';      // group privacy mode: only commands + mentions

export const ALL_BOT_PERMISSIONS: readonly BotPermission[] = [
  'read_messages',
  'send_messages',
  'inline_keyboard',
  'media',
  'mention_only',
];

export interface BotCommand {
  /** Slash command without the leading '/', e.g. "start". */
  command: string;
  description: string;
}

/** One inline-button format: exactly one action field must be present. */
export interface InlineKeyboardButton {
  text: string;
  /** ≤ 64 bytes (UTF-8); sent back to the bot as a callback_query. */
  callback_data?: string;
  url?: string;
  /** Reserved for Phase B7 (Mini Apps). */
  web_app?: { url: string };
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface BotManifest {
  /** Stable bot id, e.g. "echo_bot". */
  id: string;
  name: string;
  /** Must end with "bot" (case-insensitive), lowercase in storage. */
  username: string;
  description?: string;
  version: string;
  commands: BotCommand[];
  /** Permissions the bot requests; the user grants each explicitly. */
  requestedPermissions: BotPermission[];
  /** For L1: a module URL the runtime imports. Absent for gateway bots. */
  entryPoint?: string;
  /** For L2/L3: the owner's gateway URL. Absent for local bots. */
  gatewayUrl?: string;
}

export type ChatKind = 'direct' | 'group' | 'channel';

/** The chat-scoped view a bot receives. No contact lists, no analytics. */
export interface BotChat {
  id: string;
  kind: ChatKind;
}

export interface BotIncomingMessage {
  messageId: string;
  chat: BotChat;
  text: string;
  /** True when the message starts with "/<command>" */
  isCommand: boolean;
  command?: string;
  /** True when the message mentions this bot (@username). */
  mentionsBot: boolean;
  from: string;
  timestamp: number;
  /** User's language code (e.g., 'en', 'ru', 'uk'). */
  language?: string;
}

export interface BotCallbackQuery {
  id: string;
  chat: BotChat;
  messageId: string;
  /** The `callback_data` of the pressed button (≤ 64 bytes). */
  data: string;
  from: string;
  timestamp: number;
  /** User's language code (e.g., 'en', 'ru', 'uk'). */
  language?: string;
}

/** Inline query from a Mini App / composer (Phase B7). */
export interface BotInlineQuery {
  id: string;
  chat: BotChat;
  /** The query text typed by the user. */
  query: string;
  /** Offset for pagination (Telegram-compatible). */
  offset: string;
  from: string;
  timestamp: number;
  /** User's language code (e.g., 'en', 'ru', 'uk'). */
  language?: string;
}

export type BotUpdate =
  | { type: 'message'; payload: BotIncomingMessage }
  | { type: 'edited_message'; payload: BotIncomingMessage }
  | { type: 'callback_query'; payload: BotCallbackQuery }
  | { type: 'inline_query'; payload: BotInlineQuery }
  | { type: 'my_chat_member'; payload: { chat: BotChat; member: string; added: boolean } };

export type BotUpdateType = BotUpdate['type'];

/** Bot → app outgoing message options. */
export interface BotSendMessageOptions {
  keyboard?: InlineKeyboard;
  /** Silent message: no notification sound. */
  silent?: boolean;
  /** Photo URL to send with the message (requires 'media' permission). */
  photo?: string;
  /** Caption for the photo (shown below the image). */
  caption?: string;
}

export interface BotOutgoingMessage {
  messageId: string;
  chat: BotChat;
  text: string;
  keyboard?: InlineKeyboard;
  timestamp: number;
  /** Photo URL sent with the message. */
  photo?: string;
  /** Caption for the photo. */
  caption?: string;
}

export interface BotMessageEdit {
  chat: BotChat;
  messageId: string;
  text: string;
  keyboard?: InlineKeyboard;
}

export interface AnswerCallbackQueryOptions {
  /** Text of a toast shown to the user. */
  text?: string;
  /** Show an alert dialog instead of a toast. */
  showAlert?: boolean;
}

// ---------------------------------------------------------------------------
// Type guards and validation
// ---------------------------------------------------------------------------

const CALLBACK_DATA_MAX_BYTES = 64;

export function callbackDataByteLimit(): number {
  return CALLBACK_DATA_MAX_BYTES;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function isValidBotUsername(username: string): boolean {
  return /^[a-z][a-z0-9_]{2,31}bot$/.test(username);
}

export function isValidBotId(id: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/.test(id);
}

export function isValidCommand(command: string): boolean {
  return /^[a-z0-9_]{1,32}$/.test(command);
}

/** A button is valid when it has exactly one action field in range. */
export function isValidInlineButton(button: InlineKeyboardButton): boolean {
  if (typeof button.text !== 'string' || button.text.length === 0 || button.text.length > 64) {
    return false;
  }
  const actions = [button.callback_data !== undefined, button.url !== undefined, button.web_app !== undefined];
  if (actions.filter(Boolean).length !== 1) return false;
  if (button.callback_data !== undefined) {
    if (button.callback_data.length === 0) return false;
    if (utf8ByteLength(button.callback_data) > CALLBACK_DATA_MAX_BYTES) return false;
  }
  if (button.url !== undefined) {
    try {
      const parsed = new URL(button.url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    } catch {
      return false;
    }
  }
  if (button.web_app !== undefined && (typeof button.web_app.url !== 'string' || button.web_app.url.length === 0)) {
    return false;
  }
  return true;
}

export function isValidInlineKeyboard(keyboard: InlineKeyboard): boolean {
  if (!Array.isArray(keyboard) || keyboard.length > 8) return false;
  return keyboard.every((row) => Array.isArray(row) && row.length >= 1 && row.length <= 8 && row.every(isValidInlineButton));
}

/** Structural validation of a parsed manifest (unknown fields ignored). */
export function isValidBotManifest(value: unknown): value is BotManifest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string' || !isValidBotId(m.id)) return false;
  if (typeof m.name !== 'string' || m.name.length === 0 || m.name.length > 64) return false;
  if (typeof m.username !== 'string' || !isValidBotUsername(m.username)) return false;
  if (typeof m.version !== 'string' || m.version.length === 0) return false;
  if (!Array.isArray(m.commands)) return false;
  if (!m.commands.every((c) => {
    const cmd = c as Record<string, unknown>;
    return typeof cmd === 'object' && cmd !== null &&
      typeof cmd.command === 'string' && isValidCommand(cmd.command) &&
      typeof cmd.description === 'string';
  })) return false;
  if (!Array.isArray(m.requestedPermissions)) return false;
  const allowed = new Set<string>(ALL_BOT_PERMISSIONS);
  if (!m.requestedPermissions.every((p) => typeof p === 'string' && allowed.has(p))) return false;
  if (m.entryPoint !== undefined && (typeof m.entryPoint !== 'string' || m.entryPoint.length === 0)) return false;
  if (m.gatewayUrl !== undefined && (typeof m.gatewayUrl !== 'string' || m.gatewayUrl.length === 0)) return false;
  if (m.entryPoint === undefined && m.gatewayUrl === undefined) return false;
  return true;
}

/** Permission changes after install require explicit re-consent. */
export function permissionsChanged(granted: readonly BotPermission[], requested: readonly BotPermission[]): BotPermission[] {
  const grantedSet = new Set(granted);
  return requested.filter((p) => !grantedSet.has(p));
}
