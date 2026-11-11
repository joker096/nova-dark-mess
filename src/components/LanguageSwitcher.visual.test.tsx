/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSwitcher } from './LanguageSwitcher';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
      { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
    ],
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

describe('LanguageSwitcher visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button with flag, label and chevron', () => {
    render(<LanguageSwitcher />);
    const btn = screen.getByTitle('Change Language / Змінити мову / Сменить язык');
    expect(btn.className).toContain('rounded-xl');
    expect(btn.className).toContain('border');
    expect(btn.className).toContain('transition-all');
    expect(btn.className).toContain('backdrop-blur-sm');
    expect(screen.getByText('🇬🇧')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    const chevron = btn.querySelector('svg')!;
    expect(chevron).toBeTruthy();
  });

  it('applies compact variant classes', () => {
    render(<LanguageSwitcher compact />);
    const btn = screen.getByTitle('Change Language / Змінити мову / Сменить язык');
    expect(btn.className).toContain('px-2.5 py-1.5 text-xs');
    expect(btn.className).not.toContain('px-3.5 py-2 text-sm');
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('renders dropdown open with header and language list', () => {
    render(<LanguageSwitcher />);
    const btn = screen.getByTitle('Change Language / Змінити мову / Сменить язык');
    fireEvent.click(btn);
    const dropdown = findByClass(document, 'bg-slate-900/95')!;
    expect(dropdown.className).toContain('shadow-2xl');
    expect(dropdown.className).toContain('backdrop-blur-md');
    expect(dropdown.className).toContain('animate-in');
    expect(dropdown.textContent).toContain('Language / Мова');
    expect(dropdown.textContent).toContain('English');
    expect(dropdown.textContent).toContain('Русский');
    expect(dropdown.textContent).toContain('Українська');
  });

  it('renders each language option with flag and native name', () => {
    render(<LanguageSwitcher />);
    const btn = screen.getByTitle('Change Language / Змінити мову / Сменить язык');
    fireEvent.click(btn);
    const dropdown = findByClass(document, 'bg-slate-900/95')!;
    expect(dropdown.textContent).toContain('🇬🇧');
    expect(dropdown.textContent).toContain('🇷🇺');
    expect(dropdown.textContent).toContain('🇺🇦');
    expect(dropdown.textContent).toContain('English');
    expect(dropdown.textContent).toContain('Русский');
    expect(dropdown.textContent).toContain('Українська');
  });

  it('marks active language with cyan accent and check', () => {
    render(<LanguageSwitcher />);
    const btn = screen.getByTitle('Change Language / Змінити мову / Сменить язык');
    fireEvent.click(btn);
    const dropdown = findByClass(document, 'bg-slate-900/95')!;
    const activeBtn = Array.from(dropdown.querySelectorAll('button')).find(
      (b) => b.className.includes('bg-cyan-500/5'),
    )!;
    expect(activeBtn.className).toContain('text-cyan-400');
    expect(activeBtn.className).toContain('font-semibold');
    expect(activeBtn.textContent).toContain('English');
    const check = activeBtn.querySelector('svg')!;
    expect(check.getAttribute('class')).toContain('text-cyan-400');
  });
});
