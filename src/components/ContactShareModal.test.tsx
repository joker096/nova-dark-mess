/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const renderModal = () =>
  render(
    <ContactShareModal
      isOpen
      onClose={vi.fn()}
      contactName="Katie Rogers"
      contactId="katie"
      onShared={vi.fn()}
    />,
  );

describe('ContactShareModal - privacy & consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders contact ID only, not phone or email', () => {
    renderModal();
    expect(screen.getByText('katie')).toBeInTheDocument();
    expect(screen.getByText('ID only')).toBeInTheDocument();
    // No phone/email should appear
    expect(screen.queryByText(/^\+/)).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('shows consent checkbox that must be checked before sharing', () => {
    renderModal();
    const consent = screen.getByLabelText(
      /I agree to share only this contact ID/,
    );
    expect(consent).not.toBeChecked();

    const shareBtn = screen.getByRole('button', { name: /Share ID/ });
    expect(shareBtn).toBeDisabled();
  });

  it('enables share button only after consent is given', () => {
    renderModal();
    const consent = screen.getByLabelText(
      /I agree to share only this contact ID/,
    );
    const shareBtn = screen.getByRole('button', { name: /Share ID/ });

    fireEvent.click(consent);
    expect(consent).toBeChecked();
    expect(shareBtn).not.toBeDisabled();
  });

  it('copies only the contact ID to clipboard on share', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const onShared = vi.fn();
    render(
      <ContactShareModal
        isOpen
        onClose={vi.fn()}
        contactName="Katie Rogers"
        contactId="katie-id-123"
        onShared={onShared}
      />,
    );

    const consent = screen.getByLabelText(/I agree to share/);
    fireEvent.click(consent);

    const shareBtn = screen.getByRole('button', { name: /Share ID/ });
    fireEvent.click(shareBtn);

    expect(writeText).toHaveBeenCalledWith('katie-id-123');
    expect(onShared).toHaveBeenCalledWith('katie-id-123');
    expect(writeText).not.toHaveBeenCalledWith(
      expect.stringContaining('+'),
    );
  });

  it('shows checkmark after copying ID', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderModal();
    const consent = screen.getByLabelText(/I agree to share/);
    fireEvent.click(consent);

    const shareBtn = screen.getByRole('button', { name: /Share ID/ });
    fireEvent.click(shareBtn);

    expect(writeText).toHaveBeenCalledWith('katie');
  });
});
