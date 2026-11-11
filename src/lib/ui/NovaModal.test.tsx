/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NovaModal } from './NovaModal';

describe('NovaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<NovaModal isOpen={false} onClose={vi.fn()}>Content</NovaModal>);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with role and aria-modal when open', () => {
    render(<NovaModal isOpen onClose={vi.fn()}>Content</NovaModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders title when provided', () => {
    render(<NovaModal isOpen onClose={vi.fn()} title="My Title">Content</NovaModal>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<NovaModal isOpen onClose={vi.fn()}>Modal content</NovaModal>);
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<NovaModal isOpen onClose={onClose} title="Test">Content</NovaModal>);
    fireEvent.click(screen.getAllByLabelText('Close modal')[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<NovaModal isOpen onClose={onClose} closeOnEscape>Content</NovaModal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies max-width class', () => {
    render(<NovaModal isOpen onClose={vi.fn()} maxWidth="lg">Content</NovaModal>);
    const dialog = screen.getByRole('dialog');
    const content = dialog.querySelector('[class*="max-w-[900px]"]');
    expect(content).toBeTruthy();
  });

  it('applies custom className', () => {
    render(<NovaModal isOpen onClose={vi.fn()} className="my-modal">Content</NovaModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('my-modal');
  });
});
