/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignTokensModal } from './DesignTokensModal';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

describe('DesignTokensModal - horizontal lists hide scrollbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tokens tabs list uses no-scrollbar (no visible slider)', () => {
    render(<DesignTokensModal isOpen onClose={vi.fn()} />);
    const list = screen.getByTestId('tokens-tabs');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<DesignTokensModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
