import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mini Apps in tests use https://example.com; production requires an explicit
// VITE_MINI_APP_ORIGINS allowlist (see src/lib/bots/miniAppOrigins.ts).
(import.meta.env as Record<string, string>).VITE_MINI_APP_ORIGINS = 'https://example.com';

// Node 22 ships an undici WebSocket that tries to establish real connections.
// ChatScreen opens a call-signaling socket on mount when a relay URL is
// configured, which made jsdom dispatch undici events into a jsdom EventTarget
// and produced uncaught "event must be an instance of Event" errors. Tests do
// not need network signaling, so keep the socket inert.
class WebSocketMock {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = WebSocketMock.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string, public protocols?: string | string[]) {}

  send() {}
  close() {
    this.readyState = WebSocketMock.CLOSED;
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return false;
  }
}
(globalThis as Record<string, unknown>).WebSocket = WebSocketMock;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView for jsdom (not implemented by default)
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
});

// ResizeObserver is not implemented in jsdom; ChatScreen/VirtualizedList use it
// to track the message viewport height.
class ResizeObserverMock {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverMock;

// IntersectionObserver is not implemented in jsdom; StickerPickerDrawer uses it
// for infinite scroll GIF loading.
class IntersectionObserverMock {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }
  observe(target: Element) {
    // Simulate intersection immediately for testing
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).IntersectionObserver = IntersectionObserverMock;

// jsdom has no scrolling geometry; make scrollTo/scrollBy no-ops and give
// scroll containers neutral metrics so ChatScreen can measure layout.
HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo;
HTMLElement.prototype.scrollBy = vi.fn() as unknown as typeof HTMLElement.prototype.scrollBy;
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get() {
    return Math.max(this.clientHeight, 0);
  },
});
