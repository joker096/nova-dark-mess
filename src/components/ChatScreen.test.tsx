/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ChatScreen } from './ChatScreen';

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
    identity: { fingerprint: 'nova_pk_test1234567890' },
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
  VoiceMemoInput: vi.fn(() => null),
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

const baseProps = {
  chatId: 'katie',
  onBack: vi.fn(),
  onOpenProfile: vi.fn(),
};

const renderChat = (props = baseProps) => render(<ChatScreen {...props} />);

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

  it('renders reply and forward quick actions on messages', () => {
    renderChat();
    const bubble = getBubble();
    expect(within(bubble).getByTitle('Reply to message')).toBeTruthy();
    expect(within(bubble).getByTitle('Forward message')).toBeTruthy();
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

    fireEvent.click(within(bubble).getByTitle('Forward message'));
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

    fireEvent.click(within(bubble).getByTitle('Forward message'));
    pointer(bubble, 'pointerDown', 100, 200);
    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('opens the reaction picker on double tap', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerUp', 100, 200);
    pointer(bubble, 'pointerUp', 100, 200);

    expect(screen.getByTitle('React with ❤️')).toBeTruthy();
  });

  it('ignores taps that land on interactive message controls', () => {
    renderChat();
    const bubble = getBubble();
    const forwardButton = within(bubble).getByTitle('Forward message');

    fireEvent.pointerUp(forwardButton);
    fireEvent.pointerUp(forwardButton);

    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });

  it('closes the reaction picker on Escape', () => {
    renderChat();
    const bubble = getBubble();

    pointer(bubble, 'pointerUp', 100, 200);
    pointer(bubble, 'pointerUp', 100, 200);
    expect(screen.getByTitle('React with ❤️')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTitle('React with ❤️')).toBeNull();
  });
});
