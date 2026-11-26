import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { BotSession } from '../lib/bots/session';

interface BotSessionContextValue {
  getBotSession: () => BotSession;
}

const BotSessionContext = createContext<BotSessionContextValue | null>(null);

export function BotSessionProvider({ children, getBotSession }: { children: ReactNode; getBotSession: () => BotSession }) {
  const value = useMemo<BotSessionContextValue>(() => ({ getBotSession }), [getBotSession]);
  return <BotSessionContext.Provider value={value}>{children}</BotSessionContext.Provider>;
}

export function useBotSession(): BotSessionContextValue {
  const context = useContext(BotSessionContext);
  if (!context) {
    throw new Error('useBotSession must be used within a BotSessionProvider');
  }
  return context;
}