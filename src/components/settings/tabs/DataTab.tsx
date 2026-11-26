import React, { useCallback, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import { useSecurity } from '../../../hooks/useSecurity';
import {
  SettingsSection,
  SettingsTile,
} from '../settingsPrimitives';
import {
  IconDatabase as DatabaseIcon,
  IconFileText as FileTextIcon,
  IconUpload as UploadIcon,
  IconDownload as DownloadIcon,
  IconCloud as CloudIcon,
  IconAlertTriangle as AlertTriangleIcon,
  IconTrashX as TrashXIcon,
  IconKey as KeyIcon,
  IconCopy as CopyIcon,
} from '@tabler/icons-react';
import { downloadMyDataExport } from '../../../lib/dataExport';
import {
  IconCheck as Check,
  IconX as X,
  IconChevronRight as ChevronRightIcon,
  IconSparkles as Sparkles,
} from '@tabler/icons-react';

export const DataTab = React.memo(function DataTab() {
  const { t } = useLanguage();
  const { state, updateAppSetting, resetToDefaults } = useSettings();
  const { identity, pinEnabled, verifyPin, clearLocalEncryptedData } = useSecurity();
  const [clearDataConfirm, setClearDataConfirm] = useState(false);
  const [clearDataPin, setClearDataPin] = useState('');
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);

  const handleExportMyData = useCallback(async () => {
    try {
      const fn = await downloadMyDataExport();
      setAboutMsg(`Exported: ${fn}`);
    } catch {
      setAboutMsg('Export failed');
    }
  }, []);

  const handleClearAllData = useCallback(async () => {
    if (!clearDataConfirm) {
      setClearDataConfirm(true);
      setClearDataPin('');
      return;
    }
    if (pinEnabled && clearDataPin.length < 4) return;
    if (pinEnabled) {
      const ok = await verifyPin(clearDataPin);
      if (!ok) {
        setClearDataPin('');
        return;
      }
    }
    await clearLocalEncryptedData();
    setClearDataConfirm(false);
    setClearDataPin('');
    resetToDefaults();
  }, [clearDataConfirm, clearDataPin, pinEnabled, verifyPin, clearLocalEncryptedData, resetToDefaults]);

  const handleCopySeedPhrase = useCallback(async () => {
    const phrase = identity?.mnemonic ?? '';
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setAboutMsg('Seed phrase copied to clipboard');
    } catch {}
  }, [identity]);

  return (
    <>
      <SettingsSection
        title={t('settings.dataExport')}
        icon={<DatabaseIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<FileTextIcon className="w-4 h-4" />}
            label={t('settings.exportMyData')}
            description={t('settings.exportMyDataDesc')}
            onClick={handleExportMyData}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-export-data"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.dataBackup')}
        icon={<DatabaseIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<UploadIcon className="w-4 h-4" />}
            label={t('settings.backupNow')}
            description={t('settings.backupNowDesc')}
            onClick={() => setAboutMsg('Cloud backup is not configured yet')}
            disabled={!identity}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-backup-now"
          />
          <SettingsTile
            icon={<DownloadIcon className="w-4 h-4" />}
            label={t('settings.restoreBackup')}
            description={t('settings.restoreBackupDesc')}
            onClick={() => setAboutMsg('Cloud backup is not configured yet')}
            disabled={!identity}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-restore-backup"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Google Drive"
        icon={<CloudIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<CloudIcon className="w-4 h-4" />}
            label="Google Drive Sync"
            description="Sync settings & backups to Google Drive"
            onClick={() => { /* TODO */ }}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-google-drive"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.dangerZone')}
        icon={<AlertTriangleIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<TrashXIcon className="w-4 h-4" />}
            label={t('settings.clearAllData')}
            description={t('settings.clearAllDataDesc')}
            onClick={handleClearAllData}
            disabled={clearDataConfirm}
            tone="danger"
            badge={clearDataConfirm ? <X className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
            testId="settings-clear-all-data"
          />
          {clearDataConfirm && (
            <div className="space-y-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5" role="alert">
              <input
                type="password"
                placeholder="Enter PIN to confirm"
                value={clearDataPin}
                onChange={(e) => setClearDataPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 rounded-xl border border-red-500/30 bg-[var(--nova-surface)] text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)] focus:border-red-500/60 focus:outline-none"
                maxLength={6}
                autoFocus
              />
              <button
                onClick={handleClearAllData}
                disabled={clearDataPin.length < 4}
                className="w-full py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition cursor-pointer disabled:opacity-50"
              >
                {t('settings.confirmClearAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setClearDataConfirm(false);
                  setClearDataPin('');
                }}
                className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] text-xs font-medium transition cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

          <SettingsTile
            icon={<KeyIcon className="w-4 h-4" />}
            label={t('settings.showSeedPhrase')}
            description={t('settings.showSeedPhraseDesc')}
            onClick={handleCopySeedPhrase}
            badge={<CopyIcon className="w-4 h-4" />}
            testId="settings-show-seed-phrase"
          />
        </div>
      </SettingsSection>

      {aboutMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[var(--nova-surface-high)]/95 border border-[var(--nova-accent-color)]/50 text-[var(--nova-text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{aboutMsg}</span>
        </div>
      )}
    </>
  );
});