import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageInlineKeyboard } from './MessageInlineKeyboard';
import type { InlineKeyboard } from '../lib/bots/types';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      key === 'bot.callbackAction' ? `Sends: ${opts?.action}` : key,
    language: 'en',
  }),
}));

const keyboard: InlineKeyboard = [
  [{ text: 'Ping', callback_data: 'echo:ping' }],
  [{ text: 'Docs', url: 'https://mess.cvr.name/' }],
];

const renderKeyboard = (onCallback = vi.fn(), disabled = false) =>
  render(
    <MessageInlineKeyboard
      keyboard={keyboard}
      botId="echo"
      messageId="m1"
      onCallback={onCallback}
      disabled={disabled}
    />,
  );

describe('MessageInlineKeyboard', () => {
  beforeEach(() => {});

  it('renders callback and url buttons', () => {
    renderKeyboard();
    expect(screen.getByRole('button', { name: 'Ping' })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Docs/ }) as HTMLAnchorElement;
    expect(link.href).toBe('https://mess.cvr.name/');
    expect(link.rel).toContain('noopener');
  });

  it('emits a callback_query with bot id, message id and data', () => {
    const onCallback = vi.fn();
    renderKeyboard(onCallback);
    fireEvent.click(screen.getByRole('button', { name: 'Ping' }));
    expect(onCallback).toHaveBeenCalledWith('echo', 'm1', 'echo:ping');
  });

  it('does not emit when disabled', () => {
    const onCallback = vi.fn();
    renderKeyboard(onCallback, true);
    fireEvent.click(screen.getByRole('button', { name: 'Ping' }));
    expect(onCallback).not.toHaveBeenCalled();
  });

  it('reveals the action behind a button on context menu (anti-phishing disclosure)', () => {
    renderKeyboard();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Ping' }));
    expect(screen.getByRole('status').textContent).toContain('echo:ping');
    // Toggle off on the second context menu.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Ping' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
