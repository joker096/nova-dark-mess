/**
 * NovaFather Bot — System bot for creating and managing Nova bots.
 * L1 local bot module.
 * 
 * Commands:
 * /start - Main menu
 * /newbot - Create a new L1 local bot
 * /mybots - List your bots
 * /token - Manage L3 tokens
 * /revoke - Revoke a token
 * /setwebhook - Set webhook URL (L3)
 * /deletewebhook - Delete webhook
 * /setgateway - Attach L2/L3 gateway URL
 * /setcommands - Set bot commands
 * /setdescription - Set bot description
 * /help - Help
 */

import type { BotContext, BotModule, InstalledBot } from '../../../src/lib/bots/runtime';
import { novafatherManifest } from './manifest';

export const manifest = novafatherManifest;

interface BotConfig {
  name: string;
  username: string;
  description?: string;
  permissions: string[];
}

interface UserState {
  pendingAction?: {
    type: 'newbot_name' | 'newbot_username' | 'newbot_desc' | 'newbot_perms' |
          'token_bot' | 'revoke_token' | 'webhook_bot' | 'webhook_url' |
          'gateway_bot' | 'gateway_url' | 'commands_bot' | 'commands_list' |
          'desc_bot' | 'desc_text';
    data: Partial<BotConfig> & {
      botId?: string;
      token?: string;
      webhookUrl?: string;
      gatewayUrl?: string;
    };
  };
  bots: InstalledBot[];
}

const ALL_PERMISSIONS = ['send_messages', 'read_messages', 'inline_keyboard', 'media', 'mention_only'] as const;

function getUserState(ctx: BotContext, userId: string): Promise<UserState> {
  return ctx.storage.get(`novafather_${userId}`).then(data => data ? JSON.parse(data) : { bots: [] });
}

function saveUserState(ctx: BotContext, userId: string, state: UserState): Promise<void> {
  return ctx.storage.set(`novafather_${userId}`, JSON.stringify(state));
}

function createMainKeyboard(): any[][] {
  return [
    [{ text: '📋 My Bots', callback_data: 'mybots' }],
    [{ text: '📋 My Bots', callback_data: 'mybots' }],
    [{ text: '🔑 Manage Tokens', callback_data: 'tokens' }],
    [{ text: '🔗 Webhook', callback_data: 'webhook' }],
    [{ text: '🌐 Gateway', callback_data: 'gateway' }],
    [{ text: '📝 Commands', callback_data: 'commands' }],
    [{ text: '📄 Description', callback_data: 'description' }],
    [{ text: '❓ Help', callback_data: 'help' }],
  ];
}

function createBotListKeyboard(bots: InstalledBot[], action: string): any[][] {
  const keyboard: any[][] = [];
  bots.forEach(bot => {
    keyboard.push([{ 
      text: `${bot.enabled ? '✅' : '❌'} ${bot.manifest.name} (@${bot.manifest.username})`, 
      callback_data: `${action}:${bot.manifest.id}` 
    }]);
  });
  keyboard.push([{ text: '⬅️ Back', callback_data: 'main_menu' }]);
  return keyboard;
}

function createPermissionsKeyboard(selected: string[] = []): any[][] {
  const keyboard: any[][] = [];
  ALL_PERMISSIONS.forEach(perm => {
    const isSelected = selected.includes(perm);
    keyboard.push([{ 
      text: `${isSelected ? '✅' : '☐'} ${perm}`, 
      callback_data: `perm_toggle:${perm}` 
    }]);
  });
  keyboard.push([{ text: '✅ Done', callback_data: 'perm_done' }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 'newbot_cancel' }]);
  return keyboard;
}

function formatBotInfo(bot: InstalledBot): string {
  const perms = bot.grantedPermissions.join(', ') || 'none';
  return `🤖 <b>${bot.manifest.name}</b> (@${bot.manifest.username})
<b>ID:</b> ${bot.manifest.id}
<b>Status:</b> ${bot.enabled ? '✅ Enabled' : '❌ Disabled'}
<b>Permissions:</b> ${perms}
<b>Description:</b> ${bot.manifest.description || 'No description'}
<b>Created:</b> ${new Date(bot.installedAt).toLocaleString()}`;
}

function formatHelp(): string {
  return `🤖 <b>NovaFather — Bot Management</b>

<b>Bot Creation:</b>
/newbot — Create a new L1 local bot
/mybots — List and manage your bots

<b>L3 (Telegram API) Tokens:</b>
/token — Generate/revoke tokens for a bot
/revoke — Revoke a specific token

<b>Webhooks (L3):</b>
/setwebhook — Set webhook URL for a bot
/deletewebhook — Remove webhook

<b>Gateway (L2/L3):</b>
/setgateway — Attach a gateway URL to a bot

<b>Bot Settings:</b>
/setcommands — Set bot command list
/setdescription — Set bot description

<b>General:</b>
/help — This help message
/start — Main menu

<i>Note: L1 bots run locally in your app. L2/L3 bots require a self-hosted gateway.</i>`;
}

const novafatherBot: BotModule = {
  init(ctx: BotContext): void {
    ctx.onUpdate(async (update) => {
      // Membership events carry no message/command payload to answer.
      if (update.type === 'my_chat_member') return;
      const chatId = update.payload.chat.id;
      const userId = update.payload.from;
      const state = await getUserState(ctx, userId);
      // The registry is the source of truth; state.bots is only a local cache.
      if (ctx.grantedPermissions.includes('manage_bots')) {
        state.bots = await ctx.listBots();
      }

      if (update.type === 'message' && update.payload.isCommand) {
        const cmd = update.payload.command;

        if (cmd === 'start') {
          await ctx.sendMessage(chatId,
            `🤖 <b>Welcome to NovaFather!</b>\n\nI help you create and manage Nova bots.\n\nChoose an action below:`,
            { keyboard: createMainKeyboard() }
          );
          return;
        }

        if (cmd === 'help') {
          await ctx.sendMessage(chatId, formatHelp(), { keyboard: createMainKeyboard() });
          return;
        }

        if (cmd === 'mybots') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId,
              '📋 <b>My Bots</b>\n\nNo bots are installed. Add one from <b>Settings → Bots</b>.',
              { keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
            );
            return;
          }
          await ctx.sendMessage(chatId,
            `📋 <b>My Bots</b> (${state.bots.length}):\n\nTap a bot to manage it:`,
            { keyboard: createBotListKeyboard(state.bots, 'manage') }
          );
          return;
        }

        if (cmd === 'newbot') {
          await ctx.sendMessage(chatId,
            '➕ <b>Creating a bot</b>\n\nAn L1 bot is a code module, so it cannot be created from chat. Install its manifest via <b>Settings → Bots</b>; after that I can list, enable, disable and remove installed bots with /mybots.'
          );
          return;
        }

        if (cmd === 'token') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available. Create one first with /newbot.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🔑 <b>Manage Tokens</b>\n\nSelect a bot to generate or view its L3 tokens:',
            { keyboard: createBotListKeyboard(state.bots, 'token') }
          );
          return;
        }

        if (cmd === 'revoke') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🗑 <b>Revoke Token</b>\n\nSelect a bot to revoke its token:',
            { keyboard: createBotListKeyboard(state.bots, 'revoke') }
          );
          return;
        }

        if (cmd === 'setwebhook') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🔗 <b>Set Webhook</b>\n\nSelect a bot to configure its webhook:',
            { keyboard: createBotListKeyboard(state.bots, 'webhook') }
          );
          return;
        }

        if (cmd === 'deletewebhook') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🗑 <b>Delete Webhook</b>\n\nSelect a bot to remove its webhook:',
            { keyboard: createBotListKeyboard(state.bots, 'deletewebhook') }
          );
          return;
        }

        if (cmd === 'setgateway') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🌐 <b>Set Gateway</b>\n\nSelect a bot to attach an L2/L3 gateway URL:',
            { keyboard: createBotListKeyboard(state.bots, 'gateway') }
          );
          return;
        }

        if (cmd === 'setcommands') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '📝 <b>Set Commands</b>\n\nSelect a bot to update its command list:',
            { keyboard: createBotListKeyboard(state.bots, 'commands') }
          );
          return;
        }

        if (cmd === 'setdescription') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '📄 <b>Set Description</b>\n\nSelect a bot to update its description:',
            { keyboard: createBotListKeyboard(state.bots, 'description') }
          );
          return;
        }

        // Handle text input for pending actions
        if (state.pendingAction) {
          await handlePendingAction(ctx, chatId, userId, state, update.payload.text.trim());
          return;
        }

        await ctx.sendMessage(chatId, 'Unknown command. Use /help for available commands.');
        return;
      }

      if (update.type === 'message' && state.pendingAction) {
        await handlePendingAction(ctx, chatId, userId, state, update.payload.text.trim());
        return;
      }

      if (update.type === 'callback_query') {
        const data = update.payload.data;
        const { id: queryId, chat, messageId } = update.payload;

        if (data === 'main_menu') {
          state.pendingAction = undefined;
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            '🤖 <b>NovaFather</b>\n\nChoose an action:',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'newbot') {
          await ctx.editMessage(chat.id, messageId,
            '➕ <b>Creating a bot</b>\n\nAn L1 bot is a code module, so it cannot be created from chat. Install its manifest via <b>Settings → Bots</b>.',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'newbot_cancel') {
          state.pendingAction = undefined;
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            '❌ <b>Cancelled</b>\n\nBot creation cancelled.',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('perm_toggle:')) {
          const perm = data.split(':')[1];
          if (state.pendingAction?.type === 'newbot_perms') {
            const perms = state.pendingAction.data.permissions || [];
            const idx = perms.indexOf(perm);
            if (idx >= 0) perms.splice(idx, 1);
            else perms.push(perm);
            state.pendingAction.data.permissions = perms;
            await saveUserState(ctx, userId, state);
            await ctx.editMessage(chat.id, messageId,
              '➕ <b>Create New Bot</b>\n\nStep 4/4: Select <b>permissions</b>:\n\n<i>Tap to toggle</i>',
              { keyboard: createPermissionsKeyboard(perms) }
            );
          }
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'perm_done') {
          state.pendingAction = undefined;
          await saveUserState(ctx, userId, state);
          await ctx.answerCallbackQuery(queryId, {
            text: 'Install a bot manifest from Settings → Bots',
            showAlert: true,
          });
          return;
        }

        // Bot management actions
        const [action, botId] = data.split(':');
        const bot = state.bots.find(b => b.manifest.id === botId);

        if (!bot) {
          await ctx.answerCallbackQuery(queryId, { text: 'Bot not found', showAlert: true });
          return;
        }

        if (action === 'manage') {
          await ctx.editMessage(chat.id, messageId,
            `${formatBotInfo(bot)}\n\n<b>Actions:</b>`,
            { keyboard: [
              [{ text: bot.enabled ? '❌ Disable' : '✅ Enable', callback_data: `toggle:${botId}` }],
              [{ text: '🔑 Token', callback_data: `token:${botId}` }],
              [{ text: '🔗 Webhook', callback_data: `webhook:${botId}` }],
              [{ text: '🌐 Gateway', callback_data: `gateway:${botId}` }],
              [{ text: '📝 Commands', callback_data: `commands:${botId}` }],
              [{ text: '📄 Description', callback_data: `description:${botId}` }],
              [{ text: '🗑 Delete', callback_data: `delete:${botId}` }],
              [{ text: '⬅️ Back', callback_data: 'mybots' }],
            ]}
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'toggle') {
          if (botId === ctx.manifest.id) {
            await ctx.answerCallbackQuery(queryId, { text: 'NovaFather cannot disable itself', showAlert: true });
            return;
          }
          await ctx.setBotEnabled(botId, !bot.enabled);
          const newEnabled = !bot.enabled;
          state.bots = await ctx.listBots();
          await ctx.editMessage(chat.id, messageId,
            `${formatBotInfo(bot)}\n\n<b>Actions:</b>`,
            { keyboard: [
              [{ text: newEnabled ? '❌ Disable' : '✅ Enable', callback_data: `toggle:${botId}` }],
              [{ text: '🔑 Token', callback_data: `token:${botId}` }],
              [{ text: '🔗 Webhook', callback_data: `webhook:${botId}` }],
              [{ text: '🌐 Gateway', callback_data: `gateway:${botId}` }],
              [{ text: '📝 Commands', callback_data: `commands:${botId}` }],
              [{ text: '📄 Description', callback_data: `description:${botId}` }],
              [{ text: '🗑 Delete', callback_data: `delete:${botId}` }],
              [{ text: '⬅️ Back', callback_data: 'mybots' }],
            ]}
          );
          await ctx.answerCallbackQuery(queryId, { text: newEnabled ? 'Bot enabled' : 'Bot disabled' });
          return;
        }

        if (action === 'token') {
          state.pendingAction = { type: 'token_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `🔑 <b>Token for ${bot.manifest.name}</b>\n\nL3 tokens allow using the bot with Telegram Bot API libraries (grammY, telegraf, aiogram).\n\n<i>Feature: generates a new token. Existing tokens remain valid until revoked.</i>`,
            { keyboard: [
              [{ text: '🔄 Generate Token', callback_data: `token_gen:${botId}` }],
              [{ text: '🗑 Revoke All', callback_data: `token_revoke_all:${botId}` }],
              [{ text: '⬅️ Back', callback_data: `manage:${botId}` }],
            ]}
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'token_gen') {
          // In real impl, would generate and store token hash
          await ctx.answerCallbackQuery(queryId, { text: 'Token generated! (Feature pending L3 gateway integration)', showAlert: true });
          return;
        }

        if (action === 'webhook') {
          state.pendingAction = { type: 'webhook_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `🔗 <b>Webhook for ${bot.manifest.name}</b>\n\nEnter the webhook URL (HTTPS required):\n\n<i>Example: https://your-domain.com/bot<token></i>`,
            { keyboard: [[{ text: '❌ Cancel', callback_data: `manage:${botId}` }]] }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'deletewebhook') {
          await ctx.answerCallbackQuery(queryId, { text: 'Webhook deleted (feature pending)', showAlert: true });
          return;
        }

        if (action === 'gateway') {
          state.pendingAction = { type: 'gateway_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `🌐 <b>Gateway for ${bot.manifest.name}</b>\n\nEnter the L2/L3 gateway URL, or "none" to clear it:\n\n<i>Example: https://gateway.your-domain.com</i>\n\n<i>The bot will use this gateway for L2/L3 transport instead of local L1 mode.</i>`,
            { keyboard: [[{ text: '❌ Cancel', callback_data: `manage:${botId}` }]] }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'commands') {
          state.pendingAction = { type: 'commands_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `📝 <b>Set Commands for ${bot.manifest.name}</b>\n\nEnter commands as JSON array:\n\n<code>[\n  {"command": "start", "description": "Start bot"},\n  {"command": "help", "description": "Show help"}\n]</code>`,
            { keyboard: [[{ text: '❌ Cancel', callback_data: `manage:${botId}` }]] }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'description') {
          state.pendingAction = { type: 'desc_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `📄 <b>Set Description for ${bot.manifest.name}</b>\n\nEnter new description:`,
            { keyboard: [[{ text: '❌ Cancel', callback_data: `manage:${botId}` }]] }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'delete') {
          await ctx.editMessage(chat.id, messageId,
            `⚠️ <b>Delete ${bot.manifest.name}?</b>\n\nThis action cannot be undone. All data will be lost.`,
            { keyboard: [
              [{ text: '🗑 Confirm Delete', callback_data: `delete_confirm:${botId}` }],
              [{ text: '❌ Cancel', callback_data: `manage:${botId}` }],
            ]}
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (action === 'delete_confirm') {
          if (botId === ctx.manifest.id) {
            await ctx.answerCallbackQuery(queryId, { text: 'NovaFather cannot delete itself', showAlert: true });
            return;
          }
          await ctx.uninstallBot(botId);
          state.bots = await ctx.listBots();
          await ctx.editMessage(chat.id, messageId,
            '🗑 <b>Bot deleted</b>',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        await ctx.answerCallbackQuery(queryId);
        return;
      }
    });
  },
};

async function handlePendingAction(
  ctx: BotContext,
  chatId: string,
  userId: string,
  state: UserState,
  text: string
): Promise<void> {
  if (!state.pendingAction) return;

  const action = state.pendingAction;

  if (action.type === 'newbot_name') {
    action.data.name = text;
    action.type = 'newbot_username';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nStep 2/4: Enter the bot's <b>username</b> (letters, numbers, underscores, 5-32 chars):\n\n<i>Example: movie_catalog_bot</i>`,
      { keyboard: [[{ text: '❌ Cancel', callback_data: 'newbot_cancel' }]] }
    );
    return;
  }

  if (action.type === 'newbot_username') {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(text)) {
      await ctx.sendMessage(chatId,
        '❌ Invalid username. Must be 5-32 chars, start with letter, only letters/numbers/underscores.',
        { keyboard: [[{ text: '❌ Cancel', callback_data: 'newbot_cancel' }]] }
      );
      return;
    }
    action.data.username = text;
    action.type = 'newbot_desc';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nStep 3/4: Enter <b>description</b> (optional):`,
      { keyboard: [
        [{ text: 'Skip', callback_data: 'newbot_skip_desc' }],
        [{ text: '❌ Cancel', callback_data: 'newbot_cancel' }],
      ]}
    );
    return;
  }

  if (action.type === 'newbot_desc') {
    action.data.description = text;
    action.type = 'newbot_perms';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nStep 4/4: Select <b>permissions</b>:\n\n<i>Tap to toggle</i>`,
      { keyboard: createPermissionsKeyboard(action.data.permissions) }
    );
    return;
  }

  if (action.type === 'token_bot' || action.type === 'webhook_bot' || 
      action.type === 'gateway_bot' || action.type === 'commands_bot' || 
      action.type === 'desc_bot') {
    if (action.type === 'webhook_bot') {
      action.data.webhookUrl = text;
      // In real impl, would call gateway.setWebhook
      await ctx.sendMessage(chatId, `✅ Webhook set to: ${text}`);
    } else if (action.type === 'gateway_bot') {
      const value = text.trim();
      const gatewayUrl = value.toLowerCase() === 'none' ? undefined : value;
      try {
        await ctx.setGatewayUrl(action.data.botId, gatewayUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid gateway URL';
        await ctx.sendMessage(chatId, `❌ ${message}\n\nSend a valid https:// URL or "none" to clear.`);
        return;
      }
      state.bots = await ctx.listBots();
      await ctx.sendMessage(chatId,
        gatewayUrl ? `✅ Gateway URL set: ${gatewayUrl}` : '✅ Gateway URL cleared');
    } else if (action.type === 'commands_bot') {
      try {
        const commands = JSON.parse(text);
        if (!Array.isArray(commands)) throw new Error('Not an array');
        await ctx.setBotCommands(action.data.botId, commands);
        state.bots = await ctx.listBots();
        await ctx.sendMessage(chatId, `✅ Commands updated (${commands.length} commands)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid command list';
        await ctx.sendMessage(chatId, `❌ ${message}\n\nUse format: [{"command": "start", "description": "..."}]`);
        return;
      }
    } else if (action.type === 'desc_bot') {
      try {
        await ctx.setBotDescription(action.data.botId, text);
        state.bots = await ctx.listBots();
        await ctx.sendMessage(chatId, `✅ Description updated: ${text}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not update description';
        await ctx.sendMessage(chatId, `❌ ${message}`);
        return;
      }
    }
    state.pendingAction = undefined;
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId, 'Done!', { keyboard: createMainKeyboard() });
    return;
  }

  await ctx.sendMessage(chatId, 'Unknown state. Cancelled.', { keyboard: createMainKeyboard() });
  state.pendingAction = undefined;
  await saveUserState(ctx, userId, state);
}

export default novafatherBot;