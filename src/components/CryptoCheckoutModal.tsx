import React, { useState } from 'react';
import {IconX as X, IconCheck as Check, IconCurrencyDollar as DollarSign, IconLock as Lock, IconClock as Clock} from '@tabler/icons-react';
import { createPremiumCheckout, activatePremiumLicense, MIN_SUBSCRIPTION_COST } from '../lib/premium';
import { NovaButton } from '../lib/ui';
import { useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface CryptoCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CryptoCheckoutModal: React.FC<CryptoCheckoutModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');

  const localizeError = (error?: string) => {
    if (error?.includes('blocked')) return t('premium.errorWindow');
    if (error?.includes('unavailable')) return t('premium.errorUnavailable');
    if (error?.includes('waiting for payment')) return t('premium.errorPending');
    return t('premium.errorGeneric');
  };

  const handlePay = async () => {
    setPaying(true);
    const r = await createPremiumCheckout();
    setPaying(false);
    if (r.ok) {
      setPaid(true);
      onSuccess();
    } else {
      setActivateMsg(localizeError(r.error));
    }
  };

  const handleActivate = async () => {
    if (!licenseInput.trim()) return;
    setActivating(true);
    setActivateMsg('');
    const r = await activatePremiumLicense(licenseInput);
    setActivating(false);
    if (r.ok) {
      setPaid(true);
      setActivateMsg('');
      onSuccess();
    } else {
      setActivateMsg(localizeError(r.error));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crypto-checkout-title"
        className="bg-[#151621] border border-white/10 rounded-3xl w-full max-w-md text-white shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-3 duration-250"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0 p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 id="crypto-checkout-title" className="font-bold text-sm text-white leading-tight">
                {t('premium.cryptoTitle')}
              </h3>
              <p className="text-[10px] text-[#828795]">
                {t('premium.cryptoSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto no-scrollbar">
          {/* Amount */}
          <div className="bg-[#1b1c28] border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#868b98]">{t('premium.amount')}</span>
              <span className="text-xs font-mono text-white/60">
                ${(MIN_SUBSCRIPTION_COST / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-[20px] font-bold text-white">
                ${(MIN_SUBSCRIPTION_COST / 100).toFixed(2)}
              </span>
              <span className="text-[11px] text-[#868b98]">USD {t('premium.sub30Days')}</span>
            </div>
          </div>

          <p className="text-[11px] text-[#868b98]">
            {t('premium.cryptoSubtitle')}
          </p>

          {/* Pay button */}
          <NovaButton
            variant="accent"
            block
            size="md"
            onClick={handlePay}
            disabled={paying || paid}
          >
            {paying ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>{t('premium.checking')}</span>
              </>
            ) : paid ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t('premium.active')}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{t('premium.payNow')}</span>
              </>
            )}
          </NovaButton>

          {paid && (
            <div className="mt-2 p-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-[11px] font-medium flex items-center gap-2">
              <Check className="w-3 h-3" />
              {t('premium.paymentReceived')}
            </div>
          )}

          {/* Manual license activation */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <p className="text-[10px] text-[#868b98]">{t('premium.licensePrompt')}</p>
            <input
              type="text"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              placeholder="MA1… / NOVA-GIFT-…"
              className="w-full bg-[#1b1c28] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <NovaButton
              variant="ghost"
              block
              size="md"
              onClick={handleActivate}
              disabled={activating || !licenseInput.trim()}
            >
              {activating ? t('premium.checking') : t('premium.activate')}
            </NovaButton>
            {activateMsg && (
              <p className="text-[10px] text-red-400" role="alert" aria-live="assertive">
                {activateMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};













