/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatsScreen } from './ChatsScreen';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

// Mock FolderModal to keep ChatsScreen tests focused on wiring.
vi.mock('./FolderModal', () => ({
  FolderModal: vi.fn(() => <div data-testid="folder-modal">FolderModal</div>),
}));

const onOpenFolders = vi.fn();
const onOpenProfile = vi.fn();
const onOpenMeshMap = vi.fn();

const renderChats = (extra: Record<string, unknown> = {}) =>
  render(
    <ChatsScreen
      onSelectChat={vi.fn()}
      onOpenChannel={vi.fn()}
      onOpenProfile={onOpenProfile}
      onOpenFolders={onOpenFolders}
      onOpenMeshMap={onOpenMeshMap}
      activeChatId={'katie'}
      activeNavTab={'chats'}
      {...extra}
    />,
  );

describe('ChatsScreen - mobile bottom navigation (localized)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 7 bottom-nav tabs with localized keys', () => {
    renderChats();
    expect(screen.getByRole('button', { name: 'chats.title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'channels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'folders' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'profile.title' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'analytics.title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'meshMap.title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'settings.title' })).toBeTruthy();
  });

  it('calls onOpenFolders when Folders tab clicked', () => {
    renderChats();
    fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(onOpenFolders).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenMeshMap when Mesh Map tab clicked', () => {
    renderChats();
    fireEvent.click(screen.getByRole('button', { name: 'meshMap.title' }));
    expect(onOpenMeshMap).toHaveBeenCalledTimes(1);
  });

});

describe('ChatsScreen - forwardRef openFolderModal', () => {
  it('exposes openFolderModal via ref', () => {
    const refCallback = vi.fn();
    render(
      <ChatsScreen
        ref={refCallback as unknown as React.Ref<{ openFolderModal: () => void }>}
        onSelectChat={vi.fn()}
        onOpenChannel={vi.fn()}
        onOpenProfile={vi.fn()}
      />,
    );
    expect(refCallback).toHaveBeenCalledTimes(1);
    const handle = refCallback.mock.calls[0][0];
    expect(handle).toBeTruthy();
    expect(typeof handle.openFolderModal).toBe('function');
  });

  it('calling ref openFolderModal renders folder modal', () => {
    const refCallback = vi.fn();
    render(
      <ChatsScreen
        ref={refCallback as unknown as React.Ref<{ openFolderModal: () => void }>}
        onSelectChat={vi.fn()}
        onOpenChannel={vi.fn()}
        onOpenProfile={vi.fn()}
      />,
    );
    const handle = refCallback.mock.calls[0][0];
    handle.openFolderModal();
    expect(screen.getByTestId('folder-modal')).toBeTruthy();
  });
});

describe('ChatsScreen - default folders render', () => {
  it('renders default folder tabs (All, Personal, Work, Channels, Favorites)', () => {
    renderChats();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Channels')).toBeTruthy();
    expect(screen.getByText('Favorites')).toBeTruthy();
  });
});

describe('ChatsScreen - join request indicators', () => {
  const LOCAL = 'nova_pk_test1234567890';

  beforeEach(() => {
    localStorage.removeItem('nova_group_roles_thailand');
    localStorage.removeItem('nova_group_membership_thailand');
    localStorage.removeItem('nova_group_join_requests_thailand');
    localStorage.removeItem('nova_group_join_outbox');
  });

  it('shows the pending join request count on a group an admin owns', () => {
    localStorage.setItem('nova_group_roles_thailand', JSON.stringify({ [LOCAL]: 'admin' }));
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([
        { fingerprint: 'nova_pk_peer', name: 'Bob', status: 'pending', createdAt: 1 },
      ]),
    );

    renderChats({ localFingerprint: LOCAL });

    const badge = screen.getByTestId('join-pending-thailand');
    expect(badge.textContent).toContain('1');
  });

  it('hides requests from plain members and the invitee\'s own request', () => {
    localStorage.setItem('nova_group_roles_thailand', JSON.stringify({ [LOCAL]: 'member' }));
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([
        { fingerprint: 'nova_pk_peer', status: 'pending', createdAt: 1 },
      ]),
    );
    const { unmount } = renderChats({ localFingerprint: LOCAL });
    expect(screen.queryByTestId('join-pending-thailand')).toBeNull();
    unmount();

    localStorage.setItem('nova_group_roles_thailand', JSON.stringify({ [LOCAL]: 'admin' }));
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([{ fingerprint: LOCAL, status: 'pending', createdAt: 1 }]),
    );
    renderChats({ localFingerprint: LOCAL });
    expect(screen.queryByTestId('join-pending-thailand')).toBeNull();
  });

  it('lets an admin approve and decline requests straight from the list', () => {
    localStorage.setItem('nova_group_roles_thailand', JSON.stringify({ [LOCAL]: 'admin' }));
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([
        { fingerprint: 'nova_pk_peer', name: 'Bob', status: 'pending', createdAt: 1 },
        { fingerprint: 'nova_pk_eve', name: 'Eve', status: 'pending', createdAt: 2 },
      ]),
    );

    renderChats({ localFingerprint: LOCAL });

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.approveJoinRequest: nova_pk_peer' }),
    );
    expect(screen.queryByRole('button', { name: 'chat.approveJoinRequest: nova_pk_peer' })).toBeNull();

    const requests = JSON.parse(
      localStorage.getItem('nova_group_join_requests_thailand') || '[]',
    ) as Array<{ fingerprint: string; status: string }>;
    expect(requests.find((entry) => entry.fingerprint === 'nova_pk_peer')?.status).toBe('approved');

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.rejectJoinRequest: nova_pk_eve' }),
    );
    expect(screen.queryByTestId('join-actions-thailand')).toBeNull();

    const stored = JSON.parse(
      localStorage.getItem('nova_group_join_requests_thailand') || '[]',
    ) as Array<{ fingerprint: string; status: string }>;
    expect(stored.find((entry) => entry.fingerprint === 'nova_pk_eve')?.status).toBe('rejected');
    // Both decisions wait for the session relay, and the approved peer joins
    // the local roster.
    expect(localStorage.getItem('nova_group_join_outbox')).toContain('nova_pk_peer');
    expect(localStorage.getItem('nova_group_roles_thailand')).toContain('nova_pk_peer');
  });

  it('marks a group whose join request is still waiting for approval', () => {
    localStorage.setItem('nova_group_membership_thailand', 'pending');

    renderChats({ localFingerprint: LOCAL });

    expect(screen.getByTestId('join-waiting-thailand').textContent).toContain('chats.joinWaiting');
  });
});

describe('ChatsScreen - horizontal lists hide scrollbar', () => {
  it('quick search chips list uses no-scrollbar (no visible slider)', () => {
    renderChats();
    const list = screen.getByTestId('quick-search-chips');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });

  it('stories row uses no-scrollbar (no visible slider)', () => {
    renderChats();
    const list = screen.getByTestId('stories-row');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });

  it('folder tabs use no-scrollbar (no visible slider)', () => {
    renderChats();
    const list = screen.getByTestId('folder-tabs');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });
});
