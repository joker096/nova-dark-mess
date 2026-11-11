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

const renderChats = (extra: Record<string, unknown> = {}) =>
  render(
    <ChatsScreen
      onSelectChat={vi.fn()}
      onOpenChannel={vi.fn()}
      onOpenProfile={onOpenProfile}
      onOpenFolders={onOpenFolders}
      activeChatId={'katie'}
      activeNavTab={'chats'}
      {...extra}
    />,
  );

describe('ChatsScreen - mobile bottom navigation (localized)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 5 bottom-nav tabs with localized keys', () => {
    renderChats();
    expect(screen.getByRole('button', { name: 'chats.title' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'channels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'folders' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'profile.title' }).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onOpenFolders when Folders tab clicked', () => {
    renderChats();
    fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(onOpenFolders).toHaveBeenCalledTimes(1);
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
