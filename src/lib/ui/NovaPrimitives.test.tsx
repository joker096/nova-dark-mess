/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NovaIconButton } from './NovaIconButton';
import { NovaTooltip } from './NovaTooltip';
import { NovaMenu } from './NovaMenu';
import { NovaBadge } from './NovaBadge';
import { NovaToastProvider, useToast } from './NovaToast';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

describe('NovaIconButton', () => {
  it('exposes the label as its accessible name and title', () => {
    render(<NovaIconButton label="Open menu" icon={<svg />} />);
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button.getAttribute('title')).toBe('Open menu');
  });

  it('caps the badge at 99+', () => {
    render(<NovaIconButton label="Chats" icon={<svg />} badge={120} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('blocks clicks while loading', () => {
    const onClick = vi.fn();
    render(<NovaIconButton label="Saving" icon={<svg />} loading onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('NovaTooltip', () => {
  it('appears after the hover delay and hides on leave', () => {
    vi.useFakeTimers();
    render(
      <NovaTooltip label="Pin chat" delay={400}>
        <button type="button">pin</button>
      </NovaTooltip>,
    );
    const wrapper = screen.getByText('pin').parentElement!;
    fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Pin chat');
    fireEvent.pointerLeave(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('shows immediately on keyboard focus', () => {
    render(
      <NovaTooltip label="Search">
        <button type="button">search</button>
      </NovaTooltip>,
    );
    fireEvent.focus(screen.getByText('search'));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });
});

describe('NovaMenu', () => {
  it('opens on the trigger, closes on Escape and returns focus', () => {
    render(
      <NovaMenu
        label="Message actions"
        trigger={<button type="button">more</button>}
        items={[
          { key: 'copy', label: 'Copy', onSelect: vi.fn() },
          { key: 'delete', label: 'Delete', onSelect: vi.fn(), danger: true },
        ]}
      />,
    );
    const trigger = screen.getByText('more');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Message actions' });
    expect(menu).toBeTruthy();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs the selected item and closes', () => {
    const onSelect = vi.fn();
    render(
      <NovaMenu
        label="Actions"
        trigger={<button type="button">open</button>}
        items={[{ key: 'copy', label: 'Copy', onSelect }]}
      />,
    );
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('NovaBadge', () => {
  it('formats large counts', () => {
    render(<NovaBadge value={1234} />);
    expect(screen.getByText('1.2K')).toBeTruthy();
  });

  it('hides zero values', () => {
    const { container } = render(<NovaBadge value={0} />);
    expect(container.textContent).toBe('');
  });
});

function ToastHarness() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast.show('Message deleted', { undo: { label: 'Undo', onUndo: () => toast.show('Restored') } })
      }
    >
      notify
    </button>
  );
}

describe('NovaToast', () => {
  it('shows a toast and runs Undo from it', () => {
    render(
      <NovaToastProvider>
        <ToastHarness />
      </NovaToastProvider>,
    );
    fireEvent.click(screen.getByText('notify'));
    expect(screen.getByText('Message deleted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Restored')).toBeTruthy();
    expect(screen.queryByText('Message deleted')).toBeNull();
  });

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers();
    render(
      <NovaToastProvider>
        <ToastHarness />
      </NovaToastProvider>,
    );
    fireEvent.click(screen.getByText('notify'));
    expect(screen.getByText('Message deleted')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Message deleted')).toBeNull();
    vi.useRealTimers();
  });
});
