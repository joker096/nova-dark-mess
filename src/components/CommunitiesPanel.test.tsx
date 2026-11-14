/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommunitiesPanel } from './CommunitiesPanel';
import type { ChannelInfo } from '../types/messenger';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const channel = {
  id: 'photo-channel',
  name: 'Photo Channel',
  description: '',
  avatar: '',
  coverImage: '',
  subscribers: 1,
  createdAt: 1,
  isOwned: true,
  visibility: 'public',
} as ChannelInfo;

function renderPanel(extra: Partial<Parameters<typeof CommunitiesPanel>[0]> = {}) {
  const onOpenChannel = vi.fn();
  const onOpenChat = vi.fn();
  render(
    <CommunitiesPanel
      channels={[channel]}
      localFingerprint="nova_pk_self"
      onOpenChannel={onOpenChannel}
      onOpenChat={onOpenChat}
      {...extra}
    />,
  );
  return { onOpenChannel, onOpenChat };
}

describe('CommunitiesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a community linking a channel and a discussion group', () => {
    const { onOpenChannel } = renderPanel();
    expect(screen.getByText('communities.empty')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'communities.create' }));
    fireEvent.change(screen.getByLabelText('communities.nameLabel'), {
      target: { value: 'Kyiv Photo Club' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'communities.createAction' }));

    expect(screen.getByText('Kyiv Photo Club')).toBeTruthy();
    expect(screen.getByText('communities.admin')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'communities.openChannel: Photo Channel' }),
    );
    expect(onOpenChannel).toHaveBeenCalledWith('photo-channel');

    // Persisted on-device so the community survives a remount.
    const raw = localStorage.getItem('nova_communities');
    expect(raw).toContain('Kyiv Photo Club');
  });

  it('rejects an empty name without creating anything', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'communities.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'communities.createAction' }));

    expect(screen.getByRole('alert').textContent).toBe('communities.nameRequired');
    expect(screen.queryByText('communities.admin')).toBeNull();
  });

  it('edits the linked channel and deletes the community', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'communities.create' }));
    fireEvent.change(screen.getByLabelText('communities.nameLabel'), {
      target: { value: 'Kyiv Photo Club' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'communities.createAction' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'communities.edit: Kyiv Photo Club' }),
    );
    expect(screen.getByText('communities.editTitle')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('communities.nameLabel'), {
      target: { value: 'Kyiv Photo Guild' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'communities.save' }));

    expect(screen.getByText('Kyiv Photo Guild')).toBeTruthy();
    expect(screen.queryByText('Kyiv Photo Club')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'communities.delete: Kyiv Photo Guild' }),
    );
    expect(screen.getByText('communities.deletePrompt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'communities.delete' }));

    expect(screen.getByText('communities.empty')).toBeTruthy();
    expect(localStorage.getItem('nova_communities')).toBe('{"communities":[]}');
  });

  it('opens the linked discussion group', () => {
    const { onOpenChat } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'communities.create' }));
    fireEvent.change(screen.getByLabelText('communities.nameLabel'), {
      target: { value: 'Night Rides' },
    });
    const discussion = screen.getByLabelText('communities.discussionLabel') as HTMLSelectElement;
    const discussionId = discussion.value;
    fireEvent.click(screen.getByRole('button', { name: 'communities.createAction' }));

    const openDiscussion = screen
      .getAllByRole('button')
      .find((button) => (button.getAttribute('aria-label') ?? '').startsWith('communities.openDiscussion:'));
    expect(openDiscussion).toBeTruthy();
    fireEvent.click(openDiscussion!);
    expect(onOpenChat).toHaveBeenCalledWith(discussionId);
  });
});
