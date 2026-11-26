import React, { useCallback, useMemo } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import {
  SettingsSection,
  SettingsTile,
  IconSegmented,
  type IconSegmentOption,
} from '../settingsPrimitives';
import {
  IconBell as BellIcon,
  IconVolumeOff as VolumeXIcon,
  IconDeviceMobileVibration as VibrationIcon,
  IconMessage2 as MessageSquareIcon,
  IconUsers as UsersIcon,
  IconSpeakerphone as MegaphoneIcon,
  IconRobot as BotIcon,
  IconChevronRight as ChevronRightIcon,
  IconStar as StarIcon,
  IconVolume2 as Volume2Icon,
  IconX as XIcon,
} from '@tabler/icons-react';
import { SOUND_IDS, SOUNDS, playSound, saveSoundId, loadSoundId, type SoundId } from '../../../lib/notifications/sounds';
import { getMutedContacts, getPriorityContacts, type NotificationLevel } from '../../../lib/notifications/notificationPrefs';

const NOTIFICATION_LEVELS: IconSegmentOption<NotificationLevel>[] = [
  { value: 'all', label: 'All', icon: <BellIcon className="w-3.5 h-3.5" /> },
  { value: 'mentions', label: 'Mentions', icon: <MessageSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'none', label: 'None', icon: <VolumeXIcon className="w-3.5 h-3.5" /> },
];

const NOTIFICATION_CATEGORIES = [
  { key: 'privateChats' as const, label: 'Private Chats', icon: <MessageSquareIcon className="w-3.5 h-3.5" /> },
  { key: 'groups' as const, label: 'Groups', icon: <UsersIcon className="w-3.5 h-3.5" /> },
  { key: 'channels' as const, label: 'Channels', icon: <MegaphoneIcon className="w-3.5 h-3.5" /> },
  { key: 'bots' as const, label: 'Bots', icon: <BotIcon className="w-3.5 h-3.5" /> },
];

export const NotificationsTab = React.memo(function NotificationsTab() {
  const { t } = useLanguage();
  const { state, updateAppSetting, updateNotificationSetting } = useSettings();
  const [soundId, setSoundId] = useState<SoundId>(loadSoundId());

  useEffect(() => {
    setSoundId(state.app.soundId);
  }, [state.app.soundId]);

  const handleSoundSelect = useCallback((id: SoundId) => {
    saveSoundId(id);
    setSoundId(id);
    if (id !== 'silent') playSound('notification', id);
    updateAppSetting('soundId', id);
  }, [updateAppSetting]);

  return (
    <>
      <SettingsSection
        title={t('settings.notifications')}
        icon={<BellIcon className="w-3.5 h-3.5" />}
      >
        <div className="space-y-2 px-1">
          <SettingsTile
            icon={<Volume2Icon className="w-4 h-4" />}
            label={t('settings.notificationSound')}
            description={t('settings.notificationSoundDesc')}
            onClick={() => updateAppSetting('notificationSound', (v) => !v)}
            badge={state.app.notificationSound ? <Volume2Icon className="w-4 h-4" /> : <VolumeXIcon className="w-4 h-4" />}
            tone="default"
            testId="settings-notification-sound"
          />
          {state.app.notificationSound && (
            <div className="flex flex-wrap gap-1.5 px-1 py-1" role="radiogroup" aria-label={t('settings.notificationSound')}>
              {SOUND_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => handleSoundSelect(id)}
                  className={`px-3 py-2 rounded-full text-[11px] border transition cursor-pointer min-h-[44px] flex items-center ${
                    soundId === id
                      ? 'bg-[var(--nova-accent-color)]/15 border-[var(--nova-accent-color)]/45 text-[var(--nova-text-primary)]'
                      : 'border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                  }`}
                  role="radio"
                  aria-checked={soundId === id}
                  aria-label={id === 'silent' ? t('settings.soundSilent') : SOUNDS[id].label}
                >
                  {id === 'silent' ? t('settings.soundSilent') : SOUNDS[id].label}
                </button>
              ))}
            </div>
          )}

          <SettingsTile
            icon={<VibrationIcon className="w-4 h-4" />}
            label={t('settings.vibration')}
            description={t('settings.vibrationDesc')}
            onClick={() => updateAppSetting('vibration', (v) => !v)}
            badge={state.app.vibration ? <VibrationIcon className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
            testId="settings-vibration"
          />

          <SettingsTile
            icon={<MessageSquareIcon className="w-4 h-4" />}
            label={t('settings.previewMessages')}
            description={t('settings.previewMessagesDesc')}
            onClick={() => updateAppSetting('previewMessages', (v) => !v)}
            badge={state.app.previewMessages ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
            testId="settings-preview-messages"
          />

          <SettingsTile
            icon={<BellIcon className="w-4 h-4" />}
            label={t('settings.pushNotifications')}
            description={t('settings.pushNotificationsDesc')}
            onClick={() => updateAppSetting('pushEnabled', (v) => !v)}
            badge={state.app.pushEnabled ? <BellIcon className="w-4 h-4" /> : <BellIcon className="w-4 h-4" />}
            testId="settings-push-notifications"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.notificationSettings')}
        icon={<BellIcon className="w-3.5 h-3.5" />}
        description={t('settings.notificationSettingsDesc')}
      >
        <div className="space-y-4 px-1">
          <p className="text-[11px] font-medium text-[var(--nova-text-secondary)]">{t('settings.defaultNotifications')}</p>
          <div className="space-y-2">
            {NOTIFICATION_CATEGORIES.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                    {item.icon}
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">
                    {item.label}
                  </span>
                </div>
                <IconSegmented
                  options={NOTIFICATION_LEVELS}
                  value={state.notifications[item.key] as NotificationLevel}
                  onChange={(v) => updateNotificationSetting(item.key, v)}
                  ariaLabel={item.label}
                  className="min-w-0 flex-1 justify-end"
                  testId={`settings-notify-${item.key}`}
                />
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
            <SettingsTile
              icon={<VolumeXIcon className="w-4 h-4" />}
              label={t('settings.mutedContacts')}
              description={`${getMutedContacts().length} ${t('settings.contacts')}`}
              onClick={() => { /* TODO: open muted contacts list */ }}
              badge={<ChevronRightIcon className="w-4 h-4" />}
              testId="settings-muted-contacts"
            />
            <SettingsTile
              icon={<StarIcon className="w-4 h-4" />}
              label={t('settings.priorityContacts')}
              description={`${getPriorityContacts().length} ${t('settings.contacts')}`}
              onClick={() => { /* TODO: open priority contacts list */ }}
              badge={<ChevronRightIcon className="w-4 h-4" />}
              testId="settings-priority-contacts"
            />
          </div>
        </div>
      </SettingsSection>
    </>
  );
});

import { useState, useEffect } from 'react';
import { IconCheck as Check, IconX as X } from '@tabler/icons-react';