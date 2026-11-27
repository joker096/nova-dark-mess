import React, { useCallback } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import {
  SettingsSection,
  SettingsTile,
} from '../settingsPrimitives';
import {
  IconInfoCircle as InfoIcon,
  IconCopy as CopyIcon,
  IconExternalLink as ExternalLinkIcon,
  IconGitBranch as GitBranchIcon,
  IconShieldCheck as ShieldCheckIcon,
  IconBug as BugIcon,
  IconHeart as HeartIcon,
  IconSparkles as SparklesIcon,
  IconChevronRight as ChevronRightIcon,
} from '@tabler/icons-react';

export const AboutTab = React.memo(function AboutTab() {
  const { t } = useLanguage();
  const { state } = useSettings();
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);

  const copyAppLink = useCallback(() => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setAboutMsg(t('about.copyAppLinkCopied'));
    } catch {}
  }, []);

  const openGitHub = useCallback(() => {
    window.open('https://github.com/nova-messenger/nova-dark-messenger', '_blank', 'noopener,noreferrer');
  }, []);

  const openPrivacy = useCallback(() => {
    window.open('/privacy.html', '_blank', 'noopener,noreferrer');
  }, []);

  const openSecurity = useCallback(() => {
    window.open('/security.html', '_blank', 'noopener,noreferrer');
  }, []);

  const reportBug = useCallback(() => {
    window.open('https://github.com/nova-messenger/nova-dark-messenger/issues/new', '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <>
      <SettingsSection
        title={t('settings.about')}
        icon={<InfoIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<InfoIcon className="w-4 h-4" />}
            label={t('settings.version')}
            description={t('about.version', { version: '1.0.59' })}
            onClick={() => {}}
            testId="settings-version"
          />
          <SettingsTile
            icon={<GitBranchIcon className="w-4 h-4" />}
            label={t('about.sourceCode')}
            description={t('about.sourceCodeDesc')}
            onClick={openGitHub}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-github"
          />
          <SettingsTile
            icon={<ShieldCheckIcon className="w-4 h-4" />}
            label={t('about.privacyPolicy')}
            description={t('about.privacyPolicyDesc')}
            onClick={openPrivacy}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-privacy"
          />
          <SettingsTile
            icon={<BugIcon className="w-4 h-4" />}
            label={t('about.reportBug')}
            description={t('about.reportBugDesc')}
            onClick={reportBug}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-report-bug"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('about.legalCompliance')}
        icon={<ShieldCheckIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<ShieldCheckIcon className="w-4 h-4" />}
            label={t('about.termsOfService')}
            description={t('about.termsOfServiceDesc')}
            onClick={() => window.open('/terms.html', '_blank', 'noopener,noreferrer')}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-terms"
          />
          <SettingsTile
            icon={<InfoIcon className="w-4 h-4" />}
            label={t('about.licenses')}
            description={t('about.licensesDesc')}
            onClick={() => window.open('/licenses.html', '_blank', 'noopener,noreferrer')}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-licenses"
          />
          <SettingsTile
            icon={<SecurityIcon className="w-4 h-4" />}
            label={t('about.security')}
            description={t('about.securityDesc')}
            onClick={openSecurity}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-security"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('about.community')}
        icon={<HeartIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<SparklesIcon className="w-4 h-4" />}
            label={t('about.discordCommunity')}
            description={t('about.discordCommunityDesc')}
            onClick={() => window.open('https://discord.gg/nova-messenger', '_blank', 'noopener,noreferrer')}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-discord"
          />
          <SettingsTile
            icon={<HeartIcon className="w-4 h-4" />}
            label={t('about.contribute')}
            description={t('about.contributeDesc')}
            onClick={() => window.open('https://github.com/nova-messenger/nova-dark-messenger/blob/main/CONTRIBUTING.md', '_blank', 'noopener,noreferrer')}
            badge={<ExternalLinkIcon className="w-4 h-4" />}
            testId="settings-contribute"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('about.appInfo')}
        icon={<InfoIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<CopyIcon className="w-4 h-4" />}
            label={t('about.copyAppLink')}
            description={t('about.copyAppLinkDesc')}
            onClick={copyAppLink}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-copy-link"
          />
          <div className="px-1 py-2 text-center text-[11px] text-[var(--nova-text-muted)] border-t border-[var(--nova-border-subtle)]">
            <p>{t('about.appVersion', { version: '1.0.59' })}</p>
            <p className="mt-1">{t('about.builtWith')}</p>
            <p className="mt-1">{t('about.copyright')}</p>
          </div>
        </div>
      </SettingsSection>

      {aboutMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[var(--nova-surface-high)]/95 border border-[var(--nova-accent-color)]/50 text-[var(--nova-text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <SparklesIcon className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{aboutMsg}</span>
        </div>
      )}
    </>
  );
});

import { useState } from 'react';
import { IconShield as SecurityIcon } from '@tabler/icons-react';