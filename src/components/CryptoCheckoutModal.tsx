import React, { useState } from 'react';
import {
  X,
  Check,
  DollarSign,
  Lock,
  Clock,
} from 'lucide-react';
import { createPremiumCheckout, activatePremiumLicense } from '../lib/premium';
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
  const [licenseInput, setLicenseInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState('');

  const handlePay = async () => {
    setPaying(true);
    const r = await createPremiumCheckout();
    setPaying(false);
    if (r.ok) {
      setPaid(true);
      onSuccess();
    } else {
      setActivateMsg(r.error || 'checkout failed');
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
      setActivateMsg(r.error || 'activation failed');
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

          {/* Manual license activation */}
          <div className="pt-2 border-t border-white/5 space-y-2">
            <p className="text-[10px] text-[#868b98]">Already paid? Paste your license key:</p>
            <input
              type="text"
              value={licenseInput}
              onChange={(e) => setLicenseInput(e.target.value)}
              placeholder="MA1...."
              className="w-full bg-[#1b1c28] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <NovaButton
              variant="ghost"
              block
              size="md"
              onClick={handleActivate}
              disabled={activating || !licenseInput.trim()}
            >
              {activating ? t('premium.checking') : 'Activate license'}
            </NovaButton>
            {activateMsg && (
              <p className="text-[10px] text-red-400">{activateMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
