import React from 'react';
import { IconAlertCircle as AlertCircle, IconShieldCheck as ShieldCheck, IconX as X } from '@tabler/icons-react';
import { useLanguage } from '../context/LanguageContext';
import {
  shouldShowFirstContactWarning,
  dismissFirstContactWarning,
  shouldShowVerificationReminder,
  dismissVerificationReminder,
  analyzeMessageForPhishing,
  checkImpersonationRisk,
} from '../lib/security/socialEngineering';
import { getContactDisplayName } from '../lib/security/socialEngineering';
import { getPhoneAccessContacts } from '../lib/social/socialPrivacy';

interface FirstContactWarningProps {
  contactId: string;
  isVerified: boolean;
  onDismiss?: () => void;
  onOpenSafetyNumber?: () => void;
  className?: string;
}

export const FirstContactWarning: React.FC<FirstContactWarningProps> = ({
  contactId,
  isVerified,
  onDismiss,
  onOpenSafetyNumber,
  className = '',
}) => {
  const { t } = useLanguage();
  const contactName = getContactDisplayName(contactId);
  const showFirstContact = shouldShowFirstContactWarning(contactId);
  const showVerification = shouldShowVerificationReminder(contactId, isVerified);
  const impersonation = checkImpersonationRisk(contactId);

  if (!showFirstContact && !showVerification && !impersonation.isRisk) {
    return null;
  }

  const handleDismissFirstContact = () => {
    dismissFirstContactWarning(contactId);
    onDismiss?.();
  };

  const handleDismissVerification = () => {
    dismissVerificationReminder(contactId);
    onDismiss?.();
  };

  return (
    <div className={`border-l-4 bg-[var(--nova-overlay-weak)] rounded-r-xl p-3 ${className}`}>
      {showFirstContact && (
        <div className="flex items-start gap-3 mb-2" data-testid="first-contact-warning">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--nova-text-primary)]">
              {t('security.firstContactTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.firstContactDesc', { name: contactName })}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleDismissFirstContact}
                className="px-3 py-1.5 text-xs font-medium text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/10 rounded-lg transition cursor-pointer"
              >
                {t('security.gotIt')}
              </button>
              <button
                onClick={onOpenSafetyNumber}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                {t('security.verifyContact')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerification && !showFirstContact && (
        <div className="flex items-start gap-3 mb-2" data-testid="verification-reminder">
          <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/15 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--nova-text-primary)]">
              {t('security.verifyTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.verifyDesc', { name: contactName })}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleDismissVerification}
                className="px-3 py-1.5 text-xs font-medium text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] rounded-lg transition cursor-pointer"
              >
                {t('security.later')}
              </button>
              <button
                onClick={onOpenSafetyNumber}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                {t('security.verifyNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {impersonation.isRisk && (
        <div className="flex items-start gap-3" data-testid="impersonation-warning">
          <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-400">
              {t('security.impersonationTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.impersonationDesc', { name: contactName, similarTo: impersonation.similarTo || 'another contact' })}
            </p>
            <button
              onClick={onDismiss}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] rounded-lg transition cursor-pointer"
            >
              {t('security.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Need to import setShowSafetyNumber from context or pass as prop
// For now, let's create a version that accepts the callback
interface FirstContactWarningWithCallbacksProps extends FirstContactWarningProps {
  onOpenSafetyNumber: () => void;
}

export const FirstContactWarningWithCallbacks: React.FC<FirstContactWarningWithCallbacksProps> = ({
  contactId,
  isVerified,
  onDismiss,
  onOpenSafetyNumber,
  className = '',
}) => {
  const { t } = useLanguage();
  const contactName = getContactDisplayName(contactId);
  const showFirstContact = shouldShowFirstContactWarning(contactId);
  const showVerification = shouldShowVerificationReminder(contactId, isVerified);
  const impersonation = checkImpersonationRisk(contactId);

  if (!showFirstContact && !showVerification && !impersonation.isRisk) {
    return null;
  }

  const handleDismissFirstContact = () => {
    dismissFirstContactWarning(contactId);
    onDismiss?.();
  };

  const handleDismissVerification = () => {
    dismissVerificationReminder(contactId);
    onDismiss?.();
  };

  return (
    <div className={`border-l-4 bg-[var(--nova-overlay-weak)] rounded-r-xl p-3 ${className}`}>
      {showFirstContact && (
        <div className="flex items-start gap-3 mb-2" data-testid="first-contact-warning">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--nova-text-primary)]">
              {t('security.firstContactTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.firstContactDesc', { name: contactName })}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleDismissFirstContact}
                className="px-3 py-1.5 text-xs font-medium text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/10 rounded-lg transition cursor-pointer"
              >
                {t('security.gotIt')}
              </button>
              <button
                onClick={onOpenSafetyNumber}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                {t('security.verifyContact')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerification && !showFirstContact && (
        <div className="flex items-start gap-3 mb-2" data-testid="verification-reminder">
          <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/15 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--nova-text-primary)]">
              {t('security.verifyTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.verifyDesc', { name: contactName })}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleDismissVerification}
                className="px-3 py-1.5 text-xs font-medium text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] rounded-lg transition cursor-pointer"
              >
                {t('security.later')}
              </button>
              <button
                onClick={onOpenSafetyNumber}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                {t('security.verifyNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {impersonation.isRisk && (
        <div className="flex items-start gap-3" data-testid="impersonation-warning">
          <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-400">
              {t('security.impersonationTitle')}
            </p>
            <p className="text-[12px] text-[var(--nova-text-secondary)] mt-0.5">
              {t('security.impersonationDesc', { name: contactName, similarTo: impersonation.similarTo || 'another contact' })}
            </p>
            <button
              onClick={onDismiss}
              className="mt-2 px-3 py-1.5 text-xs font-medium text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] rounded-lg transition cursor-pointer"
            >
              {t('security.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface PhishingWarningProps {
  analysis: ReturnType<typeof analyzeMessageForPhishing>;
  onDismiss: () => void;
  className?: string;
}

export const PhishingWarning: React.FC<PhishingWarningProps> = ({ analysis, onDismiss, className = '' }) => {
  if (!analysis.isSuspicious) return null;

  const { t } = useLanguage();
  const riskColors = {
    low: 'bg-blue-500/15 text-blue-400',
    medium: 'bg-amber-500/15 text-amber-400',
    high: 'bg-red-500/15 text-red-400',
  };
  const riskIcons = {
    low: 'info',
    medium: 'alert',
    high: 'shield-off',
  };

  return (
    <div className={`border-l-4 rounded-r-xl p-3 ${riskColors[analysis.riskLevel]} ${className}`} data-testid="phishing-warning">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {t('security.phishingWarningTitle')}
          </p>
          <ul className="text-[12px] mt-1 space-y-0.5">
            {analysis.reasons.map((reason, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 mt-1.5" />
                {reason}
              </li>
            ))}
          </ul>
          <p className="text-[11px] mt-2 opacity-80">
            {t('security.phishingAdvice')}
          </p>
          <button
            onClick={onDismiss}
            className="mt-2 px-3 py-1.5 text-xs font-medium hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            {t('security.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
};