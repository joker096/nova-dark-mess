import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnonymousMessengerScreen } from './AnonymousMessengerScreen';
import { generateQueueSigningKeyPair, queueSigningPublicKey } from '../lib/anon/signing';

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
  toDataURL: vi.fn(),
  purchasePremiumGiftCode: vi.fn(),
  clearPendingPremiumGiftOrder: vi.fn(),
}));

vi.mock('qrcode', () => ({ toDataURL: mocks.toDataURL }));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({ isInitialized: true }),
}));

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({ account: { nickname: '@nova' } }),
}));

vi.mock('../lib/storage/db', () => ({ dbInstance: mocks.db }));

vi.mock('../lib/anon/transport', () => ({
  createAnonTransport: mocks.createAnonTransport,
}));

vi.mock('../lib/anon/pairing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/anon/pairing')>();
  return {
    ...actual,
    createInvitation: mocks.createInvitation,
    receiveInboxPackets: mocks.receiveInboxPackets,
    ackInboxPackets: mocks.ackInboxPackets,
    sendContactOffer: mocks.sendContactOffer,
    sendContactMessage: mocks.sendContactMessage,
  };
});

vi.mock('../lib/premium', () => ({
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
    mocks.toDataURL.mockResolvedValue('data:image/png;base64,qr');
    mocks.purchasePremiumGiftCode.mockResolvedValue({
      ok: true,
      giftCode: `NOVA-GIFT-${'A'.repeat(32)}`,
    });
    mocks.createInvitation.mockResolvedValue({
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

  it('starts with a link and QR flow without requiring network setup', async () => {
    render(<AnonymousMessengerScreen onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Contacts' })).toBeTruthy();
    expect(screen.getByText('Create an invite and send the link or show the QR code. The other person opens it and confirms; they will then appear in your contacts automatically.')).toBeTruthy();
    expect(screen.getByText('Advanced network settings').closest('details')).not.toHaveProperty(
      'open',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create link and QR code' }));

    const inviteLink = await screen.findByLabelText('Your invitation link');
    await waitFor(() => expect(mocks.toDataURL).toHaveBeenCalled());
    expect((inviteLink as HTMLTextAreaElement).value).toContain('#nova://contact/');
    expect(screen.getByRole('img', { name: 'Scan this QR code to add me' })).toBeTruthy();
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      expect.anything(),
      'http://localhost:3000',
      undefined,
      undefined,
      '@nova',
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
    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => expect(mocks.db.saveSetting).toHaveBeenCalledTimes(1));
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
    expect(mocks.db.saveSetting).toHaveBeenCalledTimes(2);
    expect(mocks.createInvitation).toHaveBeenCalledTimes(1);
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      expect.anything(),
      'https://relay.example',
      undefined,
      undefined,
      '@nova',
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
