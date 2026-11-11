/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NovaCalendar } from './NovaCalendar';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

describe('NovaCalendar', () => {
  it('selects a day and preserves the time of day', () => {
    const onChange = vi.fn();
    render(
      <NovaCalendar
        value={new Date(2026, 10, 11, 15, 30)}
        onChange={onChange}
        minDate={new Date(2026, 10, 11)}
        locale="en"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Thursday, November 12, 2026' }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const selected = onChange.mock.calls[0][0] as Date;
    expect(selected.getFullYear()).toBe(2026);
    expect(selected.getMonth()).toBe(10);
    expect(selected.getDate()).toBe(12);
    expect(selected.getHours()).toBe(15);
    expect(selected.getMinutes()).toBe(30);
  });

  it('disables days before minDate', () => {
    const onChange = vi.fn();
    render(
      <NovaCalendar
        value={new Date(2026, 10, 11)}
        onChange={onChange}
        minDate={new Date(2026, 10, 11)}
        locale="en"
      />,
    );

    const previousDay = screen.getByRole('button', {
      name: 'Tuesday, November 10, 2026',
    });

    expect(previousDay).toBeDisabled();
    fireEvent.click(previousDay);
    expect(onChange).not.toHaveBeenCalled();
  });
});
