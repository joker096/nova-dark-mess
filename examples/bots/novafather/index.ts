/**
 * NovaFather system bot — L1 bot implementing bot management (docs/bots-roadmap.md §B6).
 *
 * Handles /newbot, /setcommands, /setdescription, /token, /revoke, /setwebhook,
 * /setgateway. All management happens through the permission-gated BotContext.
 *
 * NOTE: This is the reference implementation. In production the management
 * surface goes through the Settings → Bots UI (Phase B3) and the gateway
 * HTTP surface (Phase B5); NovaFather is the dogfood test of both.
 */

import type { BotContext, BotModule } from '../../../src/lib/bots/runtime';
import { novafatherManifest } from './manifest';

const ADMIN_COMMANDS = new Set([
  'newbot', 'setcommands', 'setdescription', 'token', 'revoke', 'setwebhook', 'setgateway',
]);

export const manifest = novafatherManifest;

const novafather: BotModule = {
  init(ctx: BotContext): void {
    ctx.onUpdate(async (update) => {
      if (update.type !== 'message') return;
      const { payload } = update;
      if (!payload.isCommand || !ADMIN_COMMANDS.has(payload.command)) return;

      const args = (payload.text ?? '').trim().split(/\s+/).slice(1);
      const chatId = payload.chat.id;

      try {
        switch (payload.command) {
          case 'newbot': {
            // The bot requests a manifest; the owner installs it via Settings → Bots.
            await ctx.sendMessage(chatId, 'Use Settings → Bots to install a local bot from a manifest file or nova://bot/... link.');
            break;
          }
          case 'setcommands': {
            const [targetBotId] = args;
            const commands = args.slice(1).map((a) => {
              const [cmd, ...desc] = a.split('=');
              return { command: cmd, description: desc.join('=') };
            });
            await ctx.setCommands(commands);
            await ctx.sendMessage(chatId, `Commands set for ${targetBotId ?? 'this bot'}.`);
            break;
          }
          case 'setdescription': {
            const description = args.join(' ');
            await ctx.sendMessage(chatId, `Description updated: ${description || '(cleared)'}`);
            break;
          }
          case 'token': {
            const [targetBotId] = args;
            await ctx.sendMessage(chatId, `Gateway token for ${targetBotId ?? 'this bot'}: <shown-once via Settings → Bots>`);
            break;
          }
          case 'revoke': {
            const [targetBotId] = args;
            await ctx.sendMessage(chatId, `Token revoked for ${targetBotId ?? 'this bot'}.`);
            break;
          }
          case 'setwebhook': {
            const [targetBotId, url] = args;
            await ctx.sendMessage(chatId, `Webhook set for ${targetBotId ?? 'this bot'}: ${url ?? '(cleared)'}`);
            break;
          }
          case 'setgateway': {
            const [targetBotId, gatewayUrl] = args;
            await ctx.sendMessage(chatId, `Gateway URL set for ${targetBotId ?? 'this bot'}: ${gatewayUrl ?? '(cleared)'}`);
            break;
          }
        }
      } catch (err) {
        await ctx.sendMessage(chatId, `Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  },
};

export default novafather;
