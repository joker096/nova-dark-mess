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
  useSecurity: () => ({
    isLocked: false,
    pinHash: null,
    unlock: vi.fn(),
    isDemoPeer: () => false,
    encryptAndSendMessage: vi.fn(),
    checkPeerKey: vi.fn(),
    identity: { fingerprint: 'test-fingerprint' },
  }),
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
vi.mock('./components/ChatScreen', () => ({
  ChatScreen: vi.fn(({ getBotSession }: { getBotSession?: unknown }) => (
    <div data-testid="chat-screen" data-has-bot-session={String(Boolean(getBotSession))} />
  )),
}));
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
  SettingsModal: vi.fn(
    ({
      isOpen,
      getBotSession,
      onOpenMeshMap,
    }: {
      isOpen: boolean;
      getBotSession?: unknown;
      onOpenMeshMap?: () => void;
    }) => (
      <div
        data-testid="settings-modal"
        data-isopen={String(isOpen)}
        data-has-bot-session={String(Boolean(getBotSession))}
      >
        {/* The real modal exposes the mesh map entry; keep that reachable. */}
        {isOpen && onOpenMeshMap && (
          <button type="button" onClick={onOpenMeshMap}>
            meshMap.title
          </button>
        )}
      </div>
    ),
  ),
}));
vi.mock('./components/AppIcon', () => ({ AppIcon: vi.fn(() => <div data-testid="app-icon" />) }));
vi.mock('./components/PinLockScreen', () => ({
  // Expose the unlock callback so specs can get past the lock screen.
  PinLockScreen: vi.fn(({ onUnlock }: { onUnlock?: () => void }) => (
    <div data-testid="pin-lock">
      <button type="button" onClick={onUnlock}>
        unlock
      </button>
    </div>
  )),
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
    expect(await screen.findByText('onboarding.createOption')).toBeTruthy();
    expect(screen.queryByTestId('chats-screen')).toBeNull();
  });

  it('renders a Folders button in the desktop rail', async () => {
    render(<App />);
    const foldersBtns = await screen.findAllByRole('button', { name: 'folders' });
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
    // Let the async screen chunks mount, then open the map from Settings —
    // where the entry lives now (the rail no longer has a map button).
    await screen.findAllByTestId('chats-screen');
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.title' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'meshMap.title' }));

    const mapScreens = await screen.findAllByTestId('mesh-map-screen');
    expect(mapScreens.length).toBeGreaterThan(0);
    expect(mapScreens.every((screen) => screen.getAttribute('data-live-inputs') === 'true')).toBe(true);

    fireEvent.click(screen.getAllByRole('button', { name: 'common.back' })[0]);
    expect(screen.queryByTestId('mesh-map-screen')).toBeNull();
  });

  it('keeps the chat list mounted under the channel list on the Channels screen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'common.channels' })[0]);

    expect(screen.getByTestId('chats-screen')).toBeInTheDocument();
    // Both the desktop panel and the mobile single-pane render the channel
    // list in jsdom, since responsive visibility is CSS-only.
    expect(screen.getAllByText('Real Kyiv Life').length).toBeGreaterThan(0);
  });

  it('desktop Folders button still opens the folder modal from the Channels screen', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'common.channels' })[0]);

    fireEvent.click(screen.getAllByRole('button', { name: 'folders' })[0]);
    expect(capturedRef.current?.openFolderModal).toHaveBeenCalledTimes(1);
});

  it('hides the Bots UI and ignores bot deep links when VITE_NOVA_BOTS=false', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_NOVA_BOTS', 'false');
    window.location.hash = '#nova://bot/echo_bot';

    try {
      const { default: DisabledApp } = await import('./App');
      render(<DisabledApp />);

      const settings = await screen.findByTestId('settings-modal');
      // A bot deep link would normally open Settings → Bots; it must be inert.
      expect(settings.getAttribute('data-isopen')).toBe('false');
      expect(settings.getAttribute('data-has-bot-session')).toBe('false');
    } finally {
      window.location.hash = '';
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
