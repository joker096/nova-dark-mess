/**
 * Bot session bridge — connects the ChatScreen UI to bot runtimes
 * (docs/bots-roadmap.md, Phases B1/B2).
 *
 * In this milestone the echo example bot is auto-installed (dev fixture) so
 * the inline-keyboard/callback flow is testable end-to-end. Phase B3
 * replaces this with the Settings → Bots management UI; Phase B4 routes
 * outgoing messages through the encrypted MessageSink instead of local echo.
 */
import {
  BotInstallError,
  BotRuntime,
  InMemoryBotStorage,
  type BotRegistry,
  type BotStorage,
  type InstalledBot,
  type MessageSink,
  NOVA_BOTS,
  installBot,
  setBotBlocked,
  setBotEnabled,
  uninstallBot,
} from './runtime';
import type { BotPermission, BotOutgoingMessage, BotUpdate, BotCommand } from './types';
import { echoBotManifest } from '../../../examples/bots/echo/manifest';
import { novafatherManifest } from '../../../examples/bots/novafather/manifest';

/** Minimal delivery sink: bot output becomes a toast-level event for now. */
class LocalMessageSink implements MessageSink {
  public readonly delivered: BotOutgoingMessage[] = [];

  public async send(message: BotOutgoingMessage): Promise<void> {
    this.delivered.push(message);
  }

  public async edit(): Promise<boolean> {
    return false;
  }

  public async del(): Promise<boolean> {
    return false;
  }

  public async answerCallback(): Promise<void> {
    /* Toast presentation is handled by the ChatScreen callback hint. */
  }

  public async sendTyping(): Promise<void> {
    /* No-op for L1 local sink; ChatScreen handles typing via botTyping state. */
  }
}

export class BotSession {
  private storage: BotStorage = new InMemoryBotStorage();
  private sink: MessageSink = new LocalMessageSink();
  private registry: BotRegistry = { bots: [] };
  private runtimes = new Map<string, BotRuntime>();
  private ready: Promise<void> | null = null;

  constructor(
    /** Optional storage back-end. Defaults to in-memory; switch to encrypted via switchStorage() when the vault is ready. */
    storage?: BotStorage,
    /** Optional sink override. Defaults to LocalMessageSink (no-op). */
    sink?: MessageSink,
  ) {
    if (storage) this.storage = storage;
    if (sink) this.sink = sink;
  }

  /** Switch the registry storage (e.g. from in-memory to the encrypted vault) once it becomes available. */
  public switchStorage(storage: BotStorage): void {
    this.storage = storage;
    this.runtimes = this.buildRuntimes();
    void this.loadRuntimes();
  }

  private buildRuntimes(): Map<string, BotRuntime> {
    return new Map(
      this.registry.bots.map((bot) => [bot.manifest.id, new BotRuntime(bot, this.sink, this.storage)]),
    );
  }

  /** Load entry modules for every enabled, unblocked bot. Idempotent per runtime. */
  private async loadRuntimes(): Promise<void> {
    await Promise.all(
      this.registry.bots
        .filter((bot) => bot.enabled && !bot.blocked)
        .map((bot) => this.runtimes.get(bot.manifest.id)?.loadModule()),
    );
  }

  /** Idempotent session init: installs the dev fixture bot once. */
  public async ensureReady(): Promise<void> {
    if (!NOVA_BOTS) return;
    if (!this.ready) {
      this.ready = this.initialize();
    }
    return this.ready;
  }

  private async initialize(): Promise<void> {
    if (!NOVA_BOTS) return;
    // Start from the persisted registry: bots installed or blocked in a
    // previous session must survive a restart (the dev fixtures are only
    // added when missing, not used to replace the stored list).
    this.registry = await this.storage.load();
    const devFixtures = [echoBotManifest, novafatherManifest];
    for (const manifest of devFixtures) {
      if (!this.registry.bots.some((b) => b.manifest.id === manifest.id)) {
        const installed: InstalledBot = {
          manifest: { ...manifest, commands: manifest.commands.map((c) => ({ ...c })) },
          grantedPermissions: [...manifest.requestedPermissions],
          installedAt: Date.now(),
          enabled: true,
        };
        this.registry = { bots: [installed, ...this.registry.bots] };
        await this.storage.save(this.registry);
      }
    }
    this.runtimes = this.buildRuntimes();
    await this.loadRuntimes();
  }

  /** Gateway URL management (Phase B6 / NovaFather). */
  public async setGatewayUrl(botId: string, gatewayUrl: string | undefined): Promise<void> {
    await this.ensureReady();
    const registry = await this.storage.load();
    const bot = registry.bots.find((b) => b.manifest.id === botId);
    if (!bot) throw new BotInstallError(`Bot not installed: ${botId}`);
    if (gatewayUrl !== undefined) {
      try { new URL(gatewayUrl); } catch { throw new BotInstallError('Gateway URL must be a valid URL'); }
    }
    bot.manifest.gatewayUrl = gatewayUrl;
    await this.storage.save(registry);
  }

  public listBots(): readonly InstalledBot[] {
    return this.registry.bots;
  }

  public isBot(botId: string): boolean {
    return this.registry.bots.some((b) => b.manifest.id === botId);
  }

  /** True when the user blocked this bot; blocked bots receive no updates. */
  public isBlocked(botId: string): boolean {
    return this.registry.bots.some((b) => b.manifest.id === botId && b.blocked === true);
  }

  /** Block/unblock a bot and persist the decision (Phase B8). */
  public async setBlocked(botId: string, blocked: boolean): Promise<void> {
    await this.ensureReady();
    await setBotBlocked(botId, blocked, this.storage);
    this.registry = await this.storage.load();
    await this.rebuildRuntime(botId);
  }

  private async rebuildRuntime(botId: string): Promise<void> {
    const bot = this.registry.bots.find((b) => b.manifest.id === botId);
    if (!bot) {
      this.runtimes.delete(botId);
      return;
    }
    const runtime = new BotRuntime(bot, this.sink, this.storage);
    this.runtimes.set(botId, runtime);
    if (bot.enabled && !bot.blocked) await runtime.loadModule();
  }

  /** True when the bot is installed and not disabled/blocked. */
  private acceptsUpdates(botId: string): boolean {
    const bot = this.registry.bots.find((b) => b.manifest.id === botId);
    return Boolean(bot && bot.enabled && !bot.blocked);
  }

  /** Commands advertised by the bot, used by the slash-command menu in the composer. */
  public getBotCommands(botId: string): BotCommand[] {
    const bot = this.registry.bots.find((b) => b.manifest.id === botId);
    return bot?.manifest.commands ?? [];
  }

  /**
   * Dispatch a callback_query from ChatScreen. Returns true when a bot
   * runtime accepted the update.
   */
  public dispatchCallback(botId: string, chatId: string, messageId: string, callbackData: string): boolean {
    if (!this.acceptsUpdates(botId)) return false;
    const runtime = this.runtimes.get(botId);
    if (!runtime) return false;
    void runtime.deliverUpdate({
      type: 'callback_query',
      payload: {
        id: `q_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        chat: { id: chatId, kind: 'direct' },
        messageId,
        data: callbackData,
        from: 'me',
        timestamp: Date.now(),
      },
    });
    return true;
  }

  /**
   * Deliver an incoming update to a bot runtime. Returns true when a bot
   * runtime accepted the update. Accepts any BotUpdate (message, inline_query,
   * callback_query, ...).
   */
  public deliverUpdate(botId: string, update: BotUpdate): boolean {
    if (!this.acceptsUpdates(botId)) return false;
    const runtime = this.runtimes.get(botId);
    if (!runtime) return false;
    void runtime.deliverUpdate(update);
    return true;
  }

  /** Deliver an incoming message to a bot runtime (back-compat alias). */
  public deliverMessage(botId: string, update: { type: 'message'; payload: NonNullable<BotUpdate['payload']> }): boolean {
    return this.deliverUpdate(botId, update as BotUpdate);
  }

  /**
   * Set a custom message sink for bot output (used by ChatScreen to capture
   * bot responses in the local UI before they're sent via the encrypted sink).
   */
  public setMessageSink(sink: MessageSink): void {
    this.sink = sink;
    // Re-create runtimes with the new sink and re-register their handlers.
    this.runtimes = this.buildRuntimes();
    void this.loadRuntimes();
  }

  /** Install a bot with explicit per-permission consent (Phase B3). */
  public async installBot(
    manifestInput: unknown,
    granted: readonly BotPermission[],
  ): Promise<InstalledBot> {
    await this.ensureReady();
    const installed = await installBot(manifestInput, granted, this.storage);
    this.registry = await this.storage.load();
    this.runtimes = this.buildRuntimes();
    await this.loadRuntimes();
    return installed;
  }

  public async setBotEnabled(botId: string, enabled: boolean): Promise<void> {
    await this.ensureReady();
    await setBotEnabled(botId, enabled, this.storage);
    this.registry = await this.storage.load();
    // The runtime keeps a snapshot of the bot, so rebuild it or the new
    // enabled state would not be visible to deliverUpdate().
    await this.rebuildRuntime(botId);
  }

  public async uninstallBot(botId: string): Promise<void> {
    await this.ensureReady();
    await uninstallBot(botId, this.storage);
    this.registry = await this.storage.load();
    this.runtimes.delete(botId);
  }
}

/** App-wide bot session singleton (one per app lifetime). NovaFather and other
 * system bots use it for administrative operations (install, setGatewayUrl, …). */
export const botSession = new BotSession();

