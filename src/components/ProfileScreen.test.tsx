/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { ProfileScreen } from './ProfileScreen';
import { CURRENT_USER } from '../data/mockMessengerData';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({ identity: null }),
}));

const renderProfile = (profileId = CURRENT_USER.id) =>
  render(
    <ProfileScreen profileId={profileId} onBack={vi.fn()} onOpenChat={vi.fn()} />,
  );

describe('ProfileScreen - ID-based anonymous profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Nickname (ID) as primary identifier, not phone', () => {
    renderProfile('katie');
    expect(screen.getByText(/Nickname/)).toBeTruthy();
    expect(screen.getByText('@Katie_Rogers')).toBeTruthy();
  });

  it('does not render Phone Number as main field', () => {
    renderProfile('katie');
    expect(screen.queryByText('Phone Number')).toBeNull();
  });

  it('renders Additional phone as optional secondary field', () => {
    renderProfile('katie');
    expect(screen.getByText('Additional phone')).toBeTruthy();
    expect(screen.getByText('+38 063 980 20 90')).toBeTruthy();
  });

  it('does not render Call button', () => {
    renderProfile('kurt');
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('does not render Video call button', () => {
    renderProfile('kurt');
    expect(screen.queryByText('Video call')).toBeNull();
  });

  it('does not render call modal overlay', () => {
    renderProfile('kurt');
    expect(screen.queryByText('Calling...')).toBeNull();
  });
});

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,abc123'),
}));

describe('ProfileScreen - editable fields and QR code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits the nickname and persists it locally', () => {
    renderProfile('katie');
    expect(screen.getByText('@Katie_Rogers')).toBeTruthy();

    const nicknameRow = screen.getByText('Nickname').closest('div')!.parentElement!.parentElement!;
    const editButton = within(nicknameRow).getByTitle('common.edit');
    fireEvent.click(editButton);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'NewNick' } });

    const saveButton = screen.getByTitle('common.save');
    fireEvent.click(saveButton);

    expect(screen.getByText('NewNick')).toBeTruthy();
    expect(screen.queryByText('@Katie_Rogers')).toBeNull();
  });

  it('edits the additional phone number', () => {
    renderProfile('katie');
    expect(screen.getByText('+38 063 980 20 90')).toBeTruthy();

    const phoneRow = screen.getByText('Additional phone').closest('div')!.parentElement!.parentElement!;
    const editButton = within(phoneRow).getByTitle('common.edit');
    fireEvent.click(editButton);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '+1 234 5678' } });

    const saveButton = screen.getByTitle('common.save');
    fireEvent.click(saveButton);

    expect(screen.getByText('+1 234 5678')).toBeTruthy();
    expect(screen.queryByText('+38 063 980 20 90')).toBeNull();
  });

  it('cancelling the edit keeps the original value', () => {
    renderProfile('katie');

    const nicknameRow = screen.getByText('Nickname').closest('div')!.parentElement!.parentElement!;
    const editButton = within(nicknameRow).getByTitle('common.edit');
    fireEvent.click(editButton);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discarded' } });

    const cancelButton = screen.getByTitle('common.cancel');
    fireEvent.click(cancelButton);

    expect(screen.getByText('@Katie_Rogers')).toBeTruthy();
    expect(screen.queryByText('Discarded')).toBeNull();
  });

  it('generates a real QR code data URL for the contact', async () => {
    renderProfile('katie');

    const contactButton = screen.getByTitle('common.contact');
    await act(async () => {
      fireEvent.click(contactButton);
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    const qrImage = screen.getByAltText('QR Code');
    expect(qrImage.getAttribute('src')).toBe('data:image/png;base64,abc123');

    fireEvent.keyDown(document.documentElement, { key: 'Escape' });
    expect(screen.queryByAltText('QR Code')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ProfileScreen - horizontal lists hide scrollbar', () => {
  it('profile tabs list uses no-scrollbar (no visible slider)', () => {
    renderProfile('katie');
    const list = screen.getByTestId('profile-tabs');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });
});

