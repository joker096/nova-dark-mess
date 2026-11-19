/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandMenu } from './CommandMenu';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const commands = [
  { command: 'start', description: 'Show the echo keyboard' },
  { command: 'help', description: 'What can this bot do?' },
];

describe('CommandMenu', () => {
  it('renders a menu item per command with slash prefix', () => {
    render(
      <CommandMenu
        commands={commands}
        isOpen={true}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('menu', { name: 'bot.commandMenu' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem')[0].textContent).toMatch(/^\/start/);
    expect(screen.getAllByRole('menuitem')[1].textContent).toMatch(/^\/help/);
  });

  it('calls onSelect with the command without leading slash', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandMenu
        commands={commands}
        isOpen={true}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    const startItem = screen.getAllByRole('menuitem')[0];
    fireEvent.click(startItem);
    expect(onSelect).toHaveBeenCalledWith('start');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders null when closed or empty', () => {
    const { container } = render(
      <CommandMenu
        commands={commands}
        isOpen={false}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();

    const { container: emptyContainer } = render(
      <CommandMenu
        commands={[]}
        isOpen={true}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(emptyContainer.firstChild).toBeNull();
  });
});
