import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnonymousMessengerScreen } from './AnonymousMessengerScreen';
import { generateQueueSigningKeyPair, queueSigningPublicKey } from '../lib/anon/signing';
import { FAILOVER_AFTER_FAILURES } from '../lib/anon/relayHealth';

const mocks = vi.hoisted(() => ({
  db: {
    isReady: vi.fn(),
    loadSetting: vi.fn(),
    saveSetting: vi.fn(),
  },
  createAnonTransport: vi.fn(),
  createInvitation: vi.fn(),
  receiveInboxPackets: vi.fn(),
  ackInboxPackets: vi.fn(),
  sendContactOffer: vi.fn(),
  sendContactMessage: vi.fn(),
  failoverInbox: vi.fn(),
  migrateInbox: vi.fn(),
  checkTorRunning: vi.fn(),
  toDataURL: vi.fn(),
  purchasePremiumGiftCode: vi.fn(),
  clearPendingPremiumGiftOrder: vi.fn(),
}));

vi.mock('qrcode', () => ({ toDataURL: mocks.toDataURL }));

vi.mock('../context/LanguageContext', () => ({
  // This screen keeps its own EN/RU copy table and switches on `language`, so
  // the stub must report a real locale — 'en' here would fall through to RU.
  useLanguage: () => ({ t: (key: string) => key, language: 'en-US' }),
}));

vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({ isInitialized: true }),
}));

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ account: { nickname: '@nova' } }),
}));

vi.mock('../lib/storage/db', () => ({ dbInstance: mocks.db }));

// Mock privacyMode to return empty defaults for tests
vi.mock('../lib/network/privacyMode', () => ({
  loadPrivacyPrefs: () => ({
    metadataMinimization: false,
    presenceSharing: false,
    presenceHashing: true,
    presenceTtl: 'normal',
    webrtcRelayOnly: false,
    relayEndpoints: [],
    turnServers: [],
    torEnabled: false,
    torSocksPort: 9050,
    analyticsConsent: false,
    crashReports: false,
  }),
  savePrivacyPrefs: vi.fn(),
  shouldEmitCoverTraffic: () => false,
  readBatteryStatus: async () => ({ level: 1, charging: true }),
  probeTor: async () => ({ ok: false, error: 'not running' }),
  createNetworkProfile: vi.fn(),
  applyNetworkProfile: vi.fn(),
  buildNetworkProfileLink: vi.fn(),
  parseNetworkProfileLink: vi.fn(),
}));

vi.mock('../lib/anon/transport', () => ({
  createAnonTransport: mocks.createAnonTransport,
}));

vi.mock('../lib/anon/pairing', () => ({
  createInvitation: mocks.createInvitation,
  receiveInboxPackets: mocks.receiveInboxPackets,
  ackInboxPackets: mocks.ackInboxPackets,
  sendContactOffer: mocks.sendContactOffer,
  sendContactMessage: mocks.sendContactMessage,
  failoverInbox: mocks.failoverInbox,
  migrateInbox: mocks.migrateInbox,
  // Blocking is keyed on the Ed25519 identity of the peer invite, so the mock
  // must return a key-shaped value or the local block list rejects it.
  contactIdentity: (invite: { signingKey: string }) => queueSigningPublicKey(invite.signingKey),
  isBlockedContact: () => false,
  inviteFromInbox: (inbox: any) => inbox,
  standbyInvite: () => null,
  hasStandby: () => false,
  standbyInbox: () => null,
  encodeContactOffer: () => 'encoded-offer',
  decodeContactOffer: () => null,
  acceptInvitation: vi.fn(),
  prepareInvitationAcceptance: vi.fn(),
  contactFromOffer: () => null,
  receiveInboxMessages: vi.fn(),
  receiveContactOffers: vi.fn(),
  receiveContactMessages: vi.fn(),
}));

vi.mock('../lib/anon/tor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/anon/tor')>();
  return {
    ...actual,
    checkTorRunning: mocks.checkTorRunning,
  };
});

vi.mock('../lib/premium', async (importOriginal) => ({
  // Keep the pure helpers real so `isPremium()` and friends keep working.
  ...(await importOriginal<typeof import('../lib/premium')>()),
  purchasePremiumGiftCode: mocks.purchasePremiumGiftCode,
  clearPendingPremiumGiftOrder: mocks.clearPendingPremiumGiftOrder,
}));

function stateWithContact(id: string) {
  const signingKey = generateQueueSigningKeyPair().privateKey;
  const contact = {
    inbox: {
      relayUrl: 'https://relay.example',
      queueId: 'q_00000000000000000000000000000011',
      senderToken: 'sender',
      recipientToken: 'recipient',
      signingKey,
      signingPublicKey: 'signing-public',
      recipientPublicKey: 'recipient-public',
      recipientPrivateKey: 'recipient-secret',
      inviteToken: 'invite-secret',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    },
    peerInvite: {
      v: 1 as const,
      relayUrl: 'https://relay.example',
      queueId: 'q_00000000000000000000000000000012',
      senderToken: 'peer-sender',
      signingKey,
      recipientPublicKey: 'peer-recipient',
      inviteToken: 'peer-invite-secret',
      expiresAt: Date.now() + 60_000,
      displayName: undefined as string | undefined,
    },
    createdAt: Date.now(),
  };
  return {
    contact,
    state: {
      settings: {
        relayUrl: 'https://relay.example',
        proxyUrl: 'https://proxy.example',
        relayId: 'relay-main',
        relayPublicKey: 'A'.repeat(43),
      },
      contacts: [{ id, contact, messages: [] }],
    },
  };
}

describe('AnonymousMessengerScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.db.isReady.mockReturnValue(true);
    mocks.db.loadSetting.mockResolvedValue(null);
    mocks.db.saveSetting.mockResolvedValue(undefined);
    mocks.createAnonTransport.mockReturnValue({});
    mocks.receiveInboxPackets.mockResolvedValue([]);
    mocks.ackInboxPackets.mockResolvedValue(true);
    mocks.sendContactOffer.mockResolvedValue(true);
    mocks.sendContactMessage.mockResolvedValue({ ok: true });
    mocks.failoverInbox.mockResolvedValue(null);
    mocks.migrateInbox.mockResolvedValue(null);
    mocks.checkTorRunning.mockResolvedValue({ ok: true, port: 9050 });
    mocks.toDataURL.mockResolvedValue('data:image/png;base64,qr');
    mocks.purchasePremiumGiftCode.mockResolvedValue({
      ok: true,
      giftCode: `NOVA-GIFT-${'A'.repeat(32)}`,
    });
    mocks.createInvitation.mockResolvedValue({
      // `createInvitation` resolves to an Invitation (`{ inbox, invite }`), and
      // the screen reads `invitation.inbox`; a bare inbox fails its guard.
      inbox: {
        relayUrl: 'https://relay.example',
        queueId: 'q_00000000000000000000000000000000',
        senderToken: 'sender',
        recipientToken: 'recipient',
        signingKey: 'signing-secret',
        signingPublicKey: 'signing-public',
        recipientPublicKey: 'recipient-public',
        recipientPrivateKey: 'recipient-secret',
        inviteToken: 'invite-secret',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
      invite: {},
    });
  });

  it('shows local mode instead of invite controls without a relay', async () => {
    // The test env ships a build-time relay, so local mode needs settings that
    // explicitly clear it (the shape older builds stored).
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [],
    });
    render(<AnonymousMessengerScreen onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeTruthy();
    expect(screen.getByText('Create an invite and send the link or show the QR code. The other person opens it and confirms; they will then appear in your contacts automatically.')).toBeTruthy();
    expect(screen.getAllByText('Local mode')).toHaveLength(1);
    expect(screen.getByText('Local only')).toBeTruthy();
    expect(
      screen.getByText(
        'No relay configured, so invites, QR codes and sharing are unavailable. Messaging works only on this device. Add a relay under advanced settings to add contacts.',
      ),
    ).toBeTruthy();
    const advanced = screen.getByText('Advanced network settings').closest('details');
    expect(advanced).not.toHaveProperty('open', true);

    fireEvent.click(screen.getByRole('button', { name: 'Configure relay' }));
    expect(advanced).toHaveProperty('open', true);
    expect(screen.queryByRole('button', { name: 'Configure relay' })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Relay URL')),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(advanced).toHaveProperty('open', false);
    expect(screen.getByRole('button', { name: 'Configure relay' })).toBeTruthy();
    const localPanel = screen.getByText('Local mode').closest('[role="status"]');
    await waitFor(() => expect(document.activeElement).toBe(localPanel));

    expect(screen.queryByRole('button', { name: 'Create link and QR code' })).toBeNull();
    expect(screen.queryByLabelText('Your invitation link')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Scan this QR code to add me' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    // Accepting a relay-backed invite still works from local mode.
    expect(screen.getByLabelText('Paste an invitation link or code')).toBeTruthy();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
    expect(mocks.toDataURL).not.toHaveBeenCalled();
  });

  it('counts only local-only contacts in the local-mode badge', async () => {
    const localContact = stateWithContact('local-a').state.contacts[0];
    localContact.contact.peerInvite.relayUrl = 'https://local.invalid';
    localContact.contact.peerInvite.displayName = 'Local Alice';
    const remoteContact = stateWithContact('remote-b').state.contacts[0];
    remoteContact.contact.peerInvite.displayName = 'Remote Bob';
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [localContact, remoteContact],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Local mode' }));

    const panel = screen.getByTestId('local-contacts-panel');
    expect(within(panel).getByText('Local Alice')).toBeTruthy();
    expect(within(panel).queryByText('Remote Bob')).toBeNull();
  });

  it('deletes a local contact only after confirmation', async () => {
    const localContact = stateWithContact('local-a').state.contacts[0];
    localContact.contact.peerInvite.relayUrl = 'https://local.invalid';
    localContact.contact.peerInvite.displayName = 'Local Alice';
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [localContact],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Local mode' }));
    const panel = screen.getByTestId('local-contacts-panel');

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Delete contact: Local Alice' }),
    );
    expect(screen.getByText('Delete this contact?')).toBeTruthy();
    expect(
      screen.getByText('The contact and its messages will be deleted from this device.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByText('Delete this contact?')).toBeNull();
    expect(screen.getAllByText('Local Alice').length).toBeGreaterThan(0);

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Delete contact: Local Alice' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() =>
      expect(mocks.db.saveSetting).toHaveBeenCalledWith(
        'anon_messenger_state_v1',
        expect.objectContaining({ contacts: [] }),
      ),
    );
    expect(await screen.findByText('Contact deleted.')).toBeTruthy();
    expect(screen.queryByText('Local Alice')).toBeNull();
  });

  it('deletes a contact from the main list after confirming its history', async () => {
    const entry = stateWithContact('history-a').state.contacts[0];
    entry.contact.peerInvite.displayName = 'History Harry';
    entry.messages = [
      { id: 'm1', body: 'hello', fromMe: false, createdAt: Date.now() },
      { id: 'm2', body: 'hi', fromMe: true, createdAt: Date.now() },
    ];
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [entry],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete contact: History Harry' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText(
        'The contact and its 2 messages will be deleted from this device.',
      ),
    ).toBeTruthy();

    // Clicks inside the card keep the dialog open; the backdrop closes it.
    fireEvent.click(screen.getByRole('heading', { name: 'Delete this contact?' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete contact: History Harry' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete contact: History Harry' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() =>
      expect(mocks.db.saveSetting).toHaveBeenCalledWith(
        'anon_messenger_state_v1',
        expect.objectContaining({ contacts: [] }),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('History Harry')).toBeNull();
  });

  it('deletes the relay queue when removing a relay contact', async () => {
    const base = stateWithContact('relay-a');
    const entry = base.state.contacts[0];
    entry.contact.peerInvite.displayName = 'Relay Rita';
    const deleteQueue = vi.fn(async () => true);
    mocks.createAnonTransport.mockReturnValue({ deleteQueue });
    mocks.db.loadSetting.mockResolvedValue(base.state);

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete contact: Relay Rita' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() =>
      expect(deleteQueue).toHaveBeenCalledWith(
        entry.contact.inbox.queueId,
        entry.contact.inbox.recipientToken,
        entry.contact.inbox.signingKey,
      ),
    );
  });

  it('lists pending local invitations in the badge', async () => {
    const localContact = stateWithContact('local-a').state.contacts[0];
    localContact.contact.peerInvite.relayUrl = 'https://local.invalid';
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [localContact],
      pendingInbox: {
        ...localContact.contact.inbox,
        relayUrl: 'https://local.invalid',
      },
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Local mode' }));
    expect(screen.getByText('1 invitation pending confirmation.')).toBeTruthy();
  });

  it('drops the pending invitation count when it expires', async () => {
    const localContact = stateWithContact('local-a').state.contacts[0];
    localContact.contact.peerInvite.relayUrl = 'https://local.invalid';
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [localContact],
      pendingInbox: {
        ...localContact.contact.inbox,
        relayUrl: 'https://local.invalid',
        expiresAt: Date.now() + 100,
      },
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeTruthy();
    // The badge re-renders on the invite clock tick only while the panel is open.
    fireEvent.click(screen.getByRole('button', { name: 'Local mode' }));
    const badgeButton = screen.getByRole('button', { name: 'Local mode' });
    expect(badgeButton.textContent).toBe('Local only · 1 + 1 pending');
    await waitFor(
      () => expect(badgeButton.textContent).toBe('Local only · 1'),
      { timeout: 5000 },
    );
  });

  it('prefills the invite code supplied by a deep link', async () => {
    render(
      <AnonymousMessengerScreen
        onBack={vi.fn()}
        initialInvite="invite-code-123"
      />,
    );

    const inviteInput = await screen.findByLabelText('Paste an invitation link or code');
    expect((inviteInput as HTMLTextAreaElement).value).toBe('invite-code-123');
  });

  it('saves proxy-only settings encrypted and creates a shareable invite', async () => {
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: '',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: false,
      },
      contacts: [],
    });
    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    expect(screen.getByRole('heading', { name: 'Local mode' })).toBeTruthy();
    // The header shows the mode badge; it only opens the panel, it is not a duplicate of its title.
    expect(screen.getByRole('button', { name: 'Local mode' }).textContent).toBe('Local only');
    fireEvent.click(screen.getByText('Advanced network settings'));

    fireEvent.change(screen.getByLabelText('Relay URL'), {
      target: { value: 'https://relay.example' },
    });
    fireEvent.change(screen.getByLabelText('Proxy URL'), {
      target: { value: 'https://proxy.example' },
    });
    fireEvent.change(screen.getByLabelText('Relay ID at proxy'), {
      target: { value: 'relay-main' },
    });
    fireEvent.change(screen.getByLabelText('Pinned relay X25519 public key'), {
      target: { value: 'A'.repeat(43) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => expect(mocks.db.saveSetting).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Local mode' })).toBeNull());
    expect(mocks.createAnonTransport).toHaveBeenCalledWith({
      relayUrl: 'https://relay.example',
      proxy: {
        proxyUrl: 'https://proxy.example',
        relayId: 'relay-main',
        relayPublicKey: 'A'.repeat(43),
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Create link and QR code' }));
    await screen.findByLabelText('Your invitation link');
    expect(screen.getByRole('button', { name: 'Share link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    await screen.findByRole('img', { name: 'Scan this QR code to add me' });
    expect(mocks.db.saveSetting).toHaveBeenCalledTimes(2);
    expect(mocks.createInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      expect.anything(),
      'https://relay.example',
      undefined,
      undefined,
      '@nova',
      // New invites carry a standby queue on the configured fallback relay.
      expect.objectContaining({ relayUrl: 'https://p01--profound-hill--97yk4ph4sg85.code.run' }),
    );
  });

  it('checks relay connectivity without saving settings', async () => {
    const createQueue = vi.fn(async () => ({
      queueId: 'q_00000000000000000000000000000000',
      senderToken: 'sender',
      recipientToken: 'recipient',
      signingKey: 'signing-secret',
      signingPublicKey: 'signing-public',
      expiresAt: Date.now() + 60_000,
    }));
    mocks.createAnonTransport.mockReturnValue({ createQueue });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByText('Advanced network settings'));

    fireEvent.change(screen.getByLabelText('Relay URL'), {
      target: { value: 'https://relay.example' },
    });
    fireEvent.change(screen.getByLabelText('Proxy URL'), {
      target: { value: 'https://proxy.example' },
    });
    fireEvent.change(screen.getByLabelText('Relay ID at proxy'), {
      target: { value: 'relay-main' },
    });
    fireEvent.change(screen.getByLabelText('Pinned relay X25519 public key'), {
      target: { value: 'A'.repeat(43) },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Check relay' }));

    await waitFor(() => expect(createQueue).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Relay answered in \d+ ms\./)).toBeTruthy();
    expect(mocks.db.saveSetting).not.toHaveBeenCalled();
  });

  it('saves Tor settings only when the local SOCKS listener answers', async () => {
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: 'http://abcdefghijklmnopqrstuvwxyz234567.onion',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: true,
      },
      contacts: [],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });

    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => expect(mocks.checkTorRunning).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.db.saveSetting).toHaveBeenCalledWith(
        'anon_messenger_state_v1',
        expect.objectContaining({ settings: expect.objectContaining({ tor: true }) }),
      ),
    );
  });

  it('rejects Tor settings when the SOCKS listener is not reachable', async () => {
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: 'http://abcdefghijklmnopqrstuvwxyz234567.onion',
        extraRelays: '',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
        pushToken: '',
        tor: true,
      },
      contacts: [],
    });

    mocks.checkTorRunning.mockResolvedValueOnce({
      ok: false,
      port: 9050,
      error: 'connection refused',
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });

    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => expect(mocks.checkTorRunning).toHaveBeenCalledTimes(1));
    expect(mocks.db.saveSetting).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/Tor is not answering on 127.0.0.1:9050/)).toBeInTheDocument(),
    );
  });

  it('polls a queue on the relay that hosts it, not on the primary relay', async () => {
    const signingKey = generateQueueSigningKeyPair().privateKey;
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: 'https://relay.example',
        extraRelays: 'https://other-relay.example',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
      },
      contacts: [
        {
          id: 'peer',
          contact: {
            inbox: {
              relayUrl: 'https://other-relay.example',
              queueId: 'q_00000000000000000000000000000003',
              senderToken: 'sender',
              recipientToken: 'recipient',
              signingKey,
              signingPublicKey: 'signing-public',
              recipientPublicKey: 'recipient-public',
              recipientPrivateKey: 'recipient-secret',
              inviteToken: 'invite-secret',
              createdAt: Date.now(),
              expiresAt: Date.now() + 60_000,
            },
            peerInvite: { queueId: 'q_00000000000000000000000000000004', signingKey },
            createdAt: Date.now(),
          },
          messages: [],
        },
      ],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => expect(mocks.receiveInboxPackets).toHaveBeenCalled());
    expect(mocks.createAnonTransport).toHaveBeenCalledWith({
      relayUrl: 'https://other-relay.example',
    });
    expect(mocks.receiveInboxPackets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ relayUrl: 'https://other-relay.example' }),
    );
  });

  it('polls the standby queue when the primary inbox is empty', async () => {
    const { contact, state } = stateWithContact('peer');
    const standby = {
      ...contact.inbox,
      relayUrl: 'https://backup.example',
      queueId: 'q_00000000000000000000000000000013',
      inviteToken: 'standby-invite',
    };
    mocks.db.loadSetting.mockResolvedValue({
      ...state,
      settings: {
        ...state.settings,
        extraRelays: 'https://backup.example',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
      },
      contacts: [
        {
          id: 'peer',
          contact: { ...contact, inbox: { ...contact.inbox, standby } },
          messages: [],
        },
      ],
    });
    mocks.receiveInboxPackets.mockImplementation(async (_transport, inbox) =>
      inbox.relayUrl === 'https://backup.example'
        ? [{ packetId: 'standby-packet', body: 'standby delivery', offer: null }]
        : [],
    );

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await screen.findByText('standby delivery');
    expect(mocks.receiveInboxPackets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ relayUrl: 'https://backup.example' }),
    );
    expect(mocks.ackInboxPackets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ relayUrl: 'https://backup.example' }),
      ['standby-packet'],
    );
  });

  it('moves a queue to the next relay only after its relay keeps failing', async () => {
    const { contact, state } = stateWithContact('peer');
    mocks.db.loadSetting.mockResolvedValue({
      ...state,
      contacts: [
        {
          id: 'peer',
          contact: {
            ...contact,
            inbox: {
              ...contact.inbox,
              relays: [
                { id: 'https://relay.example', url: 'https://relay.example' },
                { id: 'https://other-relay.example', url: 'https://other-relay.example' },
              ],
            },
          },
          messages: [],
        },
      ],
    });
    mocks.receiveInboxPackets.mockRejectedValue(new Error('relay unreachable'));

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    const checkButton = screen.getByRole('button', { name: 'Check for updates' }) as HTMLButtonElement;

    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitFor(() => expect(checkButton.disabled).toBe(false));
      fireEvent.click(checkButton);
      await waitFor(() => expect(mocks.receiveInboxPackets).toHaveBeenCalledTimes(attempt));
      expect(mocks.failoverInbox).toHaveBeenCalledTimes(attempt === 3 ? 1 : 0);
    }

    // The queue moved with its contacts, not the whole app's relay.
    expect(mocks.failoverInbox.mock.calls[0][1]).toMatchObject({ queueId: contact.inbox.queueId });
    expect(mocks.failoverInbox.mock.calls[0][2]).toHaveLength(1);
  });

  it('rotates a due contact queue to the next relay on schedule', async () => {
    const { contact, state } = stateWithContact('peer');
    mocks.db.loadSetting.mockResolvedValue({
      ...state,
      settings: {
        ...state.settings,
        extraRelays: 'https://other-relay.example',
        proxyUrl: '',
        relayId: '',
        relayPublicKey: '',
      },
      contacts: [
        {
          id: 'peer',
          contact: {
            ...contact,
            inbox: {
              ...contact.inbox,
              relays: [
                { id: 'https://relay.example', url: 'https://relay.example' },
                { id: 'https://other-relay.example', url: 'https://other-relay.example' },
              ],
              createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
            },
          },
          messages: [],
        },
      ],
    });
    const rotatedInbox = {
      ...contact.inbox,
      relayUrl: 'https://other-relay.example',
      queueId: 'q_00000000000000000000000000000005',
    };
    mocks.migrateInbox.mockResolvedValue({ inbox: rotatedInbox, notified: 1, failed: 0 });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => expect(mocks.migrateInbox).toHaveBeenCalledTimes(1));
    expect(mocks.migrateInbox.mock.calls[0][2]).toHaveLength(1);
    await waitFor(() =>
      expect(mocks.db.saveSetting).toHaveBeenCalledWith(
        'anon_messenger_state_v1',
        expect.objectContaining({
          contacts: expect.arrayContaining([
            expect.objectContaining({
              contact: expect.objectContaining({
                inbox: expect.objectContaining({
                  relayUrl: 'https://other-relay.example',
                  queueId: 'q_00000000000000000000000000000005',
                }),
              }),
            }),
          ]),
        }),
      ),
    );
  });

  it('seeds relay failures from storage and fails over sooner', async () => {
    const { state } = stateWithContact('peer');
    const stateWithRelays = {
      ...state,
      contacts: [
        {
          ...state.contacts[0],
          contact: {
            ...state.contacts[0].contact,
            inbox: {
              ...state.contacts[0].contact.inbox,
              relays: [
                { id: 'https://relay.example', url: 'https://relay.example' },
                { id: 'https://other-relay.example', url: 'https://other-relay.example' },
              ],
            },
          },
        },
      ],
    };
    mocks.db.loadSetting.mockResolvedValueOnce(stateWithRelays);
    mocks.db.loadSetting.mockResolvedValue({
      'https://relay.example': { failures: FAILOVER_AFTER_FAILURES - 1 },
    });
    mocks.receiveInboxPackets.mockRejectedValue(new Error('relay unreachable'));

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => expect(mocks.failoverInbox).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.db.saveSetting).toHaveBeenCalledWith(
        'anon_relay_failures_v1',
        { 'https://relay.example': { failures: FAILOVER_AFTER_FAILURES } },
      ),
    );
  });

  it('persists decrypted messages before acknowledging relay packets', async () => {
    const signingKey = generateQueueSigningKeyPair().privateKey;
    const inbox = {
      relayUrl: 'https://relay.example',
      queueId: 'q_00000000000000000000000000000001',
      senderToken: 'sender',
      recipientToken: 'recipient',
      signingKey,
      signingPublicKey: 'signing-public',
      recipientPublicKey: 'recipient-public',
      recipientPrivateKey: 'recipient-secret',
      inviteToken: 'invite-secret',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    const savedState = {
      settings: {
        relayUrl: 'https://relay.example',
        proxyUrl: 'https://proxy.example',
        relayId: 'relay-main',
        relayPublicKey: 'A'.repeat(43),
      },
      contacts: [
        {
          id: 'peer',
          contact: {
            inbox,
            peerInvite: { queueId: 'q_00000000000000000000000000000002', signingKey },
            createdAt: Date.now(),
          },
          messages: [],
        },
      ],
    };
    mocks.db.loadSetting.mockResolvedValue(savedState);
    mocks.receiveInboxPackets.mockResolvedValue([
      { packetId: 'packet-1', body: 'persist before ack', offer: null },
    ]);
    mocks.ackInboxPackets.mockImplementation(async () => {
      const lastWrite = mocks.db.saveSetting.mock.calls.at(-1)?.[1] as typeof savedState | undefined;
      expect(lastWrite?.contacts[0].messages[0].body).toBe('persist before ack');
      return true;
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() => expect(mocks.ackInboxPackets).toHaveBeenCalledTimes(1));
    expect(mocks.db.saveSetting.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.ackInboxPackets.mock.invocationCallOrder[0],
    );
    expect(await screen.findByText('persist before ack')).toBeTruthy();
  });

  it('retries an unsent contact offer when checking for updates', async () => {
    const { contact, state } = stateWithContact('peer-pending-offer');
    const pendingState = {
      ...state,
      contacts: state.contacts.map((entry) => ({ ...entry, pendingOffer: true })),
    };
    mocks.db.loadSetting.mockResolvedValue(pendingState);
    mocks.sendContactOffer.mockResolvedValueOnce(true);

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    await waitFor(() =>
      expect(mocks.sendContactOffer).toHaveBeenCalledWith(
        expect.anything(),
        contact.peerInvite,
        contact.inbox,
        null,
      ),
    );
    await waitFor(() => {
      const saved = mocks.db.saveSetting.mock.calls.at(-1)?.[1] as {
        contacts: Array<{ pendingOffer?: boolean }>;
      };
      expect(saved.contacts[0].pendingOffer).toBe(false);
    });
  });

  it('purchases a gift and sends its one-time code to the selected saved contact', async () => {
    const { contact, state } = stateWithContact('peer-1');
    mocks.db.loadSetting.mockResolvedValue(state);

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Gift Premium · 30 days ($3.90)' }));

    await screen.findByText('Gift code sent in an encrypted message.');
    expect(mocks.purchasePremiumGiftCode).toHaveBeenCalledWith('peer-1');
    expect(mocks.sendContactMessage).toHaveBeenCalledWith(
      expect.anything(),
      contact,
      expect.stringContaining(`NOVA-GIFT-${'A'.repeat(32)}`),
      { standbyTransport: null },
    );
    expect(mocks.clearPendingPremiumGiftOrder).toHaveBeenCalledTimes(1);
    const finalState = mocks.db.saveSetting.mock.calls.at(-1)?.[1] as typeof state & {
      pendingPremiumGift?: unknown;
      contacts: Array<{ messages: Array<{ body: string; status: string }> }>;
    };
    expect(finalState.pendingPremiumGift).toBeUndefined();
    expect(finalState.contacts[0].messages.at(-1)).toMatchObject({
      body: expect.stringContaining(`NOVA-GIFT-${'A'.repeat(32)}`),
      status: 'sent',
    });
  });

  it('keeps a paid gift for retry when encrypted delivery fails', async () => {
    const { state } = stateWithContact('peer-2');
    mocks.db.loadSetting.mockResolvedValue(state);
    mocks.sendContactMessage.mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: true });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'Gift Premium · 30 days ($3.90)' }));
    await screen.findByText('Gift paid, but the message was not sent. Retry delivery.');

    const failedState = mocks.db.saveSetting.mock.calls.at(-1)?.[1] as {
      pendingPremiumGift?: { code: string };
    };
    expect(failedState.pendingPremiumGift?.code).toBe(`NOVA-GIFT-${'A'.repeat(32)}`);
    expect(screen.getByRole('button', { name: 'Retry gift delivery' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry gift delivery' }));
    await screen.findByText('Gift code sent in an encrypted message.');
    expect(mocks.purchasePremiumGiftCode).toHaveBeenCalledTimes(1);
    expect(mocks.sendContactMessage).toHaveBeenCalledTimes(2);
  });

  it('stores a hash-only report locally and applies sender blocking', async () => {
    const signingKey = generateQueueSigningKeyPair().privateKey;
    const queueId = 'q_00000000000000000000000000000002';
    const submitAbuseReport = vi.fn().mockResolvedValue(true);
    mocks.createAnonTransport.mockReturnValue({ submitAbuseReport });
    const inbox = {
      relayUrl: 'https://relay.example',
      queueId: 'q_00000000000000000000000000000001',
      senderToken: 'sender',
      recipientToken: 'recipient',
      signingKey,
      signingPublicKey: 'signing-public',
      recipientPublicKey: 'recipient-public',
      recipientPrivateKey: 'recipient-secret',
      inviteToken: 'invite-secret',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    const peerInvite = {
      v: 1 as const,
      relayUrl: 'https://relay.example',
      queueId,
      senderToken: 'peer-sender',
      signingKey,
      recipientPublicKey: 'peer-recipient',
      inviteToken: 'peer-invite-secret',
      expiresAt: Date.now() + 60_000,
    };
    mocks.db.loadSetting.mockResolvedValue({
      settings: {
        relayUrl: 'https://relay.example',
        proxyUrl: 'https://proxy.example',
        relayId: 'relay-main',
        relayPublicKey: 'A'.repeat(43),
      },
      contacts: [
        {
          id: queueId,
          contact: { inbox, peerInvite, createdAt: Date.now() },
          messages: [],
        },
      ],
    });

    render(<AnonymousMessengerScreen onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Contacts' });
    fireEvent.change(screen.getByLabelText('Report category'), {
      target: { value: 'harassment' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    await screen.findByText('Hash-only report sent to the relay through the proxy.');

    const reportData = localStorage.getItem('nova_anon_abuse_reports_v1') || '';
    expect(reportData).toContain('"category":"harassment"');
    expect(reportData).not.toContain(queueId);
    expect(reportData).not.toContain(signingKey);
    expect(submitAbuseReport).toHaveBeenCalledWith(
      expect.objectContaining({
        v: 1,
        category: 'harassment',
        queueIdHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        signingKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await screen.findByRole('button', { name: 'Unblock' });
    expect(localStorage.getItem('nova_anon_block_list_v1')).toContain(queueSigningPublicKey(signingKey));
  });
});
