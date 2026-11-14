/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NovaReactionPill } from './NovaReactionPill';
import { NovaReactionPicker } from './NovaReactionPicker';

describe('NovaReactionPill', () => {
  it('renders the emoji and a compact count', () => {
    render(<NovaReactionPill emoji="❤️" count={1250} />);
    expect(screen.getByText('❤️')).toBeTruthy();
    expect(screen.getByText('1.3K')).toBeTruthy();
  });

  it('marks the pill as pressed only when the user reacted', () => {
    const { rerender } = render(<NovaReactionPill emoji="🔥" count={3} />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');

    rerender(<NovaReactionPill emoji="🔥" count={3} selected />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<NovaReactionPill emoji="👍" count={1} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('NovaReactionPicker', () => {
  const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'React' }));

  it('opens the grid and reports the chosen emoji', () => {
    const onSelect = vi.fn();
    render(
      <NovaReactionPicker
        label="Reactions"
        emojis={['❤️', '👍', '🔥']}
        onSelect={onSelect}
        trigger={<button type="button">React</button>}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    openPicker();
    expect(screen.getByRole('dialog', { name: 'Reactions' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    expect(onSelect).toHaveBeenCalledWith('🔥');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks emojis the user already reacted with', () => {
    render(
      <NovaReactionPicker
        label="Reactions"
        emojis={['❤️', '👍']}
        selectedEmojis={['❤️']}
        onSelect={vi.fn()}
        trigger={<button type="button">React</button>}
      />,
    );
    openPicker();
    expect(screen.getByRole('button', { name: '❤️' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '👍' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('submits a custom emoji from the text field', () => {
    const onSelect = vi.fn();
    render(
      <NovaReactionPicker
        label="Reactions"
        emojis={['❤️']}
        onSelect={onSelect}
        allowCustom
        customLabel="Add a custom reaction"
        trigger={<button type="button">React</button>}
      />,
    );
    openPicker();
    fireEvent.change(screen.getByLabelText('Add a custom reaction'), {
      target: { value: '🦄' },
    });
    fireEvent.keyDown(screen.getByLabelText('Add a custom reaction'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('🦄');
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(
      <NovaReactionPicker
        label="Reactions"
        emojis={['❤️', '👍']}
        onSelect={vi.fn()}
        trigger={<button type="button">React</button>}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'React' });
    openPicker();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});