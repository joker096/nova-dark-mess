import React, { useState } from 'react';
import {
  X,
  Check,
  DollarSign,
  Lock,
  Clock,
} from 'lucide-react';
import { setPremium, checkoutPremium } from '../lib/premium';
import { NovaButton } from '../lib/ui';
import { useLanguage } from '../context/LanguageContext';

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
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    // Real PaymentO checkout (see src/lib/premium.ts). Falls back to a local
    // 30-day activation when the PaymentO widget is absent (dev mode).
    const ok = await checkoutPremium();
    if (ok) {
      setPremium(true);
      setPaying(false);
      setPaid(true);
      onSuccess();
    } else {
      setPaying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#151621] border border-white/10 rounded-3xl w-full max-w-md text-white shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-3 duration-250"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0 p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white leading-tight">
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
              <span className="text-xs font-mono text-white/60">$0.49</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-[20px] font-bold text-white">$0.49</span>
              <span className="text-[11px] text-[#868b98]">USD / month</span>
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
        </div>
      </div>
    </div>
  );
};
