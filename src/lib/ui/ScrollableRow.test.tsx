/// <reference types="vitest/globals" />

import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrollableRow } from './ScrollableRow';

describe('ScrollableRow', () => {
  it('renders children with a generated gap class', () => {
    render(
      <ScrollableRow gap="3" data-testid="row">
        <span>one</span>
        <span>two</span>
      </ScrollableRow>,
    );
    const row = screen.getByTestId('row');
    expect(row.className).toContain('gap-3');
    expect(row.className).toContain('no-scrollbar');
    expect(row.textContent).toBe('onetwo');
  });

  it('falls back to the default gap for unknown values', () => {
    render(
      <ScrollableRow gap="huge" data-testid="row">
        <span>one</span>
      </ScrollableRow>,
    );
    expect(screen.getByTestId('row').className).toContain('gap-2');
  });

  it('forwards the ref to the scroll container', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ScrollableRow ref={ref} data-testid="row">
        <span>one</span>
      </ScrollableRow>,
    );
    expect(ref.current).toBe(screen.getByTestId('row'));
  });

  it('converts vertical wheel movement into horizontal scrolling', () => {
    render(
      <ScrollableRow wheelScroll data-testid="row">
        <span>one</span>
      </ScrollableRow>,
    );
    const row = screen.getByTestId('row');
    Object.defineProperty(row, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(row, 'clientWidth', { value: 100, configurable: true });

    fireEvent.wheel(row, { deltaY: 100, deltaX: 0 });
    expect(row.scrollLeft).toBeCloseTo(115);

    fireEvent.wheel(row, { deltaY: 0, deltaX: 20 });
    expect(row.scrollLeft).toBeCloseTo(135);
  });

  it('does not intercept the wheel when there is nothing to scroll', () => {
    render(
      <ScrollableRow wheelScroll data-testid="row">
        <span>one</span>
      </ScrollableRow>,
    );
    const row = screen.getByTestId('row');
    Object.defineProperty(row, 'scrollWidth', { value: 100, configurable: true });
    Object.defineProperty(row, 'clientWidth', { value: 100, configurable: true });

    fireEvent.wheel(row, { deltaY: 100 });
    expect(row.scrollLeft).toBe(0);
  });
});
