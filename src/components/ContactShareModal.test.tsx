/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactShareModal } from './ContactShareModal';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'contact.shareTitle': 'Share contact',
        'contact.idOnly': 'ID only',
        'contact.idOnlyDesc': 'Only the contact ID is shared.',
        'contact.contactId': 'Contact ID',
        'contact.consent': 'I agree to share only this contact ID',
        'contact.share': 'Share ID',
        'common.copy': 'Copy',
        'common.cancel': 'Cancel',
      };
      return map[key] ?? key;
    },
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const renderModal = (overrides: { onClose?: () => void; onShared?: (id: string) => void } = {}) =>
  render(
    <ContactShareModal
      isOpen
      onClose={overrides.onClose ?? vi.fn()}
      contactName="Katie Rogers"
      contactId="katie"
      onShared={overrides.onShared ?? vi.fn()}
    />,
  );

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ContactShareModal - privacy & consent', () => {
  it('renders contact ID only, not phone or email', () => {
    renderModal();
    expect(screen.getByText('katie')).toBeInTheDocument();
    expect(screen.getByText('ID only')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('requires consent before sharing but always allows cancelling', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const consent = screen.getByLabelText(/I agree to share only this contact ID/);
    expect(consent).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Share ID/ })).toBeDisabled();

    const cancel = screen.getByRole('button', { name: /Cancel/ });
    expect(cancel).not.toBeDisabled();
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enables sharing only after consent is given', () => {
    renderModal();
    const consent = screen.getByLabelText(/I agree to share only this contact ID/);
    const shareBtn = screen.getByRole('button', { name: /Share ID/ });

    fireEvent.click(consent);
    expect(consent).toBeChecked();
    expect(shareBtn).not.toBeDisabled();
  });

  it('copies only the contact ID on share and notifies the parent', async () => {
    const onClose = vi.fn();
    const onShared = vi.fn();
    renderModal({ onClose, onShared });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share ID/ }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('katie');
      expect(onShared).toHaveBeenCalledWith('katie');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(
      expect.stringContaining('+'),
    );
  });

  it('copies the ID from the inline copy button without consent', async () => {
    const onShared = vi.fn();
    renderModal({ onShared });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('katie');
    });
    expect(onShared).not.toHaveBeenCalled();
  });

  it('does not crash when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const onShared = vi.fn();
    renderModal({ onShared });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share ID/ }));
    await waitFor(() => {
      expect(onShared).toHaveBeenCalledWith('katie');
    });
  });

  it('resets consent every time the modal is reopened', () => {
    const { rerender } = render(
      <ContactShareModal isOpen onClose={vi.fn()} contactName="Katie" contactId="katie" />,
    );
    const consent = screen.getByLabelText(/I agree to share/);
    fireEvent.click(consent);
    expect(consent).toBeChecked();

    rerender(
      <ContactShareModal isOpen={false} onClose={vi.fn()} contactName="Katie" contactId="katie" />,
    );
    rerender(
      <ContactShareModal isOpen onClose={vi.fn()} contactName="Katie" contactId="katie" />,
    );
    expect(screen.getByLabelText(/I agree to share/)).not.toBeChecked();
  });
});
