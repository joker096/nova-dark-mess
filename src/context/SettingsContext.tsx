import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import type { FontSize, FabSide } from '../lib/ui/appearance';
import type { PrivacyPrefs } from '../lib/network/privacyMode';
import type { SocialPrivacySettings, PrivacyScope } from '../lib/social/socialPrivacy';
import type { NotificationPrefs, NotificationLevel } from '../lib/notifications/notificationPrefs';
import type { SoundId } from '../lib/notifications/sounds';
import type { LocalAdPreferences } from '../lib/ads/localAds';
import { getSocialPrivacy, setSocialPrivacy, DEFAULT_SOCIAL_PRIVACY } from '../lib/social/socialPrivacy';
import { getNotificationPrefs, setNotificationPref, DEFAULT_NOTIFICATION_PREFS } from '../lib/notifications/notificationPrefs';
import { loadAdPreferences, saveAdPreferences, DEFAULT_AD_PREFS } from '../lib/ads/localAds';
import { loadPrivacyPrefs, savePrivacyPrefs, DEFAULT_PRIVACY_PREFS } from '../lib/network/privacyMode';

export interface AppSettings {
  fontSize: FontSize;
  appTheme: 'light' | 'dark' | 'system';
  chatColorTheme: 'default' | 'sapphire' | 'amethyst' | 'emerald';
  fabSide: FabSide;
  notificationSound: boolean;
  vibration: boolean;
  previewMessages: boolean;
  pushEnabled: boolean;
  autoDownload: boolean;
  soundId: SoundId;
}

export interface SettingsState {
  app: AppSettings;
  privacy: PrivacyPrefs;
  socialPrivacy: SocialPrivacySettings;
  notifications: NotificationPrefs;
  adPrefs: LocalAdPreferences;
  isLoading: boolean;
  lastSaved: number | null;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  fontSize: 'medium',
  appTheme: 'system',
  chatColorTheme: 'default',
  fabSide: 'right',
  notificationSound: true,
  vibration: false,
  previewMessages: true,
  pushEnabled: true,
  autoDownload: true,
  soundId: 'nova',
};

const SETTINGS_STORAGE_KEY = 'nova_messenger_settings';
const APP_THEME_KEY = 'nova_app_theme';
const CHAT_THEME_KEY = 'nova_chat_theme';
const FAB_SIDE_KEY = 'nova_fab_side';
const SOUND_ID_KEY = 'nova_sound_id';

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultValue;
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

type SettingsUpdater<T> = (prev: T) => T;
type SettingsAction<T> = T | SettingsUpdater<T>;

interface SettingsContextValue {
  state: SettingsState;
  updateAppSetting: <K extends keyof AppSettings>(key: K, value: SettingsAction<AppSettings[K]>) => void;
  updatePrivacySetting: <K extends keyof PrivacyPrefs>(key: K, value: SettingsAction<PrivacyPrefs[K]>) => void;
  updateSocialPrivacySetting: <K extends keyof SocialPrivacySettings>(key: K, value: SettingsAction<SocialPrivacySettings[K]>) => void;
  updateNotificationSetting: <K extends keyof NotificationPrefs>(key: K, value: SettingsAction<NotificationPrefs[K]>) => void;
  updateAdPrefSetting: <K extends keyof LocalAdPreferences>(key: K, value: SettingsAction<LocalAdPreferences[K]>) => void;
  saveAll: () => Promise<void>;
  resetToDefaults: () => void;
  subscribe: (listener: (state: SettingsState) => void) => () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
  initialState?: Partial<SettingsState>;
}

export function SettingsProvider({ children, initialState }: SettingsProviderProps) {
  const listenersRef = useRef<Set<(state: SettingsState) => void>>(new Set());
  const saveTimeoutRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const [state, setState] = useState<SettingsState>(() => {
    const savedApp = loadFromStorage(SETTINGS_STORAGE_KEY, DEFAULT_APP_SETTINGS);
    const savedAppTheme = loadFromStorage(APP_THEME_KEY, 'system') as AppSettings['appTheme'];
    const savedChatColor = loadFromStorage(CHAT_THEME_KEY, 'default') as AppSettings['chatColorTheme'];
    const savedFabSide = loadFromStorage(FAB_SIDE_KEY, 'right') as AppSettings['fabSide'];
    const savedSoundId = loadFromStorage(SOUND_ID_KEY, 'nova') as SoundId;

    return {
      app: {
        ...DEFAULT_APP_SETTINGS,
        ...savedApp,
        appTheme: savedAppTheme,
        chatColorTheme: savedChatColor,
        fabSide: savedFabSide,
        soundId: savedSoundId,
      },
      privacy: loadPrivacyPrefs(),
      socialPrivacy: getSocialPrivacy(),
      notifications: getNotificationPrefs(),
      adPrefs: loadAdPreferences(),
      isLoading: true,
      lastSaved: null,
      ...initialState,
    };
  });

  const notifyListeners = useCallback((newState: SettingsState) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(newState);
      } catch {}
    });
  }, []);

  const updateState = useCallback(<T,>(updater: (prev: SettingsState) => SettingsState) => {
    setState((prev) => {
      const next = updater(prev);
      notifyListeners(next);
      return next;
    });
  }, [notifyListeners]);

  const updateAppSetting = useCallback(<K extends keyof AppSettings>(key: K, value: SettingsAction<AppSettings[K]>) => {
    updateState((prev) => {
      const newValue = typeof value === 'function' ? (value as SettingsUpdater<AppSettings[K]>)(prev.app[key]) : value;
      const nextApp = { ...prev.app, [key]: newValue };

      if (key === 'appTheme') saveToStorage(APP_THEME_KEY, newValue);
      if (key === 'chatColorTheme') saveToStorage(CHAT_THEME_KEY, newValue);
      if (key === 'fabSide') saveToStorage(FAB_SIDE_KEY, newValue);
      if (key === 'soundId') saveToStorage(SOUND_ID_KEY, newValue);

      saveToStorage(SETTINGS_STORAGE_KEY, nextApp);

      return { ...prev, app: nextApp, lastSaved: Date.now() };
    });
  }, [updateState]);

  const updatePrivacySetting = useCallback(<K extends keyof PrivacyPrefs>(key: K, value: SettingsAction<PrivacyPrefs[K]>) => {
    updateState((prev) => {
      const newValue = typeof value === 'function' ? (value as SettingsUpdater<PrivacyPrefs[K]>)(prev.privacy[key]) : value;
      const nextPrivacy = { ...prev.privacy, [key]: newValue };
      savePrivacyPrefs(nextPrivacy);
      return { ...prev, privacy: nextPrivacy, lastSaved: Date.now() };
    });
  }, [updateState]);

  const updateSocialPrivacySetting = useCallback(<K extends keyof SocialPrivacySettings>(key: K, value: SettingsAction<SocialPrivacySettings[K]>) => {
    updateState((prev) => {
      const newValue = typeof value === 'function' ? (value as SettingsUpdater<SocialPrivacySettings[K]>)(prev.socialPrivacy[key]) : value;
      const nextSocialPrivacy = { ...prev.socialPrivacy, [key]: newValue };
      setSocialPrivacy(key, newValue);
      return { ...prev, socialPrivacy: nextSocialPrivacy, lastSaved: Date.now() };
    });
  }, [updateState]);

  const updateNotificationSetting = useCallback(<K extends keyof NotificationPrefs>(key: K, value: SettingsAction<NotificationPrefs[K]>) => {
    updateState((prev) => {
      const newValue = typeof value === 'function' ? (value as SettingsUpdater<NotificationPrefs[K]>)(prev.notifications[key]) : value;
      const nextNotifications = { ...prev.notifications, [key]: newValue };
      setNotificationPref(key, newValue);
      return { ...prev, notifications: nextNotifications, lastSaved: Date.now() };
    });
  }, [updateState]);

  const updateAdPrefSetting = useCallback(<K extends keyof LocalAdPreferences>(key: K, value: SettingsAction<LocalAdPreferences[K]>) => {
    updateState((prev) => {
      const newValue = typeof value === 'function' ? (value as SettingsUpdater<LocalAdPreferences[K]>)(prev.adPrefs[key]) : value;
      const nextAdPrefs = { ...prev.adPrefs, [key]: newValue };
      saveAdPreferences(nextAdPrefs);
      return { ...prev, adPrefs: nextAdPrefs, lastSaved: Date.now() };
    });
  }, [updateState]);

  const saveAll = useCallback(async () => {
    saveToStorage(SETTINGS_STORAGE_KEY, state.app);
  }, [state.app]);

  const resetToDefaults = useCallback(() => {
    setState({
      app: DEFAULT_APP_SETTINGS,
      privacy: DEFAULT_PRIVACY_PREFS,
      socialPrivacy: DEFAULT_SOCIAL_PRIVACY,
      notifications: DEFAULT_NOTIFICATION_PREFS,
      adPrefs: DEFAULT_AD_PREFS,
      isLoading: false,
      lastSaved: Date.now(),
    });
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(APP_THEME_KEY);
    localStorage.removeItem(CHAT_THEME_KEY);
    localStorage.removeItem(FAB_SIDE_KEY);
    localStorage.removeItem(SOUND_ID_KEY);
  }, []);

  const subscribe = useCallback((listener: (state: SettingsState) => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveToStorage(SETTINGS_STORAGE_KEY, state.app);
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [state.app]);

  useEffect(() => {
    isInitializedRef.current = true;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      state,
      updateAppSetting,
      updatePrivacySetting,
      updateSocialPrivacySetting,
      updateNotificationSetting,
      updateAdPrefSetting,
      saveAll,
      resetToDefaults,
      subscribe,
    }),
    [
      state,
      updateAppSetting,
      updatePrivacySetting,
      updateSocialPrivacySetting,
      updateNotificationSetting,
      updateAdPrefSetting,
      saveAll,
      resetToDefaults,
      subscribe,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}