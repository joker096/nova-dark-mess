/**
 * NovaFather Bot manifest — system bot for creating and managing bots.
 * L1 local bot module.
 */
import type { BotManifest } from '../../../src/lib/bots/types';

export const novafatherManifest: BotManifest = {
  id: 'novafather',
  name: 'NovaFather 🤖',
  username: 'novafather_bot',
  description: 'Official bot for creating and managing Nova bots. Use /newbot to create a bot, /token to manage API tokens, /setwebhook to configure webhooks, /setgateway to attach an L2/L3 gateway.',
  version: '1.0.0',
  commands: [
    { command: 'start', description: 'Show main menu and commands' },
    { command: 'newbot', description: 'Create a new bot (L1 local)' },
    { command: 'mybots', description: 'List your bots' },
    { command: 'token', description: 'Manage bot tokens (L3)' },
    { command: 'revoke', description: 'Revoke a token' },
    { command: 'setwebhook', description: 'Set webhook URL for a bot (L3)' },
    { command: 'deletewebhook', description: 'Delete webhook for a bot' },
    { command: 'setgateway', description: 'Attach L2/L3 gateway URL to a bot' },
    { command: 'setcommands', description: 'Set bot commands list' },
    { command: 'setdescription', description: 'Set bot description' },
    { command: 'help', description: 'Show help and command reference' },
  ],
  requestedPermissions: ['read_messages', 'send_messages', 'inline_keyboard'],
  entryPoint: '/examples/bots/novafather/index.ts',
};