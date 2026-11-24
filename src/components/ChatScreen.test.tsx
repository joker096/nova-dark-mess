/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { ChatScreen } from './ChatScreen';
import { CONVERSATION_HISTORIES } from '../data/mockMessengerData';

const peerKeyMock = vi.hoisted(() => ({
  result: null as null | {
    peerFingerprint: string;
    history: Array<{
      id: string;
      chatId: string;
      previousFingerprint: string;
      currentFingerprint: string;
      previousSigningKeyId: string;
      currentSigningKeyId: string;
      previousIdentityKeyId: string;
      currentIdentityKeyId: string;
      changedAt: number;
    }>;
  },
}));

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
    encryptAndSendMessage: vi.fn(async () => ({ encryptedPayload: {}, plaintext: '' })),
    checkPeerKey: vi.fn(async () => peerKeyMock.result ?? {
      peerFingerprint: 'nova_pk_peer12345678',
      history: [],
    }),
    identity: { fingerprint: 'nova_pk_test1234567890' },
    isDemoPeer: vi.fn(() => true),
  }),
}));
vi.mock('../hooks/usePremium', () => ({
  usePremium: () => ({
    premium: false,
    loading: false,
    checkout: vi.fn(),
    canUse: () => false,
  }),
}));

vi.mock('./AudioWaveformPlayer', () => ({
  AudioWaveformPlayer: vi.fn(() => null),
}));
vi.mock('./VoiceMemoInput', () => ({
  VoiceMemoInput: vi.fn(
    ({ onSendVoiceMemo }: { onSendVoiceMemo: (note: { duration: string; durationSeconds: number; waveform: number[]; audioUrl: string }) => void }) => (
      <button
        type="button"
        data-testid="test-send-voice-note"
        onClick={() =>
          onSendVoiceMemo({
            duration: '0:01',
            durationSeconds: 1,
            waveform: [35],
            audioUrl: 'blob:voice-test',
          })
        }
      >
        Send test voice note
      </button>
    ),
  ),
  VoiceMemoInputHandle: Symbol('VoiceMemoInputHandle'),
}));
vi.mock('./WallpaperSettingsModal', () => ({
  WallpaperSettingsModal: vi.fn(() => null),
}));
vi.mock('./ScheduleMessageModal', () => ({
  ScheduleMessageModal: vi.fn(() => null),
}));
vi.mock('./VideoCallOverlay', () => ({
  VideoCallOverlay: vi.fn(() => null),
}));
vi.mock('./SharedMediaSection', () => ({
  SharedMediaSection: vi.fn(() => null),
}));
vi.mock('./FileSelectionModal', () => ({
  FileSelectionModal: vi.fn(() => null),
}));
vi.mock('./DoodleBackground', () => ({
  DoodleBackground: vi.fn(() => null),
}));

// Group members moved into the chat "..." menu.
const openGroupMembers = () => {
  fireEvent.click(screen.getByRole('button', { name: 'chat.chatActions' }));
  fireEvent.click(screen.getByRole('button', { name: 'chat.groupMembers' }));
};

const baseProps = {
  chatId: 'katie',
  onBack: vi.fn(),
  onOpenProfile: vi.fn(),
};

const renderChat = (props: ComponentProps<typeof ChatScreen> = baseProps) =>
  render(<ChatScreen {...props} />);

const getBubble = (id = 'm1') => {
  const bubble = screen.getByTestId(`bubble-${id}`);
  return bubble as HTMLElement;
};

const pointer = (
  el: HTMLElement,
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) =>
  fireEvent[type](el, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'touch',
    buttons: type === 'pointerUp' ? 0 : 1,
    ...extra,
  });

describe('ChatScreen - message rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    peerKeyMock.result = null;
  });

  afterEach(() => {
    CONVERSATION_HISTORIES.katie = (CONVERSATION_HISTORIES.katie ?? []).filter(
      (message) => !message.id.startsWith('peer-key-change-test-'),
    );
  });

  it('renders message bubbles with ids for gesture targeting', () => {
    renderChat();
    const msg1 = document.getElementById('msg-m1');
    expect(msg1).not.toBeNull();
    expect(msg1?.tagName).toBe('DIV');
    expect(msg1?.getAttribute('class')).toContain('relative');
  });

  it('renders multiple message bubbles for katie conversation', () => {
    renderChat();
    ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'].forEach((id) => {
      expect(document.getElementById(`msg-${id}`)).not.toBeNull();
    });
  });

  it('labels the safety number as demo when the peer key is device-generated', async () => {
    renderChat();
    // The shield is rendered once, inside the contact-name row. Pressing the
    // bubble area first resets the gesture state left over from other specs.
    const bubble = getBubble();
    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerUp', 100, 200);
    fireEvent.click(screen.getByTestId('e2ee-badge'));

    const row = await screen.findByTestId('safety-number-row');
    expect(row.getAttribute('data-demo-peer')).toBe('true');
    const badge = await screen.findByTestId('demo-peer-badge');
    expect(badge.textContent).toContain('chat.demoPeer');
    expect(badge.getAttribute('title')).toBe('chat.demoPeerTitle');
  });

  it('surfaces changed peer keys in the chat and protection history', async () => {
    const change = {
      id: 'peer-key-change-test-300',
      chatId: 'katie',
      previousFingerprint: 'nova_pk_old12345678',
      currentFingerprint: 'nova_pk_new12345678',
      previousSigningKeyId: 'old-signing-id',
      currentSigningKeyId: 'new-signing-id',
      previousIdentityKeyId: 'old-identity-id',
      currentIdentityKeyId: 'new-identity-id',
      changedAt: 300,
    };
    peerKeyMock.result = {
      peerFingerprint: change.currentFingerprint,
      history: [change],
    };

    renderChat();

    expect(await screen.findByText(/chat\.e2eeKeyChanged:/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('e2ee-badge'));
    expect(await screen.findByTestId('peer-key-change-history')).toBeTruthy();
    expect(screen.getByText('nova_pk_old12345678 → nova_pk_new12345678')).toBeTruthy();
  });

  it('marks incoming messages read when opening the conversation', async () => {
    renderChat();

    await waitFor(() => {
      expect(screen.queryByTestId('unread-divider')).toBeNull();
      expect(localStorage.getItem('nova_read_chats_v1')).toContain('katie');
    });
  });

  it('shows a double check for a read message without a seen label or avatar', () => {
    renderChat();
    const status = within(getBubble('m3')).getByTitle('common.read');

    expect(status.querySelector('svg.lucide-check-check')).toBeTruthy();
    expect(status.querySelector('img[alt="Seen"]')).toBeNull();
    expect(status.textContent).not.toContain('Seen');
  });

  it('opens message photos in a dismissible media viewer', () => {
    renderChat();
    fireEvent.click(screen.getByTestId('chat-media-m2-0'));

    const viewer = screen.getByRole('dialog', { name: 'a11y.mediaViewer' });
    expect(within(viewer).getByRole('img', { name: 'Media 1' })).toBeTruthy();
    fireEvent.click(within(viewer).getByRole('button', { name: 'a11y.nextMedia' }));
    expect(within(viewer).getByRole('img', { name: 'Media 2' })).toBeTruthy();
    fireEvent.click(within(viewer).getByRole('button', { name: 'a11y.closeMediaViewer' }));
    expect(screen.queryByRole('dialog', { name: 'a11y.mediaViewer' })).toBeNull();
  });

  it('opens video attachments with native playback controls', () => {
    const imageMessage = CONVERSATION_HISTORIES.katie.find((message) => message.id === 'm2');
    if (!imageMessage?.images) throw new Error('Test fixture m2 has no media');
    const originalImages = imageMessage.images;
    imageMessage.images = ['https://media.example.test/clip.mp4'];

    try {
      renderChat();
      fireEvent.click(screen.getByTestId('chat-media-m2-0'));
      expect(screen.getByRole('dialog', { name: 'a11y.mediaViewer' }).querySelector('video[controls]')).toBeTruthy();
    } finally {
      imageMessage.images = originalImages;
    }
  });

  it('renders chat action menu in a top-level portal and closes it from the menu', () => {
    // The "..." menu is a group-chat affordance; the 1:1 chat header has none.
    renderChat({ chatId: 'thailand', onBack: vi.fn(), onOpenProfile: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'chat.chatActions' }));

    const menu = screen.getByRole('menu', { name: 'chat.chatActions' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain('fixed');
    expect(menu.className).toContain('z-50');
    fireEvent.click(within(menu).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('menu', { name: 'chat.chatActions' })).toBeNull();
  });

  it('renders reply and forward quick actions on messages', () => {
    renderChat();
    const bubble = getBubble();
    expect(within(bubble).getByTitle('a11y.replyToMessage')).toBeTruthy();
    expect(within(bubble).getByTitle('a11y.forwardMessage')).toBeTruthy();
  });

  it('uses a subtle highlight instead of an outer frame when replying to a message', () => {
    renderChat();
    const bubble = getBubble();

    fireEvent.click(within(bubble).getByTitle('a11y.replyToMessage'));

    expect(bubble.className).not.toContain('ring-2');
    expect(bubble.className).toContain('shadow-[0_0_18px_rgba(255,78,24,0.28)]');
    expect(screen.getByPlaceholderText('chat.replyingToName')).toBeTruthy();
  });
});

describe('ChatScreen - swipe-to-reply gesture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the reply indicator while dragging horizontally', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 160, 202);

    expect(screen.getByTestId('swipe-reply-indicator')).toBeTruthy();
  });

  it('starts a reply when the swipe crosses the threshold', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 200, 202);
    pointer(bubble, 'pointerUp', 200, 202);

    expect(screen.getByPlaceholderText('chat.replyingToName')).toBeTruthy();
  });

  it('does not start a reply below the threshold', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 140, 202);
    pointer(bubble, 'pointerUp', 140, 202);

    expect(screen.queryByPlaceholderText('chat.replyingToName')).toBeNull();
    expect(screen.getByPlaceholderText('chat.typeMessage')).toBeTruthy();
  });

  it('cancels the gesture on pointer cancel', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 200, 202);
    fireEvent.pointerCancel(bubble);
    pointer(bubble, 'pointerUp', 200, 202);

    expect(screen.queryByPlaceholderText('chat.replyingToName')).toBeNull();
  });

  it('does not turn mouse hover after a click into a swipe', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200, { pointerType: 'mouse' });
    pointer(bubble, 'pointerUp', 100, 200, { pointerType: 'mouse' });
    pointer(bubble, 'pointerMove', 300, 200, { pointerType: 'mouse', buttons: 0 });

    expect(screen.queryByTestId('swipe-reply-indicator')).toBeNull();
    expect(screen.queryByPlaceholderText('chat.replyingToName')).toBeNull();
  });

  it('does not start a reply while forward selection is active', () => {
    renderChat();
    const bubble = getBubble();

    fireEvent.click(within(bubble).getByTitle('a11y.forwardMessage'));
    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 220, 200);
    pointer(bubble, 'pointerUp', 220, 200);

    expect(screen.queryByPlaceholderText('chat.replyingToName')).toBeNull();
  });
});

describe('ChatScreen - send button interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the typed message on keyboard activation (click with detail 0)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderChat();
    const input = screen.getByPlaceholderText('chat.typeMessage');

    fireEvent.change(input, { target: { value: 'Keyboard sent message' } });
    const sendButton = screen.getByTitle('common.send');
    fireEvent.click(sendButton, { detail: 0 });

    expect(screen.getByText('Keyboard sent message')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not send on right click', () => {
    renderChat();
    const input = screen.getByPlaceholderText('chat.typeMessage');
    fireEvent.change(input, { target: { value: 'Do not send on right click' } });

    const sendButton = screen.getByTitle('common.send');
    fireEvent.pointerDown(sendButton, { button: 2, buttons: 2, pointerId: 1 });
    fireEvent.pointerUp(sendButton, { button: 2, buttons: 0, pointerId: 1 });

    expect(screen.queryByText('Do not send on right click')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('Do not send on right click');
  });

  it('adds a recorded voice note to the conversation when sent', () => {
    renderChat();
    // The composer swaps the mic for the send button as soon as there is text,
    // so clear the draft to get the voice recorder back.
    fireEvent.change(screen.getByPlaceholderText('chat.typeMessage'), { target: { value: '' } });
    const sentVoiceBubblesBefore = screen.queryAllByTestId(/^bubble-m-/).length;

    fireEvent.click(screen.getByTestId('test-send-voice-note'));

    expect(screen.getAllByTestId(/^bubble-m-/)).toHaveLength(sentVoiceBubblesBefore + 1);
  });
});

describe('ChatScreen - long press and double tap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the reaction picker after a long press', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByTitle('React with ❤️')).toBeTruthy();
    expect(bubble.className).not.toContain('ring-2');
  });

  it('cancels the long press when the pointer moves vertically', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerDown', 100, 200);
    pointer(bubble, 'pointerMove', 102, 260);
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('does not open the reaction picker via long press in forward-select mode', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    renderChat();
    const bubble = getBubble();

    fireEvent.click(within(bubble).getByTitle('a11y.forwardMessage'));
    pointer(bubble, 'pointerDown', 100, 200);
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('opens the reaction picker on double tap', () => {
    renderChat();
    const bubble = getBubble();

    // Both taps must land inside the double-tap window; a single render pass
    // between them would push the second tap past it.
    act(() => {
      pointer(bubble, 'pointerDown', 100, 200);
      pointer(bubble, 'pointerUp', 100, 200);
      pointer(bubble, 'pointerDown', 100, 200);
      pointer(bubble, 'pointerUp', 100, 200);
    });

    // The quick reaction lands on the message bubble instead of opening a picker.
    expect(screen.getByTestId('bubble-m1').textContent).toContain('❤️');
  });

  it('ignores taps that land on interactive message controls', () => {
    renderChat();
    const bubble = getBubble();
    const forwardButton = within(bubble).getByTitle('a11y.forwardMessage');

    fireEvent.pointerUp(forwardButton);
    fireEvent.pointerUp(forwardButton);

    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('closes the reaction picker on Escape', () => {
    renderChat();
    const bubble = getBubble();

    act(() => {
      pointer(bubble, 'pointerDown', 100, 200);
      pointer(bubble, 'pointerUp', 100, 200);
      pointer(bubble, 'pointerDown', 100, 200);
      pointer(bubble, 'pointerUp', 100, 200);
    });
    // A double tap is a quick ❤️ reaction, not a picker; the picker opens on long press.
    expect(bubble.textContent).toContain('❤️');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('reacting to a message does not auto-scroll the conversation to the bottom', () => {
    const scrolls: Element[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function mockScrollIntoView(this: Element) {
      scrolls.push(this);
      return undefined as unknown as void;
    };
    try {
      renderChat();
      scrolls.length = 0; // drop the initial mount autoscroll

      // Open the picker with a press (its first pointer event starts the long
      // press), then pick the reaction from it.
      const bubble = getBubble();
      pointer(bubble, 'pointerDown', 100, 200);
      fireEvent.contextMenu(bubble);
      fireEvent.click(screen.getByTitle('React with ❤️'));

      expect(screen.getByTestId('bubble-m1').textContent).toContain('❤️');
      // The only allowed scroll after reacting is the reaction-picker cleanup,
      // never the messages-end anchor.
      expect(scrolls.some((el) => el === null || el.tagName === 'DIV')).toBe(false);
      expect(scrolls.length).toBe(0);
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

describe('ChatScreen - horizontal lists hide scrollbar', () => {
  it('quick search chips list uses no-scrollbar when search opened', () => {
    renderChat();
    fireEvent.click(screen.getByTitle('common.search'));
    const list = screen.getByTestId('quick-search-chips');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });

  it('emoji quick bar uses no-scrollbar when emoji picker opened', () => {
    renderChat();
    fireEvent.click(screen.getByTitle('common.react'));
    const list = screen.getByTestId('emoji-bar');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });

  it('smart replies list uses no-scrollbar by default', () => {
    // Smart replies only appear after an incoming message; kurt ends on one.
    renderChat({ chatId: 'kurt', onBack: vi.fn(), onOpenProfile: vi.fn() });
    const list = screen.getByTestId('smart-replies');
    expect(list.className).toContain('no-scrollbar');
    expect(list.className).not.toContain('scrollbar-x');
  });
});

describe('ChatScreen - smart replies', () => {
  it('hides suggestions when the last message is outgoing', () => {
    // The katie conversation ends with our own location message.
    renderChat();
    expect(screen.queryByTestId('smart-replies')).toBeNull();
  });

  it('shows suggestions after an incoming message', () => {
    renderChat({ chatId: 'kurt', onBack: vi.fn(), onOpenProfile: vi.fn() });
    expect(screen.getByTestId('smart-replies')).toBeTruthy();
  });
});

describe('ChatScreen - message edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits an own message and marks it as edited', () => {
    renderChat();
    const bubble = getBubble('m3');
    fireEvent.click(within(bubble).getByTitle('chat.messageActions.edit'));
    const input = within(bubble).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated text' } });
    fireEvent.click(within(bubble).getByText('common.save'));
    expect(screen.getByText('Updated text')).toBeTruthy();
    expect(within(bubble).getByText('chat.edited')).toBeTruthy();
  });

  it('cancels editing without changing the message', () => {
    renderChat();
    const bubble = getBubble('m3');
    fireEvent.click(within(bubble).getByTitle('chat.messageActions.edit'));
    const input = within(bubble).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.click(within(bubble).getByText('common.cancel'));
    expect(screen.getByText('Yeah, good times. For sure...')).toBeTruthy();
    expect(screen.queryByText('Changed')).toBeNull();
  });
});

describe('ChatScreen - message delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes an own message from the more menu and removes it entirely after the animation', () => {
    renderChat();
    const bubble = getBubble('m3');
    // Delete lives behind the message "⋯" menu so it cannot be hit by accident.
    fireEvent.click(within(bubble).getByTitle('common.more'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.messageActions.delete' }));

    // The bubble is marked for deletion (animation) but is still in the DOM
    // until the timer fires.
    expect(screen.queryByText('Yeah, good times. For sure...')).not.toBeNull();

    // Once the delete animation completes, the message is gone for good —
    // no "deleted" tombstone remains.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText('chat.messageDeleted')).toBeNull();
    expect(screen.queryByText('Yeah, good times. For sure...')).toBeNull();
  });

  it('offers an Undo toast that brings the message back', () => {
    renderChat();
    // m4 rather than m3: the delete test above removes m3 from the stored
    // history, and history survives between renders.
    const bubble = getBubble('m4');
    fireEvent.click(within(bubble).getByTitle('common.more'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'chat.messageActions.delete' }));

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // The text also appears inside m5's reply quote, so assert on the bubble.
    expect(screen.queryByTestId('bubble-m4')).toBeNull();
    expect(screen.getByText('chat.messageDeletedToast')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'common.undo' }));
    expect(screen.getByTestId('bubble-m4')).toBeTruthy();
    expect(screen.queryByText('chat.messageDeletedToast')).toBeNull();
  });
});

describe('ChatScreen - group chat and P2P wiring', () => {
  it('renders a group chat profile when chatId is a group', () => {
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });
    expect(screen.getByText('Thailand Trip')).toBeTruthy();
    expect(screen.getByText(/Group/i)).toBeTruthy();
  });

  it('sends group messages through the sender-key group manager', () => {
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });
    const input = screen.getByPlaceholderText('chat.typeMessage');
    fireEvent.change(input, { target: { value: 'Group hello' } });
    fireEvent.click(screen.getByTitle('common.send'), { detail: 0 });

    expect(screen.getByText('Group hello')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/chat\.groupMessageFailed/)).toBeNull();
  });

  it('manages group members from the header dialog', async () => {
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    expect(screen.getByTestId('group-members-dialog')).toBeTruthy();
    expect(screen.getByText('chat.noMembers')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('chat.memberFingerprint'), {
      target: { value: 'nova_pk_bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'chat.addMember' }));
    await waitFor(() => expect(screen.getByText('nova_pk_bob')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'chat.removeMember: nova_pk_bob' }));
    await waitFor(() => expect(screen.queryByText('nova_pk_bob')).toBeNull());
    expect(screen.getByText('chat.noMembers')).toBeTruthy();
  });

  it('promotes and demotes group members', async () => {
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    fireEvent.change(screen.getByLabelText('chat.memberFingerprint'), {
      target: { value: 'nova_pk_bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'chat.addMember' }));
    await waitFor(() => expect(screen.getByText('nova_pk_bob')).toBeTruthy());
    expect(screen.getByTestId('group-role-nova_pk_bob').textContent).toBe('chat.roleMember');

    fireEvent.click(screen.getByRole('button', { name: 'chat.makeAdmin: nova_pk_bob' }));
    expect(screen.getByTestId('group-role-nova_pk_bob').textContent).toBe('chat.roleAdmin');

    fireEvent.click(screen.getByRole('button', { name: 'chat.makeMember: nova_pk_bob' }));
    expect(screen.getByTestId('group-role-nova_pk_bob').textContent).toBe('chat.roleMember');
  });

  it('remembers an installed bot member for direct group delivery', async () => {
    const getBotSession = () =>
      ({
        listBots: () => [{ peerFingerprint: 'nova_pk_gateway_bot' }],
      }) as never;
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
      getBotSession,
    });

    openGroupMembers();
    fireEvent.change(screen.getByLabelText('chat.memberFingerprint'), {
      target: { value: 'nova_pk_gateway_bot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'chat.addMember' }));
    await waitFor(() => expect(screen.getByText('nova_pk_gateway_bot')).toBeTruthy());

    await waitFor(() => {
      const roster = JSON.parse(localStorage.getItem('nova_bot_group_peers') ?? '{}');
      expect(roster.thailand).toEqual(['nova_pk_gateway_bot']);
    });
  });

  it('adds system messages for roster and role changes', async () => {
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    fireEvent.change(screen.getByLabelText('chat.memberFingerprint'), {
      target: { value: 'nova_pk_bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'chat.addMember' }));
    await waitFor(() =>
      expect(screen.getAllByText('chat.systemMemberAdded').length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole('button', { name: 'chat.makeAdmin: nova_pk_bob' }));
    expect(screen.getAllByText('chat.systemMemberPromoted').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'chat.removeMember: nova_pk_bob' }));
    await waitFor(() =>
      expect(screen.getAllByText('chat.systemMemberRemoved').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByTestId('system-message').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps an invitee pending instead of making them an admin', () => {
    localStorage.removeItem('nova_group_roles_thailand');
    localStorage.setItem('nova_group_membership_thailand', 'pending');

    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    expect(screen.queryByRole('button', { name: 'chat.addMember' })).toBeNull();
    expect(screen.queryByLabelText('chat.memberFingerprint')).toBeNull();
    expect(screen.getByText('chat.adminOnly')).toBeTruthy();
    expect(screen.getByTestId('join-request-status').textContent).toContain(
      'chat.joinRequestWaiting',
    );

    localStorage.removeItem('nova_group_membership_thailand');
    localStorage.removeItem('nova_group_join_requests_thailand');
  });

  it('badges pending join requests and approves them', async () => {
    localStorage.setItem(
      'nova_group_roles_thailand',
      JSON.stringify({ nova_pk_test1234567890: 'admin' }),
    );
    localStorage.setItem(
      'nova_group_join_requests_thailand',
      JSON.stringify([{ fingerprint: 'nova_pk_bob', status: 'pending', createdAt: 1 }]),
    );

    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    expect(screen.getByTestId('join-request-badge').textContent).toBe('1');
    openGroupMembers();
    expect(screen.getByTestId('join-requests').textContent).toContain('nova_pk_bob');

    fireEvent.click(screen.getByRole('button', { name: 'chat.approveJoinRequest: nova_pk_bob' }));
    await waitFor(() => expect(screen.queryByTestId('join-request-badge')).toBeNull());
    expect(screen.queryByTestId('join-requests')).toBeNull();
    expect(screen.getByTestId('group-role-nova_pk_bob').textContent).toBe('chat.roleMember');

    localStorage.removeItem('nova_group_roles_thailand');
    localStorage.removeItem('nova_group_join_requests_thailand');
  });

  it('lets a declined invitee ask again', () => {
    localStorage.setItem(
      'nova_group_roles_thailand',
      JSON.stringify({ nova_pk_other: 'admin' }),
    );
    localStorage.setItem('nova_group_membership_thailand', 'rejected');

    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    expect(screen.getByTestId('join-request-status').textContent).toContain(
      'chat.joinRequestDeclined',
    );
    fireEvent.click(screen.getByRole('button', { name: 'chat.joinRequestRetry' }));
    expect(screen.getByTestId('join-request-status').textContent).toContain(
      'chat.joinRequestWaiting',
    );

    localStorage.removeItem('nova_group_roles_thailand');
    localStorage.removeItem('nova_group_membership_thailand');
    localStorage.removeItem('nova_group_join_requests_thailand');
  });

  it('blocks roster edits for members who are not admins', () => {
    localStorage.setItem('nova_group_roles_thailand', JSON.stringify({ nova_pk_other: 'admin' }));
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    expect(screen.getByText('chat.adminOnly')).toBeTruthy();
    expect(screen.queryByLabelText('chat.memberFingerprint')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'chat.inviteRegenerate' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    localStorage.removeItem('nova_group_roles_thailand');
  });

  it('generates and copies a group invite link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderChat({
      chatId: 'thailand',
      onBack: vi.fn(),
      onOpenProfile: vi.fn(),
    });

    openGroupMembers();
    const linkInput = screen.getByLabelText('chat.inviteTitle') as HTMLInputElement;
    expect(linkInput.value).toMatch(/^nova:\/\/chat\/thailand\?invite=[a-f0-9]{24}$/);

    fireEvent.click(screen.getByRole('button', { name: 'chat.inviteCopy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(linkInput.value));

    const previous = linkInput.value;
    fireEvent.click(screen.getByRole('button', { name: 'chat.inviteRegenerate' }));
    const next = (screen.getByLabelText('chat.inviteTitle') as HTMLInputElement).value;
    expect(next).not.toBe(previous);
    expect(next).toMatch(/^nova:\/\/chat\/thailand\?invite=[a-f0-9]{24}$/);
  });

  it('toggles view-once mode from the send options', () => {
    renderChat();
    // Both ephemeral modes live behind the single composer clock button.
    fireEvent.click(screen.getByTitle('chat.sendOptions.title'));
    const viewOnceItem = screen.getByText('chat.sendOptions.viewOnce');
    expect(viewOnceItem).toBeTruthy();
    fireEvent.click(viewOnceItem);
    // The clock button marks an active send option.
    const clock = screen.getByTitle('chat.sendOptions.title');
    expect(clock.textContent).toBe('');
  });

  it('sets a disappearing timer from the send options', () => {
    renderChat();
    fireEvent.click(screen.getByTitle('chat.sendOptions.title'));
    expect(screen.getByText('chat.sendOptions.disappearing')).toBeTruthy();
    // Three durations share the same label template, so click the first.
    fireEvent.click(screen.getAllByText('chat.sendOptions.seconds')[0]);
    expect(screen.queryByText('chat.sendOptions.disappearing')).toBeNull();
    expect(screen.getByTitle('chat.sendOptions.title').querySelector('span')).toBeTruthy();
  });
});
