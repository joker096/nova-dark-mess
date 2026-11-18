/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { forwardRef, useEffect, useRef } from 'react';
import { getGroupMembership } from './lib/social/groupJoinRequests';

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
vi.mock('./components/MeshMap', () => ({
  default: vi.fn(() => <div data-testid="mesh-map-screen" />),
  MeshMap: vi.fn(({ nodes, links }: { nodes?: unknown[]; links?: unknown[] }) => (
    <div
      data-testid="mesh-map-screen"
      data-live-inputs={String(Array.isArray(nodes) && Array.isArray(links))}
    />
  )),
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
    // Except for the explicit first-launch test, these specs run on an app that
    // has already been through the onboarding wizard.
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: '2026-01-01T00:00:00.000Z', path: 'create' }),
    );
  });

  it('shows the onboarding wizard on a fresh install', async () => {
    localStorage.removeItem('nova_onboarding_v1');
    render(<App />);
    expect(await screen.findByTestId('onboarding-wizard')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'onboarding.continue' })).toBeTruthy();
    expect(screen.queryByTestId('chats-screen')).toBeNull();
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

  it('opens a channel from a deep link hash', async () => {
    window.location.hash = '#nova://channel/kyiv-channel';
    render(<App />);
    expect((await screen.findAllByTestId('channel-screen')).length).toBeGreaterThan(0);
    window.location.hash = '';
  });

  it('opens a profile from a universal deep link hash', async () => {
    window.location.hash = '#https://nova.app/profile/katie';
    render(<App />);
    expect((await screen.findAllByTestId('profile-screen')).length).toBeGreaterThan(0);
    window.location.hash = '';
  });

  it('asks before joining a group from an invite link', async () => {
    window.location.hash = '#nova://chat/thailand?invite=abcdef123456';
    render(<App />);

    const dialog = await screen.findByTestId('join-group-dialog');
    expect(dialog.textContent).toContain('Thailand Trip');
    fireEvent.click(screen.getByRole('button', { name: 'chat.joinDecline' }));
    expect(screen.queryByTestId('join-group-dialog')).toBeNull();
    window.location.hash = '';
  });

  it('opens the group after the invite is accepted', async () => {
    window.location.hash = '#nova://chat/thailand?invite=abcdef123456';
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'chat.joinAccept' }));
    expect((await screen.findAllByTestId('chat-screen')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('join-group-dialog')).toBeNull();
    // Accepting an invite only sends a request; an admin still has to approve it.
    expect(getGroupMembership('thailand')).toBe('pending');
    window.location.hash = '';
    localStorage.removeItem('nova_group_membership_thailand');
  });

  it('ignores a deep link to an unknown channel', () => {
    window.location.hash = '#nova://channel/does-not-exist';
    render(<App />);
    expect(screen.queryByTestId('channel-screen')).toBeNull();
    window.location.hash = '';
  });

  it('does not render the app icon in the desktop rail', () => {
    render(<App />);
    expect(screen.queryByTestId('app-icon')).toBeNull();
  });

  it('opens the mesh map from the desktop rail and closes it from the mobile header', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'meshMap.title' }));

    const mapScreens = await screen.findAllByTestId('mesh-map-screen');
    expect(mapScreens.length).toBeGreaterThan(0);
    expect(mapScreens.every((screen) => screen.getAttribute('data-live-inputs') === 'true')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(screen.queryByTestId('mesh-map-screen')).toBeNull();
  });

  it('keeps the chat list mounted under the channel list on the Channels screen', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'common.channels' }));

    expect(screen.getByTestId('chats-screen')).toBeInTheDocument();
    expect(screen.getByText('Real Kyiv Life')).toBeInTheDocument();
  });

  it('desktop Folders button still opens the folder modal from the Channels screen', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'common.channels' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'folders' })[0]);
    expect(capturedRef.current?.openFolderModal).toHaveBeenCalledTimes(1);
  });
});
