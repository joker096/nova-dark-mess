import React, { useCallback, useMemo, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import { useSecurity } from '../../../hooks/useSecurity';
import {
  SettingsSection,
  SettingsTile,
  IconSegmented,
  type IconSegmentOption,
} from '../settingsPrimitives';
import {
  IconLock as LockIcon,
  IconShieldCheck as ShieldCheckIcon,
  IconShieldExclamation as ShieldExclamationIcon,
  IconPhone as PhoneIcon,
  IconClock as ClockIcon,
  IconUserCircle as UserCircleIcon,
  IconInfoCircle as InfoIcon,
  IconUsers as UsersIcon,
  IconMapPin as MapPinIcon,
  IconRotateClockwise as RotateCcwIcon,
  IconAlertTriangle as AlertTriangleIcon,
  IconX as CloseIcon,
} from '@tabler/icons-react';
import { getPhoneAccessContacts } from '../../../lib/social/socialPrivacy';
import { PrivacyScope } from '../../../lib/social/socialPrivacy';
import { probeTor } from '../../../lib/network/privacyMode';

const PRIVACY_SCOPES: IconSegmentOption<PrivacyScope>[] = [
  { value: 'everyone', label: 'Everyone', icon: <span className="text-[10px] font-medium">Everyone</span> },
  { value: 'contacts', label: 'Contacts', icon: <span className="text-[10px] font-medium">Contacts</span> },
  { value: 'nobody', label: 'Nobody', icon: <span className="text-[10px] font-medium">Nobody</span> },
];

type SocialPrivacyScopeKey = 'lastSeen' | 'profilePhoto' | 'calls' | 'groupsAndChannels' | 'phoneNumber';

const SOCIAL_PRIVACY_ITEMS: Array<{
  key: SocialPrivacyScopeKey;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: 'phoneNumber', label: 'Phone Number', icon: <PhoneIcon className="w-3.5 h-3.5" /> },
  { key: 'lastSeen', label: 'Last Seen', icon: <ClockIcon className="w-3.5 h-3.5" /> },
  { key: 'profilePhoto', label: 'Profile Photo', icon: <UserCircleIcon className="w-3.5 h-3.5" /> },
  { key: 'groupsAndChannels', label: 'Groups & Channels', icon: <UsersIcon className="w-3.5 h-3.5" /> },
  { key: 'calls', label: 'Calls', icon: <PhoneIcon className="w-3.5 h-3.5" /> },
];

import { IconCheck as Check, IconX as XIcon } from '@tabler/icons-react';

export const PrivacyTab = React.memo(function PrivacyTab() {
  const { t } = useLanguage();
  const { state, updatePrivacySetting, updateSocialPrivacySetting } = useSettings();
  const { pinEnabled, verifyPin, clearLocalEncryptedData } = useSecurity();
  const [phoneAccessSheetOpen, setPhoneAccessSheetOpen] = useState(false);
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearDataPin, setClearDataPin] = useState('');
  const [torTestResult, setTorTestResult] = useState<string | null>(null);

  const grantedPhoneCount = getPhoneAccessContacts().filter((c) => c.hasAccess).length;

  const handleClearAllData = useCallback(async () => {
    if (!clearDataConfirm) {
      setClearDataConfirm(true);
      setClearDataPin('');
      return;
    }
    if (pinEnabled && clearDataPin.length < 4) return;
    const ok = await verifyPin(clearDataPin);
    if (!ok) {
      setClearDataPin('');
      return;
    }
    await clearLocalEncryptedData();
    setClearDataConfirm(false);
    setClearDataPin('');
  }, [clearDataConfirm, clearDataPin, pinEnabled, verifyPin, clearLocalEncryptedData]);

  const handleTorTest = useCallback(async () => {
    const result = await probeTor(state.privacy.torSocksPort);
    setTorTestResult(result.ok ? 'Tor reachable' : 'Tor not reachable');
  }, [state.privacy.torSocksPort]);

  return (
    <>
      <SettingsSection
        title={t('settings.privacy')}
        icon={<LockIcon className="w-3.5 h-3.5" />}
      >
        <div className="space-y-2 px-1">
          <SettingsTile
            icon={<ShieldCheckIcon className="w-4 h-4" />}
            label={t('settings.metadataMinimization')}
            description={t('settings.metadataMinimizationDesc')}
            onClick={() => updatePrivacySetting('metadataMinimization', (v) => !v)}
            badge={state.privacy.metadataMinimization ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
            testId="settings-metadata-minimization"
          />
          <p className="text-[11px] leading-relaxed text-[var(--nova-text-muted)] px-1">{t('settings.metadataMinimizationDesc')}</p>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-[var(--nova-text-secondary)] px-1">{t('settings.presenceSharing')}</p>
            <SettingsTile
              icon={<UsersIcon className="w-4 h-4" />}
              label={t('settings.presenceShare')}
              onClick={() => updatePrivacySetting('presenceSharing', (v) => !v)}
              badge={state.privacy.presenceSharing ? <Check className="w-4 h-4" /> : <CloseIcon className="w-4 h-4" />}
              testId="settings-presence-sharing"
            />
            {state.privacy.presenceSharing && (
              <div className="px-1 py-1 space-y-2">
                <SettingsTile
                  icon={<LockIcon className="w-4 h-4" />}
                  label={t('settings.presenceHashing')}
                  onClick={() => updatePrivacySetting('presenceHashing', (v) => !v)}
                  badge={state.privacy.presenceHashing ? <Check className="w-4 h-4" /> : <CloseIcon className="w-4 h-4" />}
                  testId="settings-presence-hashing"
                />
                <p className="text-[10px] text-[var(--nova-text-muted)] px-1">{t('settings.presenceHashingDesc')}</p>
                <SettingsTile
                  icon={<ClockIcon className="w-4 h-4" />}
                  label={t('settings.presenceTtl')}
                  onClick={() => updatePrivacySetting('presenceTtl', (v) => (v === 'short' ? 'normal' : 'short'))}
                  badge={state.privacy.presenceTtl === 'short' ? <Check className="w-4 h-4" /> : <CloseIcon className="w-4 h-4" />}
                  testId="settings-presence-ttl"
                />
                <p className="text-[10px] text-[var(--nova-text-muted)] px-1">{t('settings.presenceTtlDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.socialPrivacy')}
        icon={<ShieldCheckIcon className="w-3.5 h-3.5" />}
        description={t('settings.socialPrivacyDesc')}
      >
        <div className="space-y-2">
          {SOCIAL_PRIVACY_ITEMS.map((item) => {
            if (item.key === 'phoneNumber') {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPhoneAccessSheetOpen(true)}
                  className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer"
                  data-testid="settings-who-sees-phoneNumber"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                      {item.icon}
                    </div>
                    <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.phoneAccessCount', { count: grantedPhoneCount })}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 text-[10px] font-medium text-[var(--nova-accent-color)]">
                      {grantedPhoneCount}
                    </span>
                  </div>
                </button>
              );
            }
            return (
              <div key={item.key} className="flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--nova-overlay-weak)] transition group cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/25 flex items-center justify-center text-[var(--nova-accent-color)]">
                    {item.icon}
                  </div>
                  <span className="text-[13px] text-[var(--nova-text-primary)] group-hover:text-[var(--nova-text-primary)] transition">
                    {item.label}
                  </span>
                </div>
                <IconSegmented
                  options={PRIVACY_SCOPES}
                  value={state.socialPrivacy[item.key]}
                  onChange={(v) => updateSocialPrivacySetting(item.key, v)}
                  ariaLabel={item.label}
                  className="min-w-0 flex-1 justify-end"
                  testId={`settings-privacy-${item.key}`}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.blockedContacts')}
        icon={<ShieldExclamationIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <p className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.blockedContactsComingSoon')}</p>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.torRouting')}
        icon={<MapPinIcon className="w-3.5 h-3.5" />}
        description={t('settings.torRoutingDesc')}
      >
        <div className="space-y-2 px-1">
          <SettingsTile
            icon={<RotateCcwIcon className="w-4 h-4" />}
            label={t('settings.torEnabled')}
            onClick={() => updatePrivacySetting('torEnabled', (v) => !v)}
            badge={state.privacy.torEnabled ? <Check className="w-4 h-4" /> : <CloseIcon className="w-4 h-4" />}
            testId="settings-tor-enabled"
          />
          {state.privacy.torEnabled && (
            <div className="px-1 py-1 space-y-2">
              <button
                onClick={handleTorTest}
                className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] text-xs font-medium transition cursor-pointer"
              >
                {t('settings.torTest')}
              </button>
              {torTestResult && (
                <p className="text-[10px] text-[var(--nova-text-muted)]">
                  {torTestResult}
                </p>
              )}
              <p className="text-[10px] text-[var(--nova-text-muted)]">{t('settings.torTestDesc')}</p>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.turnServersTitle')}
        icon={<AlertTriangleIcon className="w-3.5 h-3.5" />}
        description={t('settings.turnServersDesc')}
      >
        <div className="px-1 py-2 space-y-2">
          <p className="text-[11px] text-[var(--nova-text-muted)]">{t('settings.turnServersComingSoon')}</p>
        </div>
      </SettingsSection>
    </>
  );
});