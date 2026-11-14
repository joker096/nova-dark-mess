/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractDeepLinkTargets,
  isTauriRuntime,
  subscribeTauriDeepLinks,
} from './tauriDeepLinks';

afterEach(() => {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('tauriDeepLinks', () => {
  it('detects the Tauri webview', () => {
    expect(isTauriRuntime()).toBe(false);
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(true);
  });

  it('maps valid links and drops everything else', () => {
    expect(
      extractDeepLinkTargets([
        'nova://chat/thailand?invite=abcdef123456',
        'https://nova.app/channel/channel-kyiv',
        'https://example.com/chat/katie',
        'not a link',
      ]),
    ).toEqual([
      { type: 'chat', id: 'thailand' },
      { type: 'channel', id: 'channel-kyiv' },
    ]);
  });

  it('is a no-op in the browser so hash links keep working', async () => {
    const handler = vi.fn();
    const unsubscribe = await subscribeTauriDeepLinks(handler);
    expect(typeof unsubscribe).toBe('function');
    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });
});
