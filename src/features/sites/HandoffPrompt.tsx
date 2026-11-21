/**
 * Guest → messenger handoff prompt.
 *
 * Opened by a `/c/<token>#<key>` link (key in the fragment only). Validates
 * the one-time token, shows the site the conversation came from, and on
 * confirm consumes the token and hands the thread id to the sites screen.
 * The thread key is kept in the fragment and never sent to the server.
 */

import React, { useEffect, useState } from 'react';
import { validateHandoffToken, consumeHandoffToken } from './sitesApi';

export interface SiteHandoff {
  token: string;
  key?: string;
}

/** localStorage bridge so the sites screen can open the continued thread. */
export const PENDING_HANDOFF_KEY = 'nova_pending_site_handoff';

interface Props {
  handoff: SiteHandoff | null;
  onDone: () => void;
  onOpened: (threadId: string) => void;
}

export const HandoffPrompt: React.FC<Props> = ({ handoff, onDone, onOpened }) => {
  const [siteName, setSiteName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!handoff) return;
    setError(null);
    setSiteName(null);
    void validateHandoffToken(handoff.token)
      .then((v) => {
        if (!cancelled) setSiteName(v.site_name);
      })
      .catch(() => {
        if (!cancelled) setError('Ссылка недействительна или истекла');
      });
    return () => {
      cancelled = true;
    };
  }, [handoff]);

  if (!handoff) return null;

  const handleOpen = async () => {
    setBusy(true);
    try {
      const v = await validateHandoffToken(handoff.token);
      await consumeHandoffToken(handoff.token);
      try {
        localStorage.setItem(
          PENDING_HANDOFF_KEY,
          JSON.stringify({ thread_id: v.thread_id, key: handoff.key ?? '' }),
        );
      } catch {
        /* storage unavailable — thread opens without the key */
      }
      onOpened(v.thread_id);
      onDone();
    } catch {
      setError('Не удалось открыть переписку');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-5 text-white" role="dialog" aria-modal="true">
        <h2 className="mb-2 text-base font-semibold">Продолжить переписку</h2>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-white/70">
              {siteName ? `Чат с сайта «${siteName}»` : 'Проверяем ссылку…'}
            </p>
            <button
              type="button"
              disabled={busy || !siteName}
              onClick={handleOpen}
              className="w-full rounded-xl bg-[#007aff] py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Открываем…' : 'Открыть в мессенджере'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onDone}
          className="mt-2 w-full rounded-xl py-2 text-sm text-white/60"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};