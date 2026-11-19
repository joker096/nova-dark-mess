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
  type InstalledBot,
  type MessageSink,
  NOVA_BOTS,
  installBot,
  setBotEnabled,
  uninstallBot,
} from './runtime';
import type { BotPermission } from './types';
import type { BotOutgoingMessage } from './types';
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
}

export class BotSession {
  private readonly storage = new InMemoryBotStorage();
  private readonly sink = new LocalMessageSink();
  private registry: BotRegistry = { bots: [] };
  private runtimes = new Map<string, BotRuntime>();
  private ready: Promise<void> | null = null;

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
    this.runtimes = new Map(
      this.registry.bots.map((bot) => [bot.manifest.id, new BotRuntime(bot, this.sink, this.storage)]),
    );
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

  /**
   * Dispatch a callback_query from ChatScreen. Returns true when a bot
   * runtime accepted the update.
   */
  public dispatchCallback(botId: string, chatId: string, messageId: string, callbackData: string): boolean {
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

  /** Install a bot with explicit per-permission consent (Phase B3). */
  public async installBot(
    manifestInput: unknown,
    granted: readonly BotPermission[],
  ): Promise<InstalledBot> {
    await this.ensureReady();
    const installed = await installBot(manifestInput, granted, this.storage);
    this.registry = await this.storage.load();
    this.runtimes = new Map(
      this.registry.bots.map((bot) => [bot.manifest.id, new BotRuntime(bot, this.sink, this.storage)]),
    );
    return installed;
  }

  public async setBotEnabled(botId: string, enabled: boolean): Promise<void> {
    await this.ensureReady();
    await setBotEnabled(botId, enabled, this.storage);
    this.registry = await this.storage.load();
  }

  public async uninstallBot(botId: string): Promise<void> {
    await this.ensureReady();
    await uninstallBot(botId, this.storage);
    this.registry = await this.storage.load();
    this.runtimes.delete(botId);
  }
}

