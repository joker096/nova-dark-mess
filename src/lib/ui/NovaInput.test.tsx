/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaInput } from './NovaInput';

describe('NovaInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with placeholder', () => {
    render(<NovaInput placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<NovaInput label="Username" />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('shows error message when provided', () => {
    render(<NovaInput error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows helper text when no error', () => {
    render(<NovaInput helperText="Enter your username" />);
    expect(screen.getByText('Enter your username')).toBeInTheDocument();
  });

  it('does not show helper text when error is present', () => {
    render(<NovaInput error="Error" helperText="Helper" />);
    expect(screen.queryByText('Helper')).toBeNull();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('calls onChange with value', () => {
    const onChange = vi.fn();
    render(<NovaInput onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).value).toBe('hello');
  });

  it('applies custom className', () => {
    render(<NovaInput className="my-input-class" />);
    expect(screen.getByRole('textbox').closest('div')).toHaveClass('my-input-class');
  });

  it('is disabled when disabled prop is set', () => {
    render(<NovaInput disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('forwards ref to input element', () => {
    const ref = vi.fn();
    render(<NovaInput ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });
});
