/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AppIcon } from './AppIcon';
import { LanguageProvider } from '../context/LanguageContext';
import React from 'react';

const renderWithLanguage = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

function svgClass(svg: SVGElement | null): string {
  return svg ? (svg.getAttribute('class') ?? '') : '';
}

describe('AppIcon visual snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dark variant svg with black primary and red accent', () => {
    const { container } = renderWithLanguage(<AppIcon size={24} variant="dark" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '-2 -2 213 179');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Nova Messenger');
    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', '#000000');
    expect(paths[1]).toHaveAttribute('fill', '#FF0000');
    expect(svg.querySelector('title')?.textContent).toBe('Nova Messenger');
  });

  it('renders light variant svg with white primary and FF3B30 accent', () => {
    const { container } = renderWithLanguage(<AppIcon variant="light" />);
    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', '#FFFFFF');
    expect(paths[1]).toHaveAttribute('fill', '#FF3B30');
  });

  it('applies custom size attribute', () => {
    const { container } = renderWithLanguage(<AppIcon size={48} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies custom className', () => {
    const { container } = renderWithLanguage(<AppIcon className="my-icon" />);
    const svg = container.querySelector('svg')!;
    expect(svgClass(svg)).toContain('my-icon');
  });
});
