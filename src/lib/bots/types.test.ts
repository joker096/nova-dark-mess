import { describe, expect, it } from 'vitest';
import {
  ALL_BOT_PERMISSIONS,
  type BotManifest,
  type InlineKeyboard,
  callbackDataByteLimit,
  isValidBotManifest,
  isValidBotUsername,
  isValidCommand,
  isValidInlineButton,
  isValidInlineKeyboard,
  permissionsChanged,
} from './types';

const baseManifest: BotManifest = {
  id: 'echo',
  name: 'Echo Bot',
  username: 'echo_bot',
  version: '1.0.0',
  commands: [{ command: 'start', description: 'Start the bot' }],
  requestedPermissions: ['send_messages'],
  entryPoint: '/bots/echo.js',
};

describe('bots contracts', () => {
  it('limits callback_data to 64 bytes', () => {
    expect(callbackDataByteLimit()).toBe(64);
    expect(isValidInlineButton({ text: 'ok', callback_data: 'a'.repeat(64) })).toBe(true);
    // 65 one-byte chars exceed the byte limit even though length is 65.
    expect(isValidInlineButton({ text: 'ok', callback_data: 'a'.repeat(65) })).toBe(false);
    // 32 two-byte chars = 64 bytes: fits; 33 = 66 bytes: does not.
    expect(isValidInlineButton({ text: 'ok', callback_data: 'é'.repeat(32) })).toBe(true);
    expect(isValidInlineButton({ text: 'ok', callback_data: 'é'.repeat(33) })).toBe(false);
  });

  it('requires exactly one action per button', () => {
    expect(isValidInlineButton({ text: 'a', callback_data: 'x' })).toBe(true);
    expect(isValidInlineButton({ text: 'a', url: 'https://example.com' })).toBe(true);
    expect(isValidInlineButton({ text: 'a', callback_data: 'x', url: 'https://example.com' })).toBe(false);
    expect(isValidInlineButton({ text: 'a' })).toBe(false);
    expect(isValidInlineButton({ text: 'a', callback_data: '' })).toBe(false);
    expect(isValidInlineButton({ text: '', callback_data: 'x' })).toBe(false);
    expect(isValidInlineButton({ text: 'a', url: 'javascript:alert(1)' })).toBe(false);
  });

  it('validates keyboard shape', () => {
    const kb: InlineKeyboard = [[{ text: 'a', callback_data: 'x' }], [{ text: 'b', url: 'https://e.com' }]];
    expect(isValidInlineKeyboard(kb)).toBe(true);
    expect(isValidInlineKeyboard([])).toBe(true);
    expect(isValidInlineKeyboard([[]])).toBe(false);
    expect(isValidInlineKeyboard(new Array(9).fill([{ text: 'a', callback_data: 'x' }]))).toBe(false);
  });

  it('validates usernames ending in bot', () => {
    expect(isValidBotUsername('echo_bot')).toBe(true);
    expect(isValidBotUsername('mybot2_bot')).toBe(true);
    expect(isValidBotUsername('bot')).toBe(false);
    expect(isValidBotUsername('echo')).toBe(false);
    expect(isValidBotUsername('Echo_Bot')).toBe(false);
    expect(isValidBotUsername('echo_botx')).toBe(false);
  });

  it('validates command names', () => {
    expect(isValidCommand('start')).toBe(true);
    expect(isValidCommand('do_thing_2')).toBe(true);
    expect(isValidCommand('Do It')).toBe(false);
    expect(isValidCommand('a'.repeat(33))).toBe(false);
  });

  it('accepts a valid manifest and rejects malformed ones', () => {
    expect(isValidBotManifest(baseManifest)).toBe(true);
    expect(isValidBotManifest({ ...baseManifest, username: 'echo' })).toBe(false);
    expect(isValidBotManifest({ ...baseManifest, id: 'Echo!' })).toBe(false);
    expect(isValidBotManifest({ ...baseManifest, requestedPermissions: ['root'] as never })).toBe(false);
    expect(isValidBotManifest({ ...baseManifest, commands: [{ command: 'BAD', description: 'x' }] })).toBe(false);
    expect(isValidBotManifest({ ...baseManifest, entryPoint: undefined, gatewayUrl: undefined })).toBe(false);
    expect(
      isValidBotManifest({ ...baseManifest, entryPoint: undefined, gatewayUrl: 'https://gw.example' }),
    ).toBe(true);
    expect(isValidBotManifest(null)).toBe(false);
    expect(isValidBotManifest('echo')).toBe(false);
  });

  it('detects permission changes for re-consent', () => {
    expect(permissionsChanged(['send_messages'], ['send_messages'])).toEqual([]);
    expect(permissionsChanged(['send_messages'], ['send_messages', 'read_messages'])).toEqual(['read_messages']);
    expect(permissionsChanged([], [...ALL_BOT_PERMISSIONS])).toEqual([...ALL_BOT_PERMISSIONS]);
  });
});
