/// <reference types="vitest/globals" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChannelCreateModal } from './ChannelCreateModal';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

describe('ChannelCreateModal - visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (onCreate = vi.fn(), onClose = vi.fn()) =>
    render(<ChannelCreateModal isOpen onClose={onClose} onCreate={onCreate} />);

  it('creates a public channel by default', () => {
    const onCreate = vi.fn();
    renderModal(onCreate);

    fireEvent.change(screen.getByPlaceholderText('channel.channelNamePlaceholder'), {
      target: { value: 'City news' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'channel.create' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'City news', visibility: 'public' }),
    );
  });

  it('creates a private channel when the private option is selected', () => {
    const onCreate = vi.fn();
    renderModal(onCreate);

    fireEvent.change(screen.getByPlaceholderText('channel.channelNamePlaceholder'), {
      target: { value: 'Secret club' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'channel.private' }));
    expect(screen.getByRole('button', { name: 'channel.private' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'channel.create' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Secret club', visibility: 'private' }),
    );
  });
});