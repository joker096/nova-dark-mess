/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import { ProfileScreen } from './ProfileScreen';
import {
  CONTACT_PROFILES,
  CURRENT_USER,
  KATIE_SHARED_MEDIA,
} from '../data/mockMessengerData';
import { CONTACT_OVERRIDES_KEY } from '../lib/contacts/contactOverrides';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'profile.devicesMany') return `${opts?.count} devices`;
      if (key === 'profile.deviceOne') return '1 device';
      if (key === 'profile.itemsCount') return `${opts?.count} items`;
      if (key === 'profile.mediaPosition') return `${opts?.current} of ${opts?.total}`;
      if (key === 'profile.sharedWith') return `Shared with ${opts?.name}`;
      if (key === 'profile.downloading') return `Downloading ${opts?.name}...`;
      if (key === 'profile.playingVoice') return `Playing voice note (${opts?.duration})...`;
      if (key === 'profile.voiceMessage') return `Voice message (${opts?.duration})`;
      return key;
    },
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

const securityState = vi.hoisted(() => ({
  identity: null as null | { signingPublicKey: string; fingerprint: string },
}));

vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({ identity: securityState.identity }),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,abc123'),
}));

vi.mock('./VideoCallOverlay', () => ({
  VideoCallOverlay: ({ isOpen, contactName }: { isOpen: boolean; contactName: string }) =>
    isOpen ? <div data-testid="video-call-overlay">{contactName}</div> : null,
}));

const initialProfiles = Object.fromEntries(
  Object.entries(CONTACT_PROFILES).map(([id, profile]) => [id, { ...profile }]),
);

const renderProfile = (
  profileId = CURRENT_USER.id,
  props: { onOpenSettings?: () => void; onOpenChat?: () => void; onBack?: () => void } = {},
) =>
  render(
    <ProfileScreen
      profileId={profileId}
      onBack={props.onBack ?? vi.fn()}
      onOpenChat={props.onOpenChat ?? vi.fn()}
      onOpenSettings={props.onOpenSettings}
    />,
  );

const firstMedia = KATIE_SHARED_MEDIA[0];
const firstVideo = KATIE_SHARED_MEDIA.find((item) => item.type === 'video')!;

beforeEach(() => {
  localStorage.clear();
  securityState.identity = null;
  for (const [id, profile] of Object.entries(initialProfiles)) {
    Object.assign(CONTACT_PROFILES[id], profile);
  }
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
  Object.defineProperty(navigator, 'share', {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    value: vi.fn(async () => undefined),
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfileScreen - ID-based anonymous profile', () => {
  it('renders nickname as the primary identifier, not phone', () => {
    renderProfile('katie');
    expect(screen.getByText('profile.nickname')).toBeTruthy();
    expect(screen.getByText('@Katie_Rogers')).toBeTruthy();
    expect(screen.queryByText('Phone Number')).toBeNull();
  });

  it('renders additional phone as an optional secondary field', () => {
    renderProfile('katie');
    expect(screen.getByText('profile.additionalPhone')).toBeTruthy();
    expect(screen.getByText('+38 063 980 20 90')).toBeTruthy();
  });

  it('does not render call or video call placeholders', () => {
    renderProfile('kurt');
    expect(screen.queryByText('Call')).toBeNull();
    expect(screen.queryByText('Video call')).toBeNull();
    expect(screen.queryByText('Calling...')).toBeNull();
  });
});

describe('ProfileScreen - header and avatar', () => {
  it('exposes 44px header actions and calls onBack', () => {
    const onBack = vi.fn();
    renderProfile('katie', { onBack });

    const back = screen.getByTitle('common.back');
    expect(back.className).toContain('w-11');
    expect(back.className).toContain('h-11');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(screen.getByTitle('common.share')).toBeTruthy();
    expect(screen.getByTitle('profile.editContact')).toBeTruthy();
  });

  it('renders the avatar image instead of hiding it behind initials', () => {
    renderProfile('katie');
    expect(screen.getByAltText('Katie Rogers')).toBeTruthy();
    expect(screen.queryByText('KR')).toBeNull();
  });

  it('keeps avatar edit and remove buttons outside the clipped avatar circle', () => {
    renderProfile();
    const edit = screen.getByRole('button', { name: 'profile.changeAvatar' });
    const remove = screen.getByRole('button', { name: 'profile.removeAvatar' });
    expect(edit.className).toContain('w-10');
    expect(edit.className).toContain('h-10');
    expect(edit.parentElement?.className).toContain('relative');
    expect(edit.parentElement?.className).not.toContain('overflow-hidden');
    expect(remove.parentElement?.className).not.toContain('overflow-hidden');
  });

  it('falls back to initials when the avatar fails to load', () => {
    renderProfile('katie');
    fireEvent.error(screen.getByAltText('Katie Rogers'));
    expect(screen.getByText('KR')).toBeTruthy();
    expect(screen.queryByAltText('Katie Rogers')).toBeNull();
  });

  it('applies a stored contact avatar override', () => {
    localStorage.setItem(
      CONTACT_OVERRIDES_KEY,
      JSON.stringify({ katie: { avatar: '' } }),
    );
    renderProfile('katie');

    expect(screen.getByText('KR')).toBeTruthy();
    expect(screen.queryByAltText('Katie Rogers')).toBeNull();
  });

  it('removes the own avatar and persists it in the account', () => {
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'profile.removeAvatar' }));

    expect(screen.getByText('J')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem('nova_account_profile_v1')!);
    expect(stored.avatar).toBe('');
  });
});

describe('ProfileScreen - quick actions', () => {
  it('opens the chat from Message', () => {
    const onOpenChat = vi.fn();
    renderProfile('katie', { onOpenChat });
    const message = screen.getByRole('button', { name: 'profile.message' });
    expect(message.className).toContain('min-h-[76px]');
    fireEvent.click(message);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the audio call overlay', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.audio' }));
    expect(screen.getByText('Calling...')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.queryByText('Calling...')).toBeNull();
  });

  it('opens the video call overlay', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.video' }));
    expect(screen.getByTestId('video-call-overlay').textContent).toBe('Katie Rogers');
  });

  it('opens settings from More on the own profile', () => {
    const onOpenSettings = vi.fn();
    renderProfile(CURRENT_USER.id, { onOpenSettings });
    fireEvent.click(screen.getByText('settings.title').closest('button')!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('does not expose settings for another contact', () => {
    const onOpenSettings = vi.fn();
    renderProfile('katie', { onOpenSettings });
    expect(screen.queryByText('settings.title')).toBeNull();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});

describe('ProfileScreen - inline field editing', () => {
  const nicknameRow = () =>
    screen.getByText('profile.nickname').closest('div')!.parentElement!.parentElement!;
  const phoneRow = () =>
    screen.getByText('profile.additionalPhone').closest('div')!.parentElement!.parentElement!;

  it('edits the nickname and persists it locally', () => {
    renderProfile('katie');
    fireEvent.click(within(nicknameRow()).getByTitle('common.edit'));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NewNick' } });
    fireEvent.click(screen.getByTitle('common.save'));

    expect(screen.getByText('NewNick')).toBeTruthy();
    expect(screen.queryByText('@Katie_Rogers')).toBeNull();
    expect(JSON.parse(localStorage.getItem(CONTACT_OVERRIDES_KEY)!).katie.nickname).toBe('NewNick');
  });

  it('edits the additional phone number', () => {
    renderProfile('katie');
    fireEvent.click(within(phoneRow()).getByTitle('common.edit'));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '+1 234 5678' } });
    fireEvent.click(screen.getByTitle('common.save'));

    expect(screen.getByText('+1 234 5678')).toBeTruthy();
    expect(screen.queryByText('+38 063 980 20 90')).toBeNull();
  });

  it('cancelling the edit keeps the original value', () => {
    renderProfile('katie');
    fireEvent.click(within(nicknameRow()).getByTitle('common.edit'));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByTitle('common.cancel'));

    expect(screen.getByText('@Katie_Rogers')).toBeTruthy();
    expect(screen.queryByText('Discarded')).toBeNull();
  });

  it('copies the handle to the clipboard', async () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.copy' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nova://katie_rogers');
    });
  });
});

describe('ProfileScreen - contact options', () => {
  it('opens an anchored menu with working contact actions', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));

    const menu = screen.getByRole('menu', { name: 'profile.contactOptions' });
    expect(within(menu).getByText('profile.editContact')).toBeTruthy();
    expect(within(menu).getByText('profile.copyId')).toBeTruthy();
  });

  it('edits a contact through the modal and persists every field', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('profile.editContact'));

    fireEvent.change(screen.getByLabelText('profile.name'), {
      target: { value: 'Katie Updated' },
    });
    fireEvent.change(screen.getByLabelText('profile.nickname'), {
      target: { value: '@Katie_New' },
    });
    fireEvent.change(screen.getByLabelText('profile.phone'), {
      target: { value: '+1 555 0100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(screen.getByText('Katie Updated')).toBeTruthy();
    expect(screen.getByText('@Katie_New')).toBeTruthy();
    expect(screen.getByText('+1 555 0100')).toBeTruthy();
    expect(screen.getByText('profile.contactUpdated')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(CONTACT_OVERRIDES_KEY)!).katie).toEqual({
      name: 'Katie Updated',
      nickname: '@Katie_New',
      phone: '+1 555 0100',
    });
  });

  it('opens contact editing from the header pencil', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByTitle('profile.editContact'));
    expect(screen.getByLabelText('profile.name')).toBeTruthy();
  });

  it('cancels contact editing without persisting', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('profile.editContact'));

    fireEvent.change(screen.getByLabelText('profile.name'), {
      target: { value: 'Discarded Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('Discarded Name')).toBeNull();
    expect(localStorage.getItem(CONTACT_OVERRIDES_KEY)).toBeNull();
  });

  it('copies the contact ID and shows feedback', async () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(screen.getByText('profile.copyId'));

    expect(screen.queryByRole('menu', { name: 'profile.contactOptions' })).toBeNull();
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('katie');
      expect(screen.getByText('profile.contactIdCopied')).toBeTruthy();
    });
  });

  it('opens the share modal from the menu', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'profile.contactOptions' })).getByRole(
        'menuitem',
        { name: 'common.share' },
      ),
    );
    expect(screen.getByText('contact.shareTitle')).toBeTruthy();
  });

  it('closes the menu with Escape and with an outside click', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.keyDown(screen.getByRole('menu', { name: 'profile.contactOptions' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('menu', { name: 'profile.contactOptions' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: 'profile.contactOptions' })).toBeNull();
  });

  it('applies a stored contact override on mount', () => {
    localStorage.setItem(
      CONTACT_OVERRIDES_KEY,
      JSON.stringify({ katie: { name: 'Stored Katie', nickname: '@stored', phone: '+9 999' } }),
    );
    renderProfile('katie');
    expect(screen.getByText('Stored Katie')).toBeTruthy();
    expect(screen.getByText('@stored')).toBeTruthy();
    expect(screen.getByText('+9 999')).toBeTruthy();
  });
});

describe('ProfileScreen - QR and security modals', () => {
  it('generates a real QR code and closes with Escape', async () => {
    renderProfile('katie');
    await act(async () => {
      fireEvent.click(screen.getByTitle('common.contact'));
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByAltText('QR Code').getAttribute('src')).toBe(
      'data:image/png;base64,abc123',
    );

    fireEvent.keyDown(document.documentElement, { key: 'Escape' });
    expect(screen.queryByAltText('QR Code')).toBeNull();
  });

  it('opens the safety number dialog for the own profile', async () => {
    securityState.identity = {
      signingPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      fingerprint: 'ABCDEF0123456789',
    };
    renderProfile();
    await act(async () => {
      fireEvent.click(screen.getByTitle('profile.safetyNumber'));
      await Promise.resolve();
    });
    expect(screen.getByPlaceholderText('Paste contact safety number')).toBeTruthy();
    fireEvent.keyDown(document.documentElement, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Paste contact safety number')).toBeNull();
  });

  it('opens the share contact modal from the header', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByTitle('common.share'));
    expect(screen.getByText('contact.shareTitle')).toBeTruthy();
  });
});

describe('ProfileScreen - media tabs and lightbox', () => {
  it('shows an empty state instead of leaking another contact media', () => {
    renderProfile('thailand');
    expect(screen.getByTestId('profile-media-empty').textContent).toBe(
      'profile.noSharedMedia',
    );
    expect(screen.queryByRole('button', { name: firstMedia.caption })).toBeNull();
  });

  it('filters photos and videos', () => {
    renderProfile('katie');
    expect(screen.getByRole('button', { name: firstVideo.caption })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /profile\.photos/ }));
    expect(screen.queryByRole('button', { name: firstVideo.caption })).toBeNull();
    expect(screen.getByRole('button', { name: firstMedia.caption })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /profile\.videos/ }));
    expect(screen.queryByRole('button', { name: firstMedia.caption })).toBeNull();
    expect(screen.getByRole('button', { name: firstVideo.caption })).toBeTruthy();
  });

  it('opens the lightbox, navigates with buttons and closes with Escape', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: firstMedia.caption }));
    const lightbox = screen.getByTestId('media-lightbox');
    expect(within(lightbox).getByText(`1 of ${KATIE_SHARED_MEDIA.length}`)).toBeTruthy();

    fireEvent.click(within(lightbox).getByRole('button', { name: 'common.next' }));
    expect(within(lightbox).getByText(`2 of ${KATIE_SHARED_MEDIA.length}`)).toBeTruthy();

    fireEvent.click(within(lightbox).getByRole('button', { name: 'common.previous' }));
    expect(within(lightbox).getByText(`1 of ${KATIE_SHARED_MEDIA.length}`)).toBeTruthy();

    fireEvent.keyDown(document.documentElement, { key: 'Escape' });
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
  });

  it('swipes between media items on touch devices', () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: firstMedia.caption }));
    const lightbox = screen.getByTestId('media-lightbox');

    fireEvent.touchStart(lightbox, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(lightbox, { changedTouches: [{ clientX: 80 }] });
    expect(within(lightbox).getByText(`2 of ${KATIE_SHARED_MEDIA.length}`)).toBeTruthy();

    fireEvent.touchStart(lightbox, { touches: [{ clientX: 80 }] });
    fireEvent.touchEnd(lightbox, { changedTouches: [{ clientX: 220 }] });
    expect(within(lightbox).getByText(`1 of ${KATIE_SHARED_MEDIA.length}`)).toBeTruthy();
  });

  it('shares media through the clipboard fallback and downloads it', async () => {
    renderProfile('katie');
    fireEvent.click(screen.getByRole('button', { name: firstMedia.caption }));
    const lightbox = screen.getByTestId('media-lightbox');

    fireEvent.click(within(lightbox).getByRole('button', { name: 'common.share' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(firstMedia.url);
      expect(screen.getByText('profile.sharedToClipboard')).toBeTruthy();
    });

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(within(lightbox).getByRole('button', { name: 'profile.download' }));
    expect(screen.getByText('profile.downloaded')).toBeTruthy();
  });

  it('opens the chat from the lightbox', () => {
    const onOpenChat = vi.fn();
    renderProfile('katie', { onOpenChat });
    fireEvent.click(screen.getByRole('button', { name: firstMedia.caption }));
    fireEvent.click(screen.getByText('profile.showInChat'));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('media-lightbox')).toBeNull();
  });

  it('downloads files, copies links and plays voice notes', async () => {
    renderProfile('katie');

    fireEvent.click(screen.getByRole('button', { name: /common\.files/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'profile.download' })[0]);
    expect(screen.getByText('Downloading Trip_Schedule_Kyiv.pdf...')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /common\.links/ }));
    fireEvent.click(screen.getByText('Harry’s Bar & Kitchen'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://harrysbar.com');
      expect(screen.getByText('profile.linkCopied')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /common\.voice/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'profile.playVoice' })[0]);
    expect(screen.getByText('Playing voice note (0:42)...')).toBeTruthy();
  });
});

describe('ProfileScreen - own account actions', () => {
  it('edits and persists the display name for the own account', () => {
    renderProfile();
    fireEvent.click(screen.getByTitle('profile.editProfile'));

    const input = screen.getByLabelText('profile.name');
    fireEvent.change(input, { target: { value: 'Nova Tester' } });
    fireEvent.click(screen.getByLabelText('common.save'));

    expect(screen.getByText('Nova Tester')).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem('nova_account_profile_v1')!).displayName,
    ).toBe('Nova Tester');
  });
});

describe('ProfileScreen - device linking', () => {
  const identity = {
    signingPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    fingerprint: 'ABCDEF0123456789',
  };

  beforeEach(() => {
    securityState.identity = identity;
  });

  const openDeviceLink = async () => {
    renderProfile();
    await act(async () => {
      fireEvent.click(screen.getByText('profile.linkDevice'));
      await Promise.resolve();
    });
  };

  it('completes the two-device handshake through link and reply codes', async () => {
    await openDeviceLink();

    const link = await screen.findByTestId('device-link-url');
    const offerUrl = link.textContent ?? '';
    expect(offerUrl).toContain('nova://device-link?');

    fireEvent.click(screen.getByText('New device'));
    fireEvent.change(screen.getByLabelText('Device link offer'), {
      target: { value: offerUrl },
    });
    fireEvent.click(screen.getByText('Create reply code'));

    const reply = screen.getByTestId('device-link-reply').textContent ?? '';
    expect(reply).toContain('nova://device-link-response?');

    fireEvent.click(screen.getByText('This device'));
    fireEvent.change(screen.getByLabelText('Device link reply'), { target: { value: reply } });
    fireEvent.click(screen.getByText('Complete linking'));

    expect(screen.getByText(/Handshake complete/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect(screen.getByText('2 devices')).toBeTruthy();
  });

  it('rejects an invalid link without creating a reply code', async () => {
    await openDeviceLink();

    fireEvent.click(screen.getByText('New device'));
    fireEvent.change(screen.getByLabelText('Device link offer'), {
      target: { value: 'https://example.com/device-link?code=ABCDEF' },
    });
    fireEvent.click(screen.getByText('Create reply code'));

    expect(screen.getByRole('alert').textContent).toContain(
      'not a valid Nova device link',
    );
    expect(screen.queryByTestId('device-link-reply')).toBeNull();
  });

  it('toggles camera QR scanner in new device mode and captures link', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => mockStream),
      },
      configurable: true,
      writable: true,
    });

    await openDeviceLink();
    await screen.findByTestId('device-link-url');

    fireEvent.click(screen.getByText('New device'));

    const toggleBtn = screen.getByTestId('toggle-camera-scan');
    expect(toggleBtn.textContent).toContain('Scan QR with camera');

    await act(async () => {
      fireEvent.click(toggleBtn);
      await Promise.resolve();
    });

    expect(screen.getByTestId('camera-video-preview')).toBeTruthy();
    expect(screen.getByText('Stop camera scan')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('capture-qr-button'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('camera-video-preview')).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('runs live encrypted history transfer across linked devices', async () => {
    await openDeviceLink();

    const link = await screen.findByTestId('device-link-url');
    const offerUrl = link.textContent ?? '';

    fireEvent.click(screen.getByText('New device'));
    fireEvent.change(screen.getByLabelText('Device link offer'), {
      target: { value: offerUrl },
    });
    fireEvent.click(screen.getByText('Create reply code'));

    const reply = screen.getByTestId('device-link-reply').textContent ?? '';

    fireEvent.click(screen.getByText('This device'));
    fireEvent.change(screen.getByLabelText('Device link reply'), { target: { value: reply } });

    await act(async () => {
      fireEvent.click(screen.getByText('Complete linking'));
      await Promise.resolve();
    });

    expect(screen.getByText(/Handshake complete/)).toBeTruthy();

    fireEvent.click(screen.getByText('New device'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('sync-history-secondary'));
      await Promise.resolve();
    });

    expect(await screen.findByText(/History synced/, {}, { timeout: 5000 })).toBeTruthy();
  });
});

describe('ProfileScreen - horizontal lists', () => {
  it('uses a generated gap class and hides the scrollbar', () => {
    renderProfile('katie');
    const list = screen.getByTestId('profile-tabs');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).toContain('gap-2');
    expect(list.className).not.toContain('gap-[2]');
    expect(list.className).not.toContain('scrollbar-x');
  });
});
