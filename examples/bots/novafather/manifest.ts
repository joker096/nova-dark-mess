/**
 * NovaFather system bot manifest (docs/bots-roadmap.md §B6).
 *
 * Implemented as an ordinary L1 bot on the same BotContext API:
 *   /newbot    - register a new local L1 bot manifest (stored encrypted)
 *   /setcommands - set commands for a managed bot
 *   /setdescription - set bot description
 *   /token - issue/gateway tokens (hash-stored, shown once)
 *   /revoke - revoke a bot token
 *   /setwebhook - set the gateway webhook URL
 *   /setgateway - attach an L2 gateway URL to a bot
 *
 * Doubles as the end-to-end test of the whole BotContext API.
 */

import type { BotManifest } from '../../../src/lib/bots/types';

export const novafatherManifest: BotManifest = {
  id: 'novafather',
  name: 'NovaFather',
  username: 'novafather_bot',
  description: 'System bot: create and manage other bots.',
  version: '1.0.0',
  commands: [
    { command: 'newbot', description: 'Create a new local bot' },
    { command: 'setcommands', description: 'Set commands for a managed bot' },
    { command: 'setdescription', description: 'Set a bot description' },
    { command: 'token', description: 'Issue a gateway token for a bot' },
    { command: 'revoke', description: 'Revoke a bot token' },
    { command: 'setwebhook', description: 'Set the gateway webhook URL' },
    { command: 'setgateway', description: 'Attach an L2 gateway URL to a bot' },
  ],
  requestedPermissions: ['send_messages', 'inline_keyboard'],
  entryPoint: '/examples/bots/novafather/index.js',
};
