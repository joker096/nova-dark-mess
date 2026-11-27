/**
 * MiniAppIframe — Phase B7 (docs/bots-roadmap.md §B7).
 *
 * Renders a bot's Mini App (`web_app` URL) inside a sandboxed iframe.
 * Sandbox: `allow-scripts allow-forms` — deliberately NO `allow-same-origin`
 * (the old neumorphic-ui flaw). Host and app exchange `postMessage`:
 *   host → app: `mini_app.ready` (initData + themeParams), `mini_app.main_button`, `mini_app.close`
 *   app → host: `mini_app.ready`, `mini_app.close_requested`, `mini_app.main_button_clicked`, `mini_app.inline_query`
 *
 * initData is signed with the bot identity secret so the app can trust the host.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {IconX as X, IconMaximize as Maximize, IconSend as Send} from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import type { FromMiniAppMessage, ToMiniAppMessage } from '../lib/bots/miniApp';
import { createInitData, DEFAULT_THEME_PARAMS, iframeOrigin, serializeInitData } from '../lib/bots/miniApp';
import { isAllowedMiniAppUrl } from '../lib/bots/miniAppOrigins';

interface MiniAppIframeProps {
  /** Bot id (used in initData). */
  botId: string;
  /** The Mini App URL from the bot manifest (must be HTTPS). */
  webAppUrl: string;
  /** Current user id (used in initData). */
  userId: string;
  /** Shared bot identity secret used to sign/verify initData. */
  secret: string;
  /** Fired when the app requests close or the user closes it manually. */
  onClose: () => void;
  /** Fired when the app sends an inline_query (to route to the bot runtime). */
  onInlineQuery?: (query: string) => void;
  /** Fired when the app clicks the main button. */
  onMainButtonClick?: () => void;
}

interface MiniAppIframeState {
  loaded: boolean;
  error: string | null;
}

export const MiniAppIframe: React.FC<MiniAppIframeProps> = ({
  botId,
  webAppUrl,
  userId,
  secret,
  onClose,
  onInlineQuery,
  onMainButtonClick,
}) => {
  const { t } = useLanguage();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const targetOriginRef = useRef<string | null>(null);
  const [state, setState] = useState<MiniAppIframeState>({ loaded: false, error: null });
  const readyRef = useRef<boolean>(false);

  const origin = iframeOrigin(webAppUrl);
  const allowed = origin !== null && isAllowedMiniAppUrl(webAppUrl);

  // Send a postMessage to the iframe once it is ready.
  const post = useCallback(
    (message: ToMiniAppMessage): boolean => {
      const iframe = iframeRef.current;
      const target = targetOriginRef.current;
      if (!iframe || !target || !readyRef.current) return false;
      try {
        // The sandbox has no `allow-same-origin`, so the document has an opaque
        // origin and only a `*` target is delivered. The receiving side is
        // still checked by the `event.source === iframe.contentWindow` guard.
        (iframe.contentWindow as Window).postMessage(message, '*');
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  // Handle messages coming FROM the iframe.
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      // A sandboxed frame reports origin "null"; the source identity above is
      // the real boundary. Any other origin must match the declared HTTPS URL.
      if (event.origin !== 'null' && event.origin !== targetOriginRef.current) return;

      const data = event.data as FromMiniAppMessage | null;
      if (!data || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'mini_app.ready':
          readyRef.current = true;
          setState((s) => ({ ...s, loaded: true, error: null }));
          post({
            type: 'mini_app.ready',
            initData: serializeInitData(createInitData(botId, userId, secret)),
            themeParams: DEFAULT_THEME_PARAMS,
          });
          break;
        case 'mini_app.close_requested':
          onClose();
          break;
        case 'mini_app.main_button_clicked':
          onMainButtonClick?.();
          break;
        case 'mini_app.inline_query':
          onInlineQuery?.(data.query);
          break;
      }
    },
    [botId, onClose, onInlineQuery, onMainButtonClick, post, secret, userId],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Build initData + target origin when the URL changes.
  useEffect(() => {
    if (!origin) {
      setState({ loaded: false, error: t('miniApp.urlMustBeHttps') });
      return;
    }
    if (!isAllowedMiniAppUrl(webAppUrl)) {
      targetOriginRef.current = null;
      setState({ loaded: false, error: t('miniApp.originNotAllowed') });
      return;
    }
    targetOriginRef.current = origin;
    readyRef.current = false;
    setState({ loaded: false, error: null });
  }, [webAppUrl, origin, t]);

  // Expose main-button control to the parent (imperative handle not needed;
  // parent calls post() directly via a ref if desired). Keep simple: parent
  // re-renders when it wants to show/hide the button — we pass through via
  // a data attribute read by an effect. Simpler: parent calls post via ref.
  return (
    <div className="relative flex flex-col h-full w-full bg-[#0b0c10]">
      {/* Mini App header bar — the only chrome the app cannot remove. */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-[#0f1117]/80 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
          <span className="text-xs font-medium text-[#f1f2f6]">
            {t('miniApp.header', { botId })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => post({ type: 'mini_app.main_button', action: 'hide' })}
            className="p-1.5 rounded hover:bg-white/10 text-white/60 disabled:opacity-40"
            title={t('miniApp.hideMainButton')}
          >
            <Maximize size={16} strokeWidth={2} />
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/60" title={t('common.close')}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Sandboxed iframe — no allow-same-origin. */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#0b0c10]">
        {origin && allowed ? (
          <iframe
            ref={iframeRef}
            className="w-full h-full block"
            src={`${webAppUrl}#${serializeInitData(createInitData(botId, userId, secret))}`}
            title={t('miniApp.iframeTitle', { botId })}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            loading="eager"
          />
        ) : null}
        {!state.loaded && !state.error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
            <span className="animate-pulse">{t('miniApp.loading')}</span>
          </div>
        )}
        {state.error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white/60">
            <span className="text-sm font-medium">{state.error}</span>
          </div>
        )}
      </div>

      {/* Main button bar — host-controlled, shown only when the app requests it. */}
      <div className="h-12 border-t border-white/10 bg-[#0f1117]/80 backdrop-blur shrink-0">
        <button
          type="button"
          onClick={() => {
            onMainButtonClick?.();
            post({ type: 'mini_app.main_button', action: 'hide' });
          }}
          className="w-full flex items-center justify-center gap-2 bg-[#ff4e18] text-white font-semibold px-4 py-2.5 rounded-none hover:bg-[#e64a16] active:scale-[0.98] transition"
          disabled={!readyRef.current}
        >
          <Send size={16} strokeWidth={2} />
          <span>{t('miniApp.mainButton')}</span>
        </button>
      </div>
    </div>
  );
};

export type { MiniAppIframeProps };


















