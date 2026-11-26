import { useMemo, useCallback } from 'react';
import { useBotSession as useBotSessionContext } from '../context/BotSessionContext';
import { BotSession } from '../lib/bots/session';
import type { BotPermission } from '../lib/bots/types';

export function useBotSession() {
  const { getBotSession } = useBotSessionContext();

  const session = useMemo(() => getBotSession(), [getBotSession]);

  const listBots = useCallback(() => {
    return session.listBots();
  }, [session]);

  const installBot = useCallback(async (manifest: unknown, granted: readonly BotPermission[]) => {
    return session.installBot(manifest, granted);
  }, [session]);

  const uninstallBot = useCallback(async (botId: string) => {
    return session.uninstallBot(botId);
  }, [session]);

  const setBotEnabled = useCallback(async (botId: string, enabled: boolean) => {
    return session.setBotEnabled(botId, enabled);
  }, [session]);

  const setBotBlocked = useCallback(async (botId: string, blocked: boolean) => {
    return session.setBlocked(botId, blocked);
  }, [session]);

  const setPeerFingerprint = useCallback(async (botId: string, fingerprint: string | undefined) => {
    return session.setPeerFingerprint(botId, fingerprint);
  }, [session]);

  const setGatewayUrl = useCallback(async (botId: string, url: string | undefined) => {
    return session.setGatewayUrl(botId, url);
  }, [session]);

  return {
    session,
    listBots,
    installBot,
    uninstallBot,
    setBotEnabled,
    setBotBlocked,
    setPeerFingerprint,
    setGatewayUrl,
  };
}