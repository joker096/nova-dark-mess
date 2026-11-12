/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { forwardRef, useEffect, useRef } from 'react';

vi.mock('./context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));
vi.mock('./hooks/useSecurity', () => ({
  useSecurity: () => ({ isLocked: false, pinHash: null, unlock: vi.fn() }),
}));

const capturedRef: { current: { openFolderModal: () => void } | null } = { current: null };

function MockChatsScreen(
  _props: unknown,
  ref: React.Ref<{ openFolderModal: () => void }>,
) {
  const handle = useRef({ openFolderModal: vi.fn() }).current;
  if (ref) {
    if (typeof ref === 'function') {
      ref(handle);
    } else {
      (ref as React.MutableRefObject<{ openFolderModal: () => void } | null>).current = handle;
    }
  }
  useEffect(() => {
    if (ref) capturedRef.current = handle;
  }, [ref, handle]);
  return <div data-testid="chats-screen" />;
}
vi.mock('./components/ChatsScreen', () => ({ ChatsScreen: forwardRef(MockChatsScreen) }));
vi.mock('./components/ChatScreen', () => ({ ChatScreen: vi.fn(() => <div data-testid="chat-screen" />) }));
vi.mock('./components/ChannelScreen', () => ({
  ChannelScreen: vi.fn(() => <div data-testid="channel-screen" />),
}));
vi.mock('./components/ProfileScreen', () => ({
  ProfileScreen: vi.fn(() => <div data-testid="profile-screen" />),
}));
vi.mock('./components/AnalyticsScreen', () => ({
  AnalyticsScreen: vi.fn(() => <div data-testid="analytics-screen" />),
}));
vi.mock('./components/SettingsModal', () => ({
  SettingsModal: vi.fn(({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="settings-modal" data-isopen={String(isOpen)} />
  )),
}));
vi.mock('./components/AppIcon', () => ({ AppIcon: vi.fn(() => <div data-testid="app-icon" />) }));
vi.mock('./components/PinLockScreen', () => ({
  PinLockScreen: vi.fn(() => <div data-testid="pin-lock" />),
}));

import App from './App';

describe('App - desktop navigation rail', () => {
  beforeEach(() => {
    capturedRef.current = null;
    vi.clearAllMocks();
  });

  it('renders a Folders button in the desktop rail', () => {
    render(<App />);
    const foldersBtns = screen.getAllByRole('button', { name: 'folders' });
    expect(foldersBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('desktop Folders button opens folder modal via ref, not settings', async () => {
    render(<App />);
    const foldersBtn = screen.getAllByRole('button', { name: 'folders' })[0];
    fireEvent.click(foldersBtn);
    expect(capturedRef.current?.openFolderModal).toBeTruthy();
    expect(capturedRef.current?.openFolderModal).toHaveBeenCalledTimes(1);
    // settings modal should NOT be opened by the Folders button
    const settingsModal = await screen.findByTestId('settings-modal');
    expect(settingsModal.getAttribute('data-isopen')).toBe('false');
  });

  it('does not render the app icon in the desktop rail', () => {
    render(<App />);
    expect(screen.queryByTestId('app-icon')).toBeNull();
  });

  it('replaces the chat list with the channel list on the Channels screen', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'common.channels' }));

    expect(screen.queryByTestId('chats-screen')).toBeNull();
    expect(screen.getByText('Real Kyiv Life')).toBeInTheDocument();
  });
});
