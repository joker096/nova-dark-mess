import React, { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  IconSettings as SettingsIcon,
  IconBell as BellIcon,
  IconLock as LockIcon,
  IconDatabase as DatabaseIcon,
  IconShieldExclamation as ShieldExclamationIcon,
  IconInfoCircle as InfoIcon,
} from '@tabler/icons-react';

export type SettingsTabId =
  | 'general'
  | 'notifications'
  | 'privacy'
  | 'data'
  | 'advanced'
  | 'about';

export interface SettingsTabConfig {
  id: SettingsTabId;
  label: string;
  icon: React.ReactNode;
  component: ComponentType<any> | LazyExoticComponent<any>;
  order: number;
  enabled?: () => boolean;
}

const tabRegistry: SettingsTabConfig[] = [];

export function registerSettingsTab(config: SettingsTabConfig): void {
  const existingIndex = tabRegistry.findIndex((t) => t.id === config.id);
  if (existingIndex >= 0) {
    tabRegistry[existingIndex] = config;
  } else {
    tabRegistry.push(config);
  }
  tabRegistry.sort((a, b) => a.order - b.order);
}

export function getSettingsTabs(): SettingsTabConfig[] {
  return [...tabRegistry];
}

export function getSettingsTab(id: SettingsTabId): SettingsTabConfig | undefined {
  return tabRegistry.find((t) => t.id === id);
}

export function createTabConfig<T extends SettingsTabId>(
  id: T,
  label: string,
  icon: React.ReactNode,
  component: ComponentType<any> | LazyExoticComponent<any>,
  order: number,
  enabled?: () => boolean
): SettingsTabConfig {
  return { id, label, icon, component, order, enabled };
}

registerSettingsTab(
  createTabConfig(
    'general',
    'General',
    <SettingsIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/GeneralTab').then((m) => ({ default: m.GeneralTab }))),
    10
  )
);

registerSettingsTab(
  createTabConfig(
    'notifications',
    'Notifications',
    <BellIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/NotificationsTab').then((m) => ({ default: m.NotificationsTab }))),
    20
  )
);

registerSettingsTab(
  createTabConfig(
    'privacy',
    'Privacy',
    <LockIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/PrivacyTab').then((m) => ({ default: m.PrivacyTab }))),
    30
  )
);

registerSettingsTab(
  createTabConfig(
    'data',
    'Data',
    <DatabaseIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/DataTab').then((m) => ({ default: m.DataTab }))),
    40
  )
);

registerSettingsTab(
  createTabConfig(
    'advanced',
    'Advanced',
    <ShieldExclamationIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/AdvancedTab').then((m) => ({ default: m.AdvancedTab }))),
    50
  )
);

registerSettingsTab(
  createTabConfig(
    'about',
    'About',
    <InfoIcon className="w-4 h-4" />,
    lazy(() => import('./tabs/AboutTab').then((m) => ({ default: m.AboutTab }))),
    60
  )
);