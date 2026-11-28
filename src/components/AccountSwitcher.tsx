import React, { useState } from 'react';
import {
  useAccount } from '../hooks/useAccount';
import { useLanguage } from '../context/LanguageContext';
import {IconPlus as Plus,
  IconUserCheck as UserCheck,
  IconStar as Star,
} from '@tabler/icons-react';
import { NovaModal } from '../lib/ui';
import { removeAccount, setPrimaryAccount } from '../lib/account/multiAccount';
import { OnboardingWizard } from './OnboardingWizard';
import { useSecurity } from '../hooks/useSecurity';

interface AccountSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded?: () => void;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
}) => {
  const { t } = useLanguage();
  const { accounts, activeAccount, switchAccount } = useAccount();
  const { removePin } = useSecurity();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  const handleSwitchAccount = (accountId: string) => {
    void removePin();
    switchAccount(accountId);
    onClose();
  };

  const handleAddAccount = () => {
    setShowOnboarding(true);
  };

  const handleOnboardingDone = () => {
    setShowOnboarding(false);
    onAccountAdded?.();
  };

  const handleRemoveAccount = (accountId: string) => {
    if (accounts.length <= 1) return;
    const result = removeAccount(accountId);
    if (result) {
      setDeletingAccountId(null);
    }
  };

  const handleSetPrimary = (accountId: string) => {
    setPrimaryAccount(accountId);
  };

  const primaryAccount = accounts.find(a => a.isPrimary);

  return (
    <>
      {isOpen && (
        <NovaModal
          isOpen={isOpen}
          onClose={onClose}
          title={t('settings.accounts.title')}
          maxWidth="lg"
          className="max-w-md"
        >
          <div className="space-y-4">
            {/* Current Account Indicator */}
            <div className="p-3 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white font-bold">
                  {activeAccount?.displayName?.slice(0, 2).toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--nova-text-primary)] truncate">{t('settings.accounts.current')}</p>
                  <p className="text-sm text-[var(--nova-text-secondary)] truncate">{activeAccount?.nickname ?? '@'}</p>
                </div>
                {activeAccount?.isPrimary && (
                  <Star className="w-5 h-5 text-amber-400" data-testid="primary-star" aria-label={t('settings.accounts.primary')} />
                )}
              </div>
            </div>

            {/* Account List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition ${
                    acc.id === activeAccount?.id
                      ? 'bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30'
                      : 'bg-[var(--nova-surface)] hover:bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--nova-surface-raised)] flex items-center justify-center text-[var(--nova-text-primary)] font-bold shrink-0">
                    {acc.displayName?.slice(0, 2).toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--nova-text-primary)] truncate">{acc.displayName}</p>
                      <p className="text-sm text-[var(--nova-text-secondary)] truncate">{acc.nickname}</p>
                      {acc.isPrimary && (
                        <Star className="w-4 h-4 text-amber-400" data-testid="primary-star" aria-label={t('settings.accounts.primary')} />
                      )}
                      {acc.id === activeAccount?.id && (
                        <UserCheck className="w-4 h-4 text-[var(--nova-accent-color)]" data-testid="active-indicator" aria-label={t('settings.accounts.active')} />
                      )}
                    </div>
                    <p className="text-xs text-[var(--nova-text-muted)]">
                      {t('settings.accounts.added', { date: new Date(acc.addedAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {acc.id !== activeAccount?.id && (
                      <button
                        onClick={() => handleSwitchAccount(acc.id)}
                        className="p-2 rounded-lg hover:bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)] transition"
                        title={t('settings.accounts.switch')}
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                    {!acc.isPrimary && accounts.length > 1 && (
                      <button
                        onClick={() => handleSetPrimary(acc.id)}
                        className="p-2 rounded-lg hover:bg-[var(--nova-surface-high)] text-[var(--nova-text-secondary)] transition"
                        title={t('settings.accounts.setPrimary')}
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {accounts.length > 1 && acc.id !== primaryAccount?.id && (
                      <button
                        onClick={() => setDeletingAccountId(acc.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition"
                        title={t('settings.accounts.remove')}
                      >
                        <TrashX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Account Button */}
            <button
              onClick={handleAddAccount}
              className="w-full py-3 rounded-2xl bg-[var(--nova-accent-color)] hover:brightness-110 text-white text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('settings.accounts.addAccount')}
            </button>

            <p className="text-center text-xs text-[var(--nova-text-muted)]">
              {t('settings.accounts.hint')}
            </p>
          </div>
        </NovaModal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingAccountId && (
        <NovaModal
          isOpen={true}
          onClose={() => setDeletingAccountId(null)}
          title={t('settings.accounts.confirmDelete')}
          maxWidth="sm"
        >
          <p className="text-[var(--nova-text-secondary)] text-center mb-6">
            {t('settings.accounts.deleteWarning')}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeletingAccountId(null)}
              className="px-4 py-2 rounded-xl bg-[var(--nova-surface)] hover:bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] transition"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => handleRemoveAccount(deletingAccountId)}
              className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition"
            >
              {t('common.delete')}
            </button>
          </div>
        </NovaModal>
      )}

      {/* Add Account Onboarding */}
      {showOnboarding && (
        <OnboardingWizard onDone={handleOnboardingDone} />
      )}
    </>
  );
};

export default AccountSwitcher;




















