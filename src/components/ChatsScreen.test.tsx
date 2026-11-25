/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatsScreen } from './ChatsScreen';
import { FolderModal } from './FolderModal';
import { loadAccount } from '../lib/account/account';
import { selectFolder } from '../lib/chat/folders';
import { invalidateCachedItem } from '../lib/storage/localStorageCache';

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

// GroupModal depends on SecurityProvider; keep these tests focused on wiring.
vi.mock('./GroupModal', () => ({
  GroupModal: vi.fn(() => <div data-testid="group-modal">GroupModal</div>),
}));

const renderChats = (extra: Record<string, unknown> = {}) =>
  render(
    <ChatsScreen
      onSelectChat={vi.fn()}
      onOpenChannel={vi.fn()}
      activeChatId={'katie'}
      {...extra}
    />,
  );

describe('ChatsScreen - header (localized)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('nova_read_chats_v1');
  });

  it('renders a search bar with no menu button (settings via bottom nav)', () => {
    renderChats();
    expect(screen.getByPlaceholderText('Search conversations by contact name...')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'common.menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'analytics.title' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'meshMap.title' })).toBeNull();
  });

  it('shows chat list with contacts', () => {
    renderChats();

    expect(screen.getByText('Katie Rogers')).toBeTruthy();
    expect(screen.getByText('Kurt Williamson')).toBeTruthy();
    expect(screen.queryByText('chats.greeting')).toBeNull();
    expect(screen.queryByText('chats.unreadCount')).toBeNull();
  });

  it('clears a chat unread badge when that conversation is opened', () => {
    const onSelectChat = vi.fn();
    renderChats({ onSelectChat });

    expect(screen.getByTestId('unread-katie').textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /Chat with Katie Rogers/ }));

    expect(screen.queryByTestId('unread-katie')).toBeNull();
    expect(localStorage.getItem('nova_read_chats_v1')).toContain('katie');
    expect(onSelectChat).toHaveBeenCalledWith('katie');
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
      />,
    );
    const handle = refCallback.mock.calls[0][0];
    handle.openFolderModal();
    expect(screen.getByTestId('folder-modal')).toBeTruthy();
  });
});

describe('ChatsScreen - folder selection follows the bottom navigation', () => {
  beforeEach(() => {
    localStorage.removeItem('nova_read_chats_v1');
    invalidateCachedItem('nova_read_chats_v1');
  });

  afterEach(() => {
    selectFolder('all');
    localStorage.removeItem('nova_read_chats_v1');
    invalidateCachedItem('nova_read_chats_v1');
  });

  it('filters the chat list when the navigation selects another folder', () => {
    renderChats();
    expect(screen.getByText('Katie Rogers')).toBeTruthy();

    act(() => {
      selectFolder('work');
    });

    expect(screen.queryByText('Katie Rogers')).toBeNull();
    expect(screen.getByText('Kurt Williamson')).toBeTruthy();
    expect(screen.getByText('Daniel Bowey')).toBeTruthy();
    expect(localStorage.getItem('nova_active_folder_v1')).toBe('work');
    localStorage.removeItem('nova_active_folder_v1');
  });

  it('switches to the next folder on a left swipe and back on a right swipe', () => {
    selectFolder('all');
    renderChats();
    const list = screen.getByTestId('chats-list');

    fireEvent.touchStart(list, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 200, clientY: 404 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 200, clientY: 404 }] });

    expect(localStorage.getItem('nova_active_folder_v1')).toBe('personal');
    expect(screen.getByText('Personal')).toBeTruthy();

    fireEvent.touchStart(list, { touches: [{ clientX: 120, clientY: 400 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 240, clientY: 402 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 240, clientY: 402 }] });

    expect(localStorage.getItem('nova_active_folder_v1')).toBe('all');
  });

  it('keeps the folder when the gesture is mostly vertical or too short', () => {
    selectFolder('work');
    renderChats();
    const list = screen.getByTestId('chats-list');

    fireEvent.touchStart(list, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 160, clientY: 420 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 160, clientY: 420 }] });
    expect(localStorage.getItem('nova_active_folder_v1')).toBe('work');

    fireEvent.touchStart(list, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchMove(list, { touches: [{ clientX: 170, clientY: 300 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 170, clientY: 300 }] });
    expect(localStorage.getItem('nova_active_folder_v1')).toBe('work');
  });

  it('publishes per-folder unread totals for the navigation badges', () => {
    const onUnread = vi.fn();
    window.addEventListener('nova:folder-unread', onUnread);
    renderChats();

    const counts = (onUnread.mock.calls.at(-1)?.[0] as CustomEvent).detail as Record<string, number>;
    expect(counts.all).toBe(16);
    expect(counts.work).toBe(3);
    expect(counts.favorites).toBe(1);
    window.removeEventListener('nova:folder-unread', onUnread);
  });

  it('drops a chat out of the unread totals once it is read', () => {
    localStorage.setItem('nova_read_chats_v1', JSON.stringify(['kurt']));
    const onUnread = vi.fn();
    window.addEventListener('nova:folder-unread', onUnread);
    renderChats();

    const counts = (onUnread.mock.calls.at(-1)?.[0] as CustomEvent).detail as Record<string, number>;
    expect(counts.work).toBe(0);
    expect(counts.personal).toBe(1);
    window.removeEventListener('nova:folder-unread', onUnread);
    localStorage.removeItem('nova_read_chats_v1');
  });

  it('opens the folder manager when the navigation asks for it', () => {
    renderChats();
    act(() => {
      window.dispatchEvent(new Event('nova:open-folder-manager'));
    });
    const lastProps = vi.mocked(FolderModal).mock.calls.at(-1)?.[0] as { isOpen?: boolean };
    expect(lastProps.isOpen).toBe(true);
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

});


