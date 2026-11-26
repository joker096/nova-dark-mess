import React, { useState } from 'react';
import {IconExternalLink as ExternalLink} from '@tabler/icons-react';
import type { InlineKeyboard as KeyboardModel, InlineKeyboardButton } from '../lib/bots/types';
import { useLanguage } from '../context/LanguageContext';
import { toSafeExternalUrl } from '../lib/security/safeUrl';

interface MessageInlineKeyboardProps {
  /** Keyboard attached to one message by its bot. */
  keyboard: KeyboardModel;
  /** Which bot owns this message (resolved against installed bots). */
  botId: string;
  /** Pressing a callback button emits a callback_query to the bot runtime. */
  onCallback: (botId: string, messageId: string, callbackData: string) => void;
  messageId: string;
  /** Opening a `web_app` button launches the bot's Mini App (Phase B7). */
  onOpenWebApp?: (botId: string, webAppUrl: string) => void;
  disabled?: boolean;
}

/**
 * Inline keyboard under a bot message — the single format from
 * docs/bots-roadmap.md §B0: {text, callback_data | url | web_app}.
 *
 * Long-press (or focus + Enter on desktop) reveals the action behind the
 * button, an anti-phishing disclosure carried over from the threat-model note
 * in Phase B8: the visible label never has to be trusted.
 */
export const MessageInlineKeyboard: React.FC<MessageInlineKeyboardProps> = ({
  keyboard,
  botId,
  onCallback,
  onOpenWebApp,
  messageId,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const [revealed, setRevealed] = useState<string | null>(null);

  /** A `web_app` button (Phase B7) opens the bot's Mini App iframe. */
  const isWebAppButton = (button: InlineKeyboardButton): boolean => button.web_app !== undefined;

  const handleContextMenu = (event: React.MouseEvent, data?: string) => {
    event.preventDefault();
    setRevealed(revealed === data ? null : data ?? 'url');
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5" data-testid={`bot-keyboard-${botId}`}>
      {keyboard.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-1.5">
          {row.map((button, colIdx) => {
            const action = button.callback_data ?? button.url ?? button.web_app?.url ?? '';
            const isCallback = button.callback_data !== undefined;
            // Bot-supplied URL buttons are untrusted: never render a
            // javascript:/data: target, even if a manifest skipped validation.
            const safeUrl = button.url ? toSafeExternalUrl(button.url) : null;
            return (
              <div key={colIdx} className="flex-1 min-w-0 relative">
                {isWebAppButton(button) ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenWebApp?.(botId, button.web_app!.url)}
                    onContextMenu={(e) => handleContextMenu(e, button.web_app!.url)}
                    className="w-full truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--nova-accent-color,#ff4e18)] transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {button.text}
                  </button>
                ) : isCallback ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCallback(botId, messageId, button.callback_data!)}
                    onContextMenu={(e) => handleContextMenu(e, button.callback_data)}
                    className="w-full truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
                  >
                    {button.text}
                  </button>
                ) : safeUrl ? (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onContextMenu={(e) => handleContextMenu(e, button.url)}
                    className="flex w-full items-center justify-center gap-1.5 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--nova-accent-color,#ff4e18)] transition hover:bg-white/10"
                  >
                    <span className="truncate">{button.text}</span>
                    <ExternalLink size={12} className="shrink-0 opacity-70" aria-hidden />
                  </a>
                ) : (
                  <span className="flex w-full items-center justify-center gap-1.5 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/40">
                    <span className="truncate">{button.text}</span>
                  </span>
                )}
                {revealed !== null && revealed === action && action !== '' && (
                  <span
                    role="status"
                    className="absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1e202a] px-2 py-1 text-[10px] text-white/70 shadow-lg"
                  >
                    {isCallback ? t('bot.callbackAction', { defaultValue: 'Sends: {{action}}', action }) : action}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};










