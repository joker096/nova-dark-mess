/**
 * Single source of truth for navigation typing.
 *
 * Three different things were called "tab" across the app, which is how
 * `'settings'`, `'profile'` and `'analytics'` ended up disagreeing between App,
 * BottomNav and NavigationProvider:
 *
 * - `ScreenId`   — the screen the router is showing (deep-link targets included).
 * - `BottomTab`  — the five items of the mobile bottom navigation.
 */

export type ScreenId =
  | 'chats'
  | 'chat'
  | 'channel'
  | 'contacts'
  | 'profile'
  | 'anonymous'
  | 'settings'
  | 'analytics'
  | 'sites'
  | 'mesh-map'
  | 'premium';

/** Tabs of the mobile bottom navigation; must stay in sync with BottomNav. */
export type BottomTab = 'chats' | 'contacts' | 'channels' | 'profile' | 'premium';

/** Tabs that show a screen whose id differs from the tab name. */
export function screenForBottomTab(tab: BottomTab): ScreenId {
  if (tab === 'channels') return 'channel';
  if (tab === 'profile') return 'profile';
  return tab;
}
