/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JoinRequestNotice } from './JoinRequestNotice';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const value = new Map([
        ['chats.joinRequestNotice', '{{who}} wants to join'],
        ['chats.joinRequestOpen', 'Open'],
        ['common.close', 'Close'],
      ]).get(key);
      if (!value) return key;
      return Object.entries(vars ?? {}).reduce(
        (acc, [name, replacement]) => acc.replace(`{{${name}}}`, replacement),
        value,
      );
    },
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const NOTICE = { groupId: 'thailand', groupName: 'Thailand', who: 'Bob' };

describe('JoinRequestNotice', () => {
  it('renders nothing without a notice', () => {
    const { container } = render(
      <JoinRequestNotice notice={null} onOpen={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('names the requester and the group', () => {
    render(<JoinRequestNotice notice={NOTICE} onOpen={vi.fn()} onDismiss={vi.fn()} />);

    const notice = screen.getByTestId('join-request-notice');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('Thailand');
    expect(notice.textContent).toContain('Bob wants to join');
  });

  it('opens the group or dismisses the notice', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<JoinRequestNotice notice={NOTICE} onOpen={onOpen} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('thailand');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
