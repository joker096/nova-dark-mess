import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mini Apps in tests use https://example.com; production requires an explicit
// VITE_MINI_APP_ORIGINS allowlist (see src/lib/bots/miniAppOrigins.ts).
(import.meta.env as Record<string, string>).VITE_MINI_APP_ORIGINS = 'https://example.com';

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
