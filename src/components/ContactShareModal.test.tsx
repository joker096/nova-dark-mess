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
        'contact.appLink': 'App Link',
        'contact.consent': 'I agree to share only this contact ID',
        'contact.share': 'Share',
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
  Object.defineProperty(navigator, 'share', {
    value: vi.fn(async () => undefined),
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

  it('renders app link (nova:// deep link)', () => {
    renderModal();
    expect(screen.getByText('App Link')).toBeInTheDocument();
    expect(screen.getByText('nova://katierogers')).toBeInTheDocument();
  });

  it('requires consent before sharing but always allows cancelling', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const consent = screen.getByLabelText(/I agree to share only this contact ID/);
    expect(consent).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Share/ })).toBeDisabled();

    const cancel = screen.getByRole('button', { name: /Cancel/ });
    expect(cancel).not.toBeDisabled();
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enables sharing only after consent is given', () => {
    renderModal();
    const consent = screen.getByLabelText(/I agree to share only this contact ID/);
    const shareBtn = screen.getByRole('button', { name: /Share/ });

    fireEvent.click(consent);
    expect(consent).toBeChecked();
    expect(shareBtn).not.toBeDisabled();
  });

  it('shares the app link via native share API and notifies the parent', async () => {
    const onClose = vi.fn();
    const onShared = vi.fn();
    renderModal({ onClose, onShared });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'nova://katierogers',
        }),
      );
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

    // Click the first copy button (for Contact ID)
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('katie');
    });
    expect(onShared).not.toHaveBeenCalled();
  });

  it('copies the app link from the inline copy button without consent', async () => {
    const onShared = vi.fn();
    renderModal({ onShared });

    // Click the second copy button (for App Link)
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copyButtons[1]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nova://katierogers');
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

    // Click the first copy button (for Contact ID)
    const copyButtons = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copyButtons[0]);
    await waitFor(() => {
      expect(copyButtons[0]).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));
    await waitFor(() => {
      expect(onShared).toHaveBeenCalledWith('katie');
    });
  });

  it('uses native share API when available', async () => {
    const onClose = vi.fn();
    const onShared = vi.fn();
    renderModal({ onClose, onShared });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'nova://katierogers',
        }),
      );
      expect(onShared).toHaveBeenCalledWith('katie');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to clipboard when native share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => { throw new Error('Share cancelled'); }),
      configurable: true,
    });
    const onClose = vi.fn();
    const onShared = vi.fn();
    renderModal({ onClose, onShared });

    fireEvent.click(screen.getByLabelText(/I agree to share/));
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nova://katierogers');
      expect(onShared).toHaveBeenCalledWith('katie');
      expect(onClose).toHaveBeenCalledTimes(1);
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
