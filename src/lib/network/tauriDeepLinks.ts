/**
 * Deep links on the Tauri shells (desktop `nova://…`, Android/iOS custom scheme).
 *
 * The web build reads links from `location.hash`; the native shells hand them
 * to the webview through the deep-link plugin instead. Everything stays
 * offline — a link carries an id or an invite token, never an account lookup.
 */

import { parseDeepLink, type DeepLinkTarget } from './deepLinks';

interface DeepLinkPlugin {
  getCurrent(): Promise<string[] | null>;
  onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>;
}

/** True inside a Tauri webview (desktop or mobile), false in the browser. */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  return !!internals;
}

/** Maps raw link strings to navigation targets, dropping anything invalid. */
export function extractDeepLinkTargets(urls: readonly string[]): DeepLinkTarget[] {
  const targets: DeepLinkTarget[] = [];
  for (const url of urls) {
    const target = parseDeepLink(url);
    if (target) targets.push(target);
  }
  return targets;
}

async function loadPlugin(): Promise<DeepLinkPlugin | null> {
  try {
    const module = (await import('@tauri-apps/plugin-deep-link')) as unknown as DeepLinkPlugin;
    return typeof module?.onOpenUrl === 'function' ? module : null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to deep links in the native shells and replays the link that
 * started the app. No-ops in the browser; the returned function unsubscribes.
 */
export async function subscribeTauriDeepLinks(
  handler: (target: DeepLinkTarget, url: string) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  const plugin = await loadPlugin();
  if (!plugin) return () => undefined;

  let active = true;
  const dispatch = (urls: string[] | null) => {
    if (!active || !urls) return;
    for (const url of urls) {
      const target = parseDeepLink(url);
      // The raw URL keeps the invite token even though the target drops it.
      if (target) handler(target, url);
    }
  };

  let unlisten: (() => void) | null = null;
  try {
    unlisten = await plugin.onOpenUrl((urls) => dispatch(urls));
    dispatch(await plugin.getCurrent());
  } catch {
    /* plugin unavailable: hash links still work */
  }

  return () => {
    active = false;
    unlisten?.();
  };
}
