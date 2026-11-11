/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleMessageModal } from './ScheduleMessageModal';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

function findByClass(root: Element | Document, substring: string): HTMLElement | null {
  const nodes = root.querySelectorAll('*');
  for (const node of nodes) {
    if (node.className && typeof node.className === 'string' && node.className.includes(substring)) {
      return node as HTMLElement;
    }
  }
  return null;
}

describe('ScheduleMessageModal visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen false', () => {
    const { container } = render(
      <ScheduleMessageModal isOpen={false} messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders modal backdrop with blur and fade-in', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const backdrop = document.querySelector('.fixed.inset-0')!;
    expect(backdrop.className).toContain('bg-black/85');
    expect(backdrop.className).toContain('backdrop-blur-md');
    expect(backdrop.className).toContain('animate-in');
    expect(backdrop.className).toContain('fade-in');
  });

  it('renders modal card with dark bg, border, rounded corners and shadow', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const card = findByClass(document, 'bg-[#151621]')!;
    expect(card.className).toContain('border-white/10');
    expect(card.className).toContain('rounded-3xl');
    expect(card.className).toContain('shadow-2xl');
    expect(card.className).toContain('animate-in');
    expect(card.className).toContain('slide-in-from-bottom-3');
  });

  it('renders header with accent clock chip and close button', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const chip = findByClass(document, 'bg-[var(--nova-accent-color)]/20')!;
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('w-8 h-8 rounded-full');
    expect(chip.className).toContain('text-[var(--nova-accent-color)]');
    expect(screen.getByRole('heading', { name: 'Schedule Message' })).toBeTruthy();
    expect(screen.getByText('Send automatically at a chosen time')).toBeTruthy();
    const close = screen.getByRole('button', { name: 'common.close' });
    expect(close.className).toContain('bg-white/5');
    expect(close.className).toContain('hover:bg-white/15');
  });

  it('renders message preview with accent label', () => {
    render(
      <ScheduleMessageModal isOpen messageText="Hello world" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const preview = findByClass(document, 'bg-[#1b1c28]')!;
    expect(preview.className).toContain('border-white/5');
    expect(preview.className).toContain('rounded-2xl');
    expect(screen.getByText('Message Preview')).toBeTruthy();
    expect(screen.getByText('"Hello world"')).toBeTruthy();
  });

  it('renders quick presets grid with 2 columns', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const grid = document.querySelector('.grid.grid-cols-2')!;
    expect(grid.className).toContain('gap-2');
    expect(screen.getByText('In 5 seconds')).toBeTruthy();
    expect(screen.getByText('In 15 minutes')).toBeTruthy();
    expect(screen.getByText('Tonight 21:00')).toBeTruthy();
    expect(screen.getByText('Tomorrow 09:00')).toBeTruthy();
  });

  it('marks selected preset with accent border and bg', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const selected = screen.getByRole('button', { name: /In 5 seconds/ })!;
    expect(selected.className).toContain('border-[var(--nova-accent-color)]');
    expect(selected.className).toContain('bg-[var(--nova-accent-color)]/15');
    expect(selected.className).toContain('text-white');
    expect(selected.className).toContain('shadow-sm');
    const unselected = screen.getByRole('button', { name: /In 15 minutes/ })!;
    expect(unselected.className).toContain('border-white/5');
    expect(unselected.className).toContain('bg-[#1b1c28]');
  });

  it('renders demo pill on 5s preset', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const demo = screen.getByText('Demo').closest('span')!;
    expect(demo.className).toContain('bg-[var(--nova-accent-color)]');
    expect(demo.className).toContain('text-white');
    expect(demo.className).toContain('rounded-full');
  });

  it('renders custom date/time toggle with calendar icon', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const custom = screen.getByRole('button', { name: /Custom Date & Time/ })!;
    expect(custom.className).toContain('border-white/5');
    expect(custom.className).toContain('bg-[#1b1c28]');
    const calendar = custom.querySelector('svg')!;
    expect(calendar).toBeTruthy();
  });

  it('renders custom date and time inputs when custom selected', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const custom = screen.getByRole('button', { name: /Custom Date & Time/ })!;
    fireEvent.click(custom);
    const customPanel = findByClass(document, 'bg-[#101118]')!;
    expect(customPanel.className).toContain('rounded-xl');
    expect(customPanel.className).toContain('animate-in');
    expect(document.querySelector('input[type="date"]')).toBeTruthy();
    expect(document.querySelector('input[type="time"]')).toBeTruthy();
  });

  it('renders confirm schedule button with accent gradient and cancel button', () => {
    render(
      <ScheduleMessageModal isOpen messageText="hi" onSchedule={vi.fn()} onClose={vi.fn()} />,
    );
    const confirm = screen.getByRole('button', { name: 'Schedule Message' })!;
    expect(confirm.className).toContain('bg-[var(--nova-accent-color)]');
    expect(confirm.className).toContain('shadow-[var(--nova-accent-color)]/25');
    expect(confirm.className).toContain('active:scale-95');
    const cancel = screen.getByRole('button', { name: 'Cancel' })!;
    expect(cancel.className).toContain('bg-white/5');
    expect(cancel.className).toContain('hover:bg-white/10');
  });
});
