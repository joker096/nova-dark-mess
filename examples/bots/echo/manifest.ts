/**
 * Echo bot manifest — plain data, no code, so the app session can install
 * the fixture without importing the bot module itself.
 */
import type { BotManifest } from '../../../src/lib/bots/types';

export const echoBotManifest: BotManifest = {
  id: 'echo',
  name: 'Echo Bot',
  username: 'echo_bot',
  description: 'Echoes every message back. /start shows the keyboard.',
  version: '1.0.0',
  commands: [
    { command: 'start', description: 'Show the echo keyboard' },
    { command: 'help', description: 'What can this bot do?' },
  ],
  requestedPermissions: ['read_messages', 'send_messages', 'inline_keyboard'],
  entryPoint: '/examples/bots/echo/index.ts',
};
