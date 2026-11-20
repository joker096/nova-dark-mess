/**
 * Local bot runtime — Tier L1 (docs/bots-roadmap.md, Phase B1).
 *
 * The runtime loads installed bots and hands each one a `BotContext`.
 * Every context call is checked against the permissions the user granted
 * (deny by default). Bot registries live in the encrypted settings store,
 * never as plaintext rows.
 *
 * The runtime deliberately has NO network access and no direct transport:
 * delivery to chats happens through the `MessageSink` provided by the host
 * (App session), so a compromised bot cannot talk to the network itself.
 */
import {
  ALL_BOT_PERMISSIONS,
  type AnswerCallbackQueryOptions,
  type BotCommand,
  type BotManifest,
  type BotMessageEdit,
  type BotOutgoingMessage,
  type BotPermission,
  type BotSendMessageOptions,
  type BotUpdate,
  type BotUpdateType,
  type InlineKeyboard,
  isValidBotManifest,
  isValidInlineKeyboard,
  isValidCommand,
  permissionsChanged,
} from './types';

export type { BotUpdate, BotUpdateType } from './types';

/** Feature flag: L1 local bots are on by default; gateway pieces off. */
export const NOVA_BOTS = (import.meta.env.VITE_NOVA_BOTS ?? 'true') !== 'false';
// ---------------------------------------------------------------------------
// Encrypted registry storage
// ---------------------------------------------------------------------------

const BOTS_REGISTRY_KEY = 'nova_bots_registry_v1';

export interface InstalledBot {
  manifest: BotManifest;
  /** Permissions explicitly granted by the user at install (or re-consent). */
  grantedPermissions: BotPermission[];
  installedAt: number;
  /** False when the user disabled the bot without uninstalling it. */
  enabled: boolean;
  /**
   * True when the user blocked the bot (Phase B8). Blocking is stronger than
   * disabling: the bot gets no updates, and the UI asks before unblocking.
   */
  blocked?: boolean;
}

export interface BotRegistry {
  bots: InstalledBot[];
}

export function emptyBotRegistry(): BotRegistry {
  return { bots: [] };
}

// Storage abstraction so tests can run without IndexedDB while production
// uses the encrypted settings store (src/lib/storage/db.ts saveSetting).
export interface BotStorage {
  load(): Promise<BotRegistry>;
  save(registry: BotRegistry): Promise<void>;
}

export class InMemoryBotStorage implements BotStorage {
  private registry: BotRegistry = emptyBotRegistry();

  public async load(): Promise<BotRegistry> {
    return this.registry;
  }

  public async save(registry: BotRegistry): Promise<void> {
    this.registry = registry;
  }
}

interface EncryptedSettingStore {
  saveSetting(key: string, value: unknown): Promise<void>;
  loadSetting<T>(key: string): Promise<T | null>;
}

export class EncryptedBotStorage implements BotStorage {
  constructor(private readonly store: EncryptedSettingStore) { }

  public async load(): Promise<BotRegistry> {
    try {
      const raw = await this.store.loadSetting<BotRegistry>(BOTS_REGISTRY_KEY);
      if (!raw || !Array.isArray(raw.bots)) return emptyBotRegistry();
      // Drop rows that fail structural validation (corrupt or tampered).
      const bots = raw.bots.filter((b): b is InstalledBot =>
        Boolean(b) &&
        typeof b === 'object' &&
        isValidBotManifest((b as InstalledBot).manifest) &&
        Array.isArray((b as InstalledBot).grantedPermissions) &&
        (b as InstalledBot).grantedPermissions.every((p) => (ALL_BOT_PERMISSIONS as readonly string[]).includes(p)),
      );
      return { bots };
    } catch {
      return emptyBotRegistry();
    }
  }

  public async save(registry: BotRegistry): Promise<void> {
    await this.store.saveSetting(BOTS_REGISTRY_KEY, registry);
  }
}

// ---------------------------------------------------------------------------
// Install / consent
// ---------------------------------------------------------------------------

export class BotInstallError extends Error { }

export function sanitizeManifest(input: unknown): BotManifest {
  if (!isValidBotManifest(input)) {
    throw new BotInstallError('Invalid bot manifest');
  }
  const manifest = input as BotManifest;
  return {
    ...manifest,
    username: manifest.username.toLowerCase(),
    commands: manifest.commands.map((c) => ({ command: c.command.toLowerCase(), description: c.description })),
  };
}

/** Install a bot with explicit per-permission consent. */
export async function installBot(
  manifestInput: unknown,
  granted: readonly BotPermission[],
  storage: BotStorage,
  now = Date.now(),
): Promise<InstalledBot> {
  const manifest = sanitizeManifest(manifestInput);
  const registry = await storage.load();
  if (registry.bots.some((b) => b.manifest.id === manifest.id)) {
    throw new BotInstallError(`Bot already installed: ${manifest.id}`);
  }
  if (registry.bots.some((b) => b.manifest.username === manifest.username)) {
    throw new BotInstallError(`Username already taken: ${manifest.username}`);
  }
  const grantedSet = new Set(granted.filter((p) => (ALL_BOT_PERMISSIONS as readonly string[]).includes(p)));
  const installed: InstalledBot = {
    manifest,
    grantedPermissions: [...grantedSet],
    installedAt: now,
    enabled: true,
  };
  await storage.save({ bots: [...registry.bots, installed] });
  return installed;
}

/** Re-consent when a bot update requests new permissions. */
export async function grantAdditionalPermissions(
  botId: string,
  newPermissions: readonly BotPermission[],
  storage: BotStorage,
): Promise<InstalledBot> {
  const registry = await storage.load();
  const bot = registry.bots.find((b) => b.manifest.id === botId);
  if (!bot) throw new BotInstallError(`Bot not installed: ${botId}`);
  bot.grantedPermissions = [...new Set([...bot.grantedPermissions, ...newPermissions])];
  await storage.save(registry);
  return bot;
}

export async function uninstallBot(botId: string, storage: BotStorage): Promise<void> {
  const registry = await storage.load();
  await storage.save({ bots: registry.bots.filter((b) => b.manifest.id !== botId) });
}

export async function setBotEnabled(botId: string, enabled: boolean, storage: BotStorage): Promise<void> {
  const registry = await storage.load();
  const bot = registry.bots.find((b) => b.manifest.id === botId);
  if (!bot) throw new BotInstallError(`Bot not installed: ${botId}`);
  bot.enabled = enabled;
  await storage.save(registry);
}

/** Block or unblock a bot. A blocked bot receives no updates (Phase B8). */
export async function setBotBlocked(
  botId: string,
  blocked: boolean,
  storage: BotStorage,
): Promise<void> {
  const registry = await storage.load();
  const bot = registry.bots.find((b) => b.manifest.id === botId);
  if (!bot) throw new BotInstallError(`Bot not installed: ${botId}`);
  bot.blocked = blocked;
  await storage.save(registry);
}

/** Attach or detach an L2 gateway URL for a bot (Phase B6 / NovaFather). */
export async function setGatewayUrl(
  botId: string,
  gatewayUrl: string | undefined,
  storage: BotStorage,
): Promise<void> {
  const registry = await storage.load();
  const bot = registry.bots.find((b) => b.manifest.id === botId);
  if (!bot) throw new BotInstallError(`Bot not installed: ${botId}`);
  if (gatewayUrl !== undefined) {
    try { new URL(gatewayUrl); } catch { throw new BotInstallError('Gateway URL must be a valid URL'); }
  }
  bot.manifest.gatewayUrl = gatewayUrl;
  await storage.save(registry);
}

export function pendingConsent(installed: InstalledBot): BotPermission[] {
  return permissionsChanged(installed.grantedPermissions, installed.manifest.requestedPermissions);
}

// ---------------------------------------------------------------------------
// Bot context — the permission-gated API a bot module receives
// ---------------------------------------------------------------------------

/** Host-provided delivery sink: the only path from a bot to the UI/transport. */
export interface MessageSink {
  send(message: BotOutgoingMessage): Promise<void>;
  edit(edit: BotMessageEdit): Promise<boolean>;
  del(chatId: string, messageId: string): Promise<boolean>;
  answerCallback(queryId: string, options?: AnswerCallbackQueryOptions): Promise<void>;
  /** Send a typing indicator for the bot in a chat. */
  sendTyping(chatId: string, isTyping: boolean): Promise<void>;
}

export interface BotModule {
  /** Entry hook: the module registers its update handler here. */
  init(ctx: BotContext): void | Promise<void>;
}

/**
 * Local bot entry points are bundled at build time: a manifest's `entryPoint`
 * is a virtual path, not something `import()` can resolve at runtime. Only
 * modules under `examples/bots/` are accepted for L1 bots.
 */
const LOCAL_BOT_MODULES = import.meta.glob<{
  default?: BotModule;
  init?: BotModule['init'];
}>([
  '/examples/bots/echo/index.ts',
  '/examples/bots/novafather/index.ts',
  '/examples/bots/movie-catalog/index.ts',
]);

/**
 * Administrative operations for system bots (NovaFather). Supplied by
 * BotSession; every method additionally requires the `manage_bots` grant.
 */
export interface BotAdminApi {
  listBots(): readonly InstalledBot[];
  installBot(manifest: unknown, granted: readonly BotPermission[]): Promise<InstalledBot>;
  setBotEnabled(botId: string, enabled: boolean): Promise<void>;
  setGatewayUrl(botId: string, gatewayUrl: string | undefined): Promise<void>;
  setBotCommands(botId: string, commands: BotCommand[]): Promise<void>;
  setBotDescription(botId: string, description: string | undefined): Promise<void>;
  uninstallBot(botId: string): Promise<void>;
}

export interface BotContext {
  readonly manifest: BotManifest;
  readonly grantedPermissions: readonly BotPermission[];
  /** User's language code (e.g., 'en', 'ru', 'uk'). Updated per update. */
  readonly language: string;
  onUpdate(handler: (update: BotUpdate) => void | Promise<void>): void;
  sendMessage(chatId: string, text: string, options?: BotSendMessageOptions): Promise<BotOutgoingMessage>;
  editMessage(chatId: string, messageId: string, text: string, options?: BotSendMessageOptions): Promise<boolean>;
  deleteMessage(chatId: string, messageId: string): Promise<boolean>;
  answerCallbackQuery(queryId: string, options?: AnswerCallbackQueryOptions): Promise<void>;
  setCommands(commands: BotCommand[]): Promise<void>;
  /** Send a typing indicator for the bot in a chat. */
  sendTyping(chatId: string, isTyping: boolean): Promise<void>;
  /**
   * Bot-scoped key/value state (localStorage on this device). Keys are namespaced
   * by bot id, so one bot cannot read another bot's state. No secrets here:
   * manifests/permissions stay in the encrypted registry.
   */
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** Installed bots (requires `manage_bots`). */
  listBots(): Promise<InstalledBot[]>;
  /** Install a bot manifest (requires `manage_bots`). */
  installBot(manifest: unknown, granted: readonly BotPermission[]): Promise<InstalledBot>;
  /** Enable/disable an installed bot (requires `manage_bots`). */
  setBotEnabled(botId: string, enabled: boolean): Promise<void>;
  /** Attach or clear an L2/L3 gateway URL (requires `manage_bots`). */
  setGatewayUrl(botId: string, gatewayUrl: string | undefined): Promise<void>;
  /** Replace the command list of an installed bot (requires `manage_bots`). */
  setBotCommands(botId: string, commands: BotCommand[]): Promise<void>;
  /** Update the description of an installed bot (requires `manage_bots`). */
  setBotDescription(botId: string, description: string | undefined): Promise<void>;
  /** Remove an installed bot (requires `manage_bots`). */
  uninstallBot(botId: string): Promise<void>;
}

export class PermissionDeniedError extends Error { }

function hasPermission(permissions: readonly BotPermission[], needed: BotPermission): boolean {
  return permissions.includes(needed);
}

const COMMAND_MAX = 32;

export class BotRuntime {
  private readonly handlers = new Map<string, Array<(update: BotUpdate) => void | Promise<void>>>();
  private readonly updateLog: BotUpdate[] = [];
  private readonly rateLimit = new Map<number, { count: number; reset: number }>();
  private readonly RATE_LIMIT = 20; // messages per second
  private currentLanguage = 'en';
  private moduleLoaded = false;

  constructor(
    private readonly bot: InstalledBot,
    private readonly sink: MessageSink,
    private readonly storage: BotStorage,
    private readonly admin?: BotAdminApi,
  ) { }

  /** Build the sandboxed context for this bot (all calls permission-gated). */
  public createContext(): BotContext {
    const manifest = this.bot.manifest;
    const permissions = () => this.bot.grantedPermissions;
    const require = (needed: BotPermission): void => {
      if (!hasPermission(permissions(), needed)) {
        throw new PermissionDeniedError(`Bot ${manifest.id} lacks permission: ${needed}`);
      }
    };

    const self = this;
    const stateKey = (key: string) => `nova_bot_state_${manifest.id}_${key}`;
    const requireAdmin = (): BotAdminApi => {
      require('manage_bots');
      if (!self.admin) throw new PermissionDeniedError('Bot management is unavailable in this session');
      return self.admin;
    };
    return {
      manifest,
      storage: {
        get: async (key) => {
          try {
            return localStorage.getItem(stateKey(key));
          } catch {
            return null;
          }
        },
        set: async (key, value) => {
          try {
            localStorage.setItem(stateKey(key), value);
          } catch {
            /* quota/disabled storage: keep the bot running without state */
          }
        },
        remove: async (key) => {
          try {
            localStorage.removeItem(stateKey(key));
          } catch {
            /* ignore */
          }
        },
      },
      get grantedPermissions() {
        return [...permissions()];
      },
      get language() {
        return self.currentLanguage;
      },
      listBots: async () => [...requireAdmin().listBots()],
      installBot: async (manifestInput, granted) => requireAdmin().installBot(manifestInput, granted),
      setBotEnabled: async (botId, enabled) => requireAdmin().setBotEnabled(botId, enabled),
      setGatewayUrl: async (botId, gatewayUrl) => requireAdmin().setGatewayUrl(botId, gatewayUrl),
      setBotCommands: async (botId, commands) => requireAdmin().setBotCommands(botId, commands),
      setBotDescription: async (botId, description) => requireAdmin().setBotDescription(botId, description),
      uninstallBot: async (botId) => requireAdmin().uninstallBot(botId),
      onUpdate: (handler) => {
        const arr = this.handlers.get(manifest.id) ?? [];
        arr.push(handler);
        this.handlers.set(manifest.id, arr);
      },
      sendMessage: async (chatId, text, options) => {
        require('send_messages');
        if (typeof text !== 'string' || text.length === 0 || text.length > 4096) {
          throw new PermissionDeniedError('sendMessage: text must be 1..4096 chars');
        }
        let keyboard: InlineKeyboard | undefined;
        if (options?.keyboard !== undefined) {
          require('inline_keyboard');
          if (!isValidInlineKeyboard(options.keyboard)) {
            throw new PermissionDeniedError('sendMessage: invalid inline keyboard');
          }
          keyboard = options.keyboard;
        }
        // Handle photo (requires 'media' permission)
        if (options?.photo) {
          require('media');
          try {
            new URL(options.photo);
          } catch {
            throw new PermissionDeniedError('sendMessage: photo must be a valid URL');
          }
        }
        const message: BotOutgoingMessage = {
          messageId: `bot_${manifest.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          chat: { id: chatId, kind: 'direct' },
          text,
          keyboard,
          timestamp: Date.now(),
          photo: options?.photo,
          caption: options?.caption,
        };
        // Rate limit: ~20 msg/sec per bot.
        const now = Date.now();
        const slot = this.rateLimit.get(now) ?? { count: 0, reset: now + 1000 };
        if (now > slot.reset) slot.count = 0;
        slot.count += 1;
        this.rateLimit.set(now, slot);
        if (slot.count > this.RATE_LIMIT) {
          throw new PermissionDeniedError('sendMessage: rate limit exceeded');
        }
        await this.sink.send(message);
        return message;
      },
      editMessage: async (chatId, messageId, text, options) => {
        require('send_messages');
        if (options?.keyboard !== undefined) {
          require('inline_keyboard');
          if (!isValidInlineKeyboard(options.keyboard)) {
            throw new PermissionDeniedError('editMessage: invalid inline keyboard');
          }
        }
        return this.sink.edit({ chat: { id: chatId, kind: 'direct' }, messageId, text, keyboard: options?.keyboard });
      },
      deleteMessage: async (chatId, messageId) => {
        require('send_messages');
        return this.sink.del(chatId, messageId);
      },
      answerCallbackQuery: async (queryId, options) => {
        require('send_messages');
        await this.sink.answerCallback(queryId, options);
      },
      sendTyping: async (chatId, isTyping) => {
        require('send_messages');
        await this.sink.sendTyping(chatId, isTyping);
      },
      setCommands: async (commands) => {
        if (!Array.isArray(commands) || commands.length > 100) {
          throw new PermissionDeniedError('setCommands: up to 100 commands');
        }
        const normalized = commands.map((c) => ({ command: c.command.toLowerCase(), description: c.description }));
        if (!normalized.every((c) => isValidCommand(c.command) && typeof c.description === 'string')) {
          throw new PermissionDeniedError('setCommands: invalid command');
        }
        // setCommands updates the *installed* manifest, not the source module.
        const registry = await this.storage.load();
        const installed = registry.bots.find((b) => b.manifest.id === manifest.id);
        if (installed) {
          installed.manifest.commands = normalized.slice(0, COMMAND_MAX);
          await this.storage.save(registry);
        }
      },
    };
  }

  /** Feed an update to the bot. Disabled bots and blocked updates are dropped. */
  public async deliverUpdate(update: BotUpdate): Promise<boolean> {
    if (!this.bot.enabled) return false;
    // Mention-only (group privacy) mode: only commands, mentions and
    // callback queries get through.
    if (hasPermission(this.bot.grantedPermissions, 'mention_only')) {
      const payload = update.type === 'message' || update.type === 'edited_message' ? update.payload : null;
      const allowed =
        update.type === 'callback_query' ||
        (payload !== null && (payload.isCommand || payload.mentionsBot));
      if (!allowed) return false;
    }
    // Extract language from update payload
    let lang = 'en';
    if (update.type === 'message' || update.type === 'edited_message') {
      lang = update.payload.language || 'en';
    } else if (update.type === 'callback_query') {
      lang = update.payload.language || 'en';
    } else if (update.type === 'inline_query') {
      lang = update.payload.language || 'en';
    }
    this.currentLanguage = lang;

    this.updateLog.push(update);
    if (this.updateLog.length > 200) this.updateLog.shift();
    const handlers = this.handlers.get(this.bot.manifest.id);
    if (!handlers || handlers.length === 0) return false;
    let handled = false;
    for (const handler of handlers) {
      try {
        await handler(update);
        handled = true;
      } catch (err) {
        console.error(`Bot ${this.bot.manifest.id} handler error:`, err);
      }
    }
    return handled;
  }

  /** Recently delivered updates, for tests and diagnostics. */
  public recentUpdates(): readonly BotUpdate[] {
    return [...this.updateLog];
  }

  public updateTypesSeen(): BotUpdateType[] {
    return this.updateLog.map((u) => u.type);
  }

  /** Load the bot's entry-point module and run init(ctx) to register onUpdate handlers. */
  public async loadModule(): Promise<void> {
    if (this.moduleLoaded) return;
    this.moduleLoaded = true;
    const entryPoint = this.bot.manifest.entryPoint;
    if (!entryPoint) return;
    try {
      const normalized = entryPoint.replace(/^\.?\//, '');
      const loader = Object.entries(LOCAL_BOT_MODULES).find(
        ([path]) => path.replace(/^\//, '') === normalized,
      )?.[1];
      if (!loader) {
        console.error(`Bot ${this.bot.manifest.id} entryPoint is not a bundled local bot: ${entryPoint}`);
        return;
      }
      const mod = await loader();
      // Modules may export `init` directly or a BotModule object as default.
      const exported = mod.default ?? mod.init;
      const init = typeof exported === 'function' ? exported : exported?.init;
      if (typeof init === 'function') {
        await init(this.createContext());
      }
    } catch (err) {
      console.error(`Bot ${this.bot.manifest.id} loadModule error:`, err);
    }
  }
}

/** Create runtimes for every installed, enabled bot. */
export function createRuntimes(
  registry: BotRegistry,
  sink: MessageSink,
  storage: BotStorage,
): Map<string, BotRuntime> {
  const map = new Map<string, BotRuntime>();
  for (const bot of registry.bots) {
    map.set(bot.manifest.id, new BotRuntime(bot, sink, storage));
  }
  return map;
}

/** Dispatch an update to the bot that owns the chat, if any. */
export async function dispatchUpdate(
  runtimes: Map<string, BotRuntime>,
  botId: string,
  update: BotUpdate,
): Promise<boolean> {
  const runtime = runtimes.get(botId);
  if (!runtime) return false;
  return runtime.deliverUpdate(update);
}
