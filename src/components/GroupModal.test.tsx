/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GroupModal } from './GroupModal';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));

vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({
    encryptAndSendMessage: vi.fn(),
    identity: { fingerprint: 'test-fingerprint' },
  }),
}));

vi.mock('../hooks/useAccount', () => ({
  useAccount: () => ({
    account: { displayName: 'TestUser', avatar: 'https://example.com/avatar.png' },
  }),
}));

vi.mock('../lib/anon/groups', () => ({
  createGroupSession: vi.fn().mockResolvedValue({
    id: 'g_test123',
    version: 1,
    keyJwk: {},
    members: [],
    createdAt: Date.now(),
    rotatedAt: Date.now(),
  }),
  rotateGroupSession: vi.fn().mockResolvedValue({
    id: 'g_test123',
    version: 2,
    keyJwk: {},
    members: [],
    createdAt: Date.now(),
    rotatedAt: Date.now(),
  }),
  distributeGroupSession: vi.fn().mockResolvedValue({ delivered: ['m1', 'm2'], failed: [] }),
  sendEncryptedGroupMessage: vi.fn().mockResolvedValue({ delivered: ['m1', 'm2'], failed: [] }),
}));

vi.mock('../lib/anon/transport', () => ({
  createAnonTransport: vi.fn(() => ({})),
}));

vi.mock('../lib/anon/relay', () => {
  class MockInMemoryAnonRelay {
    createQueue = () => ({
      queueId: 'q_test123',
      tokens: { senderToken: 'sender', recipientToken: 'recipient' },
      signingKey: 'signingKey',
      inviteToken: 'inviteToken',
    });
  }
  return {
    InMemoryAnonRelay: MockInMemoryAnonRelay,
  };
});

vi.mock('@noble/curves/ed25519.js', () => ({
  x25519: {
    utils: { randomSecretKey: () => new Uint8Array(32) },
    getPublicKey: () => new Uint8Array(32),
  },
}));

vi.mock('./LazyMedia', () => ({
  LazyMedia: ({ className }: { className?: string }) => <div className={className} data-testid="lazy-media" />,
}));

describe('GroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<GroupModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders create tab on fresh open', () => {
    render(<GroupModal isOpen onClose={vi.fn()} />);
    // Check for the create tab button (first button with this role)
    const createTabs = screen.getAllByRole('button', { name: 'group.create' });
    expect(createTabs.length).toBeGreaterThanOrEqual(1);
    expect(createTabs[0]).toBeVisible();
    expect(screen.getByPlaceholderText('Group name')).toBeVisible();
    expect(screen.getByPlaceholderText('http://relay.example')).toBeVisible();
  });

  it('shows members tab when existing group provided', () => {
    const mockSession = {
      id: 'g_test123',
      version: 1,
      keyJwk: {},
      members: ['q1', 'q2'],
      createdAt: Date.now(),
      rotatedAt: Date.now(),
    };
    const existingGroup = {
      id: 'g_test123',
      name: 'Test Group',
      session: mockSession,
      members: [],
      relayUrl: 'http://localhost',
    };

    render(<GroupModal isOpen existingGroup={existingGroup} onClose={vi.fn()} />);
    expect(screen.getByText('group.settings')).toBeVisible();
    expect(screen.getByText('group.members')).toBeVisible();
  });

  it('adds member when add button clicked', () => {
    render(<GroupModal isOpen onClose={vi.fn()} />);
    const addButton = screen.getByText('group.addMember');
    // Initial members are "You", "Bob", "Carol" - no "Member 4" yet
    expect(screen.queryAllByText('Member 4').length).toBe(0);
    fireEvent.click(addButton);
    // After adding, there should be one "Member 4"
    expect(screen.getAllByText('Member 4').length).toBe(1);
  });

  it('enables create button when name and members provided', () => {
    render(<GroupModal isOpen onClose={vi.fn()} />);
    const buttons = screen.getAllByRole('button', { name: 'group.create' });
    const submitBtn = buttons.find(btn => btn.hasAttribute('disabled'));
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Group name'), { target: { value: 'Test Group' } });
    expect(submitBtn).toBeEnabled();
  });

  it('opens members tab and shows members list', async () => {
    const mockSession = {
      id: 'g_test123',
      version: 1,
      keyJwk: {},
      members: ['q1', 'q2'],
      createdAt: Date.now(),
      rotatedAt: Date.now(),
    };
    const existingGroup = {
      id: 'g_test123',
      name: 'Test Group',
      session: mockSession,
      members: [
        { memberId: 'm1', invite: { queueId: 'q1', v: 1, relayUrl: '', senderToken: '', signingKey: '', recipientPublicKey: '', inviteToken: '', expiresAt: 0 }, displayName: 'User 1' },
        { memberId: 'm2', invite: { queueId: 'q2', v: 1, relayUrl: '', senderToken: '', signingKey: '', recipientPublicKey: '', inviteToken: '', expiresAt: 0 }, displayName: 'User 2' },
        { memberId: 'm3', invite: { queueId: 'q3', v: 1, relayUrl: '', senderToken: '', signingKey: '', recipientPublicKey: '', inviteToken: '', expiresAt: 0 }, displayName: 'User 3' },
      ],
      relayUrl: 'http://localhost',
    };

    render(<GroupModal isOpen existingGroup={existingGroup} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('group.members')).toBeVisible());
    fireEvent.click(screen.getByText('group.members'));
    await waitFor(() => expect(screen.getByText('group.members (3)')).toBeVisible());
  });

  it('closes on close button click', () => {
    const onClose = vi.fn();
    render(<GroupModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error when creating group without name', () => {
    render(<GroupModal isOpen onClose={vi.fn()} />);
    // The submit button should be disabled when group name is empty (members are pre-populated)
    const buttons = screen.getAllByRole('button', { name: 'group.create' });
    const submitBtn = buttons.find(btn => btn.hasAttribute('disabled'));
    expect(submitBtn).toBeDefined();
    expect(submitBtn).toBeDisabled();
    
    // Enter a name to enable the button
    fireEvent.change(screen.getByPlaceholderText('Group name'), { target: { value: 'Test Group' } });
    expect(submitBtn).toBeEnabled();
  });
});