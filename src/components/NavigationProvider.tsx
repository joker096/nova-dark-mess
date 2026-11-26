import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';

type ScreenId =
  | 'chats'
  | 'chat-katie'
  | 'channel-kyiv'
  | 'profile'
  | 'anonymous'
  | 'settings'
  | 'sites'
  | 'analytics'
  | 'mesh-map'
  | 'premium'
  | 'crypto-checkout';

interface NavState {
  currentScreen: ScreenId;
  activeBottomTab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium';
  activeChatId: string | null;
  activeProfileId: string | null;
  activeChannelId: string | null;
  navHistory: Array<{
    screen: ScreenId;
    chatId: string | null;
    profileId: string | null;
    channelId: string | null;
  }>;
}

interface NavContextValue extends NavState {
  navigate: (screen: ScreenId, opts?: { chatId?: string; profileId?: string; channelId?: string }) => void;
  goBack: () => void;
  setActiveBottomTab: (tab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium') => void;
  activeBottomTab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium';
}

const NavigationContext = createContext<NavContextValue | null>(null);

const initialState: NavState = {
  currentScreen: 'chats',
  activeBottomTab: 'chats',
  activeChatId: null,
  activeProfileId: null,
  activeChannelId: null,
  navHistory: [],
};

type NavAction =
  | { type: 'NAVIGATE'; screen: ScreenId; chatId?: string; profileId?: string; channelId?: string }
  | { type: 'GO_BACK' }
  | { type: 'SET_BOTTOM_TAB'; tab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium' };

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'NAVIGATE':
      return {
        ...state,
        navHistory: [
          ...state.navHistory,
          {
            screen: state.currentScreen,
            chatId: state.activeChatId,
            profileId: state.activeProfileId,
            channelId: state.activeChannelId,
          },
        ],
        currentScreen: action.screen,
        activeChatId: action.chatId ?? state.activeChatId,
        activeProfileId: action.profileId ?? state.activeProfileId,
        activeChannelId: action.channelId ?? state.activeChannelId,
      };
    case 'GO_BACK':
      if (state.navHistory.length === 0) return state;
      const previous = state.navHistory[state.navHistory.length - 1];
      return {
        ...state,
        currentScreen: previous.screen,
        activeChatId: previous.chatId,
        activeProfileId: previous.profileId,
        activeChannelId: previous.channelId,
        navHistory: state.navHistory.slice(0, -1),
      };
    case 'SET_BOTTOM_TAB':
      return {
        ...state,
        activeBottomTab: action.tab,
      };
    default:
      return state;
  }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(navReducer, initialState);

  const navigate = useCallback(
    (screen: ScreenId, opts?: { chatId?: string; profileId?: string; channelId?: string }) => {
      dispatch({ type: 'NAVIGATE', screen, ...opts });
    },
    []
  );

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const setActiveBottomTab = useCallback(
    (tab: 'chats' | 'contacts' | 'channels' | 'settings' | 'premium') => {
      dispatch({ type: 'SET_BOTTOM_TAB', tab });
    },
    []
  );

  return (
    <NavigationContext.Provider
      value={{
        ...state,
        navigate,
        goBack,
        setActiveBottomTab,
        activeBottomTab: 'chats' as const,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

export default NavigationProvider;