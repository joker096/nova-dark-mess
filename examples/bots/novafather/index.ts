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
  permissions: BotPermissionName[];
  /** Bundled module the installed manifest runs (set on the last step). */
  entryPoint?: string;
  commands?: { command: string; description: string }[];
}

type BotPermissionName = 'send_messages' | 'read_messages' | 'inline_keyboard' | 'media' | 'mention_only';

interface UserState {
  pendingAction?: {
    type: 'newbot_name' | 'newbot_username' | 'newbot_desc' | 'newbot_perms' |
          'gateway_bot' | 'gateway_url' | 'peer_bot' | 'commands_bot' |
          'commands_list' | 'desc_bot' | 'desc_text';
    data: Partial<BotConfig> & {
      botId?: string;
    };
  };
  bots: InstalledBot[];
}

const ALL_PERMISSIONS: readonly BotPermissionName[] = ['send_messages', 'read_messages', 'inline_keyboard', 'media', 'mention_only'];

function getUserState(ctx: BotContext, userId: string): Promise<UserState> {
  return ctx.storage.get(`novafather_${userId}`).then(data => data ? JSON.parse(data) : { bots: [] });
}

function saveUserState(ctx: BotContext, userId: string, state: UserState): Promise<void> {
  return ctx.storage.set(`novafather_${userId}`, JSON.stringify(state));
}

function createMainKeyboard(): any[][] {
  return [
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

function createPermissionsKeyboard(selected: BotPermissionName[] = []): any[][] {
  const keyboard: any[][] = [];
  ALL_PERMISSIONS.forEach(perm => {
    const isSelected = selected.includes(perm);
    keyboard.push([{ 
      text: `${isSelected ? '✅' : '☐'} ${perm}`, 
      callback_data: `perm_toggle:${perm}` 
    }]);
  });
  keyboard.push([{ text: '✅ Done', callback_data: 'perm_done' }]);
  // `perm_done` installs the drafted manifest (see the newbot flow).
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
/newbot — Install a new local bot (manifest)
/mybots — List and manage your bots

<b>L3 (Telegram API) Tokens:</b>
/token — Generate/revoke tokens for a bot
/revoke — Revoke a specific token

<b>Webhooks (L3):</b>
/setwebhook — Set webhook URL for a bot
/deletewebhook — Remove webhook

<b>Gateway (L2/L3):</b>
/setgateway — Attach a gateway URL to a bot
/setpeer — Set the bot's mesh fingerprint (for groups)

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
          await startNewBot(ctx, chatId, userId, state);
          return;
        }

        if (cmd === 'token' || cmd === 'revoke') {
          await ctx.sendMessage(chatId,
            '🔑 <b>L3 tokens are issued by the gateway</b>\n\n' +
            'The app never creates or stores bot tokens: the gateway does, in its '
            + '<code>botToken</code> option. Start the gateway with that token and '
            + 'it will authenticate <code>/bot&lt;token&gt;/…</code> requests. '
            + 'Revoke a token by restarting the gateway with a new one.'
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

        if (cmd === 'setpeer') {
          if (state.bots.length === 0) {
            await ctx.sendMessage(chatId, 'No bots available.');
            return;
          }
          await ctx.sendMessage(chatId,
            '🆔 <b>Set Peer Fingerprint</b>\n\nSelect a bot to attach its mesh fingerprint (printed by the gateway CLI or returned by getMe):',
            { keyboard: createBotListKeyboard(state.bots, 'peer') }
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
          await ctx.answerCallbackQuery(queryId);
          await startNewBot(ctx, chat.id, userId, state);
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

        if (data === 'newbot_skip_desc') {
          if (state.pendingAction?.type !== 'newbot_desc') {
            await ctx.answerCallbackQuery(queryId);
            return;
          }
          state.pendingAction.type = 'newbot_perms';
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            '➕ <b>Create New Bot</b>\n\nSelect <b>permissions</b>, then tap Done:\n\n<i>Tap to toggle</i>',
            { keyboard: createPermissionsKeyboard(state.pendingAction.data.permissions) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'mybots') {
          await ctx.editMessage(chat.id, messageId,
            state.bots.length > 0
              ? `📋 <b>My Bots</b> (${state.bots.length}):\n\nTap a bot to manage it:`
              : '📋 <b>My Bots</b>\n\nNo bots are installed. Add one from <b>Settings → Bots</b>.',
            { keyboard: state.bots.length > 0 ? createBotListKeyboard(state.bots, 'manage') : createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'tokens') {
          await ctx.editMessage(chat.id, messageId,
            '🔑 <b>L3 tokens are issued by the gateway</b>\n\nThe app never creates or stores bot tokens; the gateway does, in its <code>botToken</code> option. Restart it with a new token to revoke the old one.',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'webhook') {
          await ctx.editMessage(chat.id, messageId,
            '🔗 <b>Webhooks are gateway-side</b>\n\nCall <code>setWebhook</code> on the bot gateway (or use the gateway API). The local app only attaches the gateway URL to a bot with 🌐 Gateway.',
            { keyboard: createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'gateway' || data === 'commands' || data === 'description') {
          await ctx.editMessage(chat.id, messageId,
            state.bots.length > 0
              ? `Select a bot to update its ${data}:`
              : 'No bots are installed.',
            { keyboard: state.bots.length > 0 ? createBotListKeyboard(state.bots, data) : createMainKeyboard() }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'help') {
          await ctx.editMessage(chat.id, messageId, formatHelp(), { keyboard: createMainKeyboard() });
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('perm_toggle:') && state.pendingAction?.type === 'newbot_perms') {
          const perm = data.split(':')[1] as BotPermissionName;
          if (ALL_PERMISSIONS.includes(perm)) {
            const perms = state.pendingAction.data.permissions || [];
            const idx = perms.indexOf(perm);
            if (idx >= 0) perms.splice(idx, 1);
            else perms.push(perm);
            state.pendingAction.data.permissions = perms;
            await saveUserState(ctx, userId, state);
            await ctx.editMessage(chat.id, messageId,
              '➕ <b>Create New Bot</b>\n\nSelect <b>permissions</b>, then tap Done:\n\n<i>Tap to toggle</i>',
              { keyboard: createPermissionsKeyboard(perms) }
            );
          }
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'perm_done') {
          if (state.pendingAction?.type !== 'newbot_perms') {
            await ctx.answerCallbackQuery(queryId);
            return;
          }
          const draft = state.pendingAction.data;
          state.pendingAction = undefined;
          try {
            const installed = await ctx.installBotFromDraft({
              entryPoint: draft.entryPoint ?? '',
              name: draft.name ?? '',
              username: draft.username ?? '',
              description: draft.description,
              commands: draft.commands,
              permissions: draft.permissions ?? [],
            });
            state.bots = await ctx.listBots();
            await saveUserState(ctx, userId, state);
            await ctx.editMessage(chat.id, messageId,
              `✅ <b>Bot installed</b>\n\n<b>${installed.manifest.name}</b> (@${installed.manifest.username})\n<b>Module:</b> <code>${installed.manifest.entryPoint}</code>\n\nThe module runs locally after the app reloads. Manage it with /mybots.`,
              { keyboard: createMainKeyboard() }
            );
            await ctx.answerCallbackQuery(queryId, { text: 'Bot installed' });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not install the bot';
            await saveUserState(ctx, userId, state);
            await ctx.editMessage(chat.id, messageId,
              `❌ <b>Not installed</b>\n\n${message}`,
              { keyboard: createMainKeyboard() }
            );
            await ctx.answerCallbackQuery(queryId, { text: 'Install failed', showAlert: true });
          }
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
              [{ text: '🆔 Peer ID', callback_data: `peer:${botId}` }],
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
              [{ text: '🆔 Peer ID', callback_data: `peer:${botId}` }],
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
          await ctx.answerCallbackQuery(queryId, {
            text: 'L3 tokens live in the gateway config, not in the app',
            showAlert: true,
          });
          return;
        }

        if (action === 'webhook' || action === 'deletewebhook') {
          await ctx.answerCallbackQuery(queryId, {
            text: 'Webhooks are configured on the gateway with setWebhook',
            showAlert: true,
          });
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

        if (action === 'peer') {
          state.pendingAction = { type: 'peer_bot', data: { botId } };
          await saveUserState(ctx, userId, state);
          await ctx.editMessage(chat.id, messageId,
            `🆔 <b>Peer fingerprint for ${bot.manifest.name}</b>\n\nEnter the fingerprint printed by the gateway CLI (or <code>getMe</code>), or "none" to clear it:\n\n<i>Group frames will be delivered to this fingerprint over an encrypted 1:1 session.</i>`,
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

async function startNewBot(
  ctx: BotContext,
  chatId: string,
  userId: string,
  state: UserState,
): Promise<void> {
  state.pendingAction = { type: 'newbot_name', data: { permissions: [] } };
  await saveUserState(ctx, userId, state);
  await ctx.sendMessage(chatId,
    '➕ <b>Create New Bot</b>\n\nEnter the bot\'s <b>name</b>.\n\n<i>The bot is installed as a manifest: its code module must already be bundled in the app or arrive with the manifest. Nothing is downloaded and no key is created here.</i>',
    { keyboard: [[{ text: '❌ Cancel', callback_data: 'newbot_cancel' }]] }
  );
}

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
    if (!text.trim()) {
      await ctx.sendMessage(chatId, '❌ Name cannot be empty. Enter the bot name:');
      return;
    }
    action.data.name = text.slice(0, 64);
    action.type = 'newbot_username';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nEnter the bot's <b>username</b> (a-z, 0-9, _, must end with "bot"):\n\n<i>Example: movie_catalog_bot</i>`,
      { keyboard: [[{ text: '❌ Cancel', callback_data: 'newbot_cancel' }]] }
    );
    return;
  }

  if (action.type === 'newbot_username') {
    // Same rule the manifest validator applies (isValidBotUsername).
    if (!/^[a-z][a-z0-9_]{2,31}bot$/.test(text.toLowerCase())) {
      await ctx.sendMessage(chatId,
        '❌ Invalid username. 5-32 chars, a-z/0-9/_, must end with "bot".',
        { keyboard: [[{ text: '❌ Cancel', callback_data: 'newbot_cancel' }]] }
      );
      return;
    }
    action.data.username = text.toLowerCase();
    action.type = 'newbot_desc';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nEnter a <b>description</b> (optional), or skip:`,
      { keyboard: [
        [{ text: 'Skip', callback_data: 'newbot_skip_desc' }],
        [{ text: '❌ Cancel', callback_data: 'newbot_cancel' }],
      ]}
    );
    return;
  }

  if (action.type === 'newbot_desc') {
    action.data.description = text.slice(0, 256);
    action.type = 'newbot_perms';
    await saveUserState(ctx, userId, state);
    await ctx.sendMessage(chatId,
      `➕ <b>Create New Bot</b>\n\nSelect <b>permissions</b>, then tap Done:\n\n<i>Tap to toggle</i>`,
      { keyboard: createPermissionsKeyboard(action.data.permissions) }
    );
    return;
  }

  if (action.type === 'newbot_perms') {
    // Last step: the entry module the manifest will run. Sending it finishes
    // the install, so the same install is reachable from /newbot and from the
    // main-menu callback.
    const entryPoint = text.trim().slice(0, 256);
    if (!entryPoint) {
      await ctx.sendMessage(chatId, '❌ Entry module cannot be empty. Send it again:');
      return;
    }
    const draft = { ...action.data, entryPoint };
    state.pendingAction = undefined;
    try {
      const installed = await ctx.installBotFromDraft({
        entryPoint,
        name: draft.name ?? '',
        username: draft.username ?? '',
        description: draft.description,
        commands: draft.commands,
        permissions: draft.permissions ?? [],
      });
      state.bots = await ctx.listBots();
      await saveUserState(ctx, userId, state);
      await ctx.sendMessage(chatId,
        `✅ <b>Bot installed</b>\n\n<b>${installed.manifest.name}</b> (@${installed.manifest.username})\n<b>Module:</b> <code>${installed.manifest.entryPoint}</code>\n\nManage it with /mybots.`,
        { keyboard: createMainKeyboard() }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not install the bot';
      await saveUserState(ctx, userId, state);
      await ctx.sendMessage(chatId, `❌ <b>Not installed</b>\n\n${message}`, {
        keyboard: createMainKeyboard(),
      });
    }
    return;
  }

  if (action.type === 'gateway_bot' || action.type === 'peer_bot' ||
      action.type === 'commands_bot' || action.type === 'desc_bot') {
    if (action.type === 'peer_bot') {
      const value = text.trim();
      const peerFingerprint = value.toLowerCase() === 'none' ? undefined : value;
      try {
        await ctx.setPeerFingerprint(action.data.botId, peerFingerprint);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid fingerprint';
        await ctx.sendMessage(chatId, `❌ ${message}\n\nSend the gateway fingerprint or "none" to clear.`);
        return;
      }
      state.bots = await ctx.listBots();
      await ctx.sendMessage(chatId,
        peerFingerprint ? `✅ Peer fingerprint set: ${peerFingerprint}` : '✅ Peer fingerprint cleared');
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