import React, { useState } from 'react';
import {
  X,
  Check,
  Copy,
  DollarSign,
  Bitcoin,
  Send,
  Lock,
  Shield,
  Clock,
  Smartphone,
} from 'lucide-react';
import { setPremium } from '../lib/premium';
import { NovaButton } from '../lib/ui';
import { useLanguage } from '../context/LanguageContext';

type CryptoCurrency = {
  id: string;
  name: string;
  icon: React.ElementType;
  address: string;
  network: string;
};

const CRYPTO_CURRENCIES: CryptoCurrency[] = [
  {
    id: 'usdt_trc20',
    name: 'USDT (TRC20)',
    icon: DollarSign,
    address: 'TXYZ1234567890abcdefUSDTTRC20',
    network: 'TRON',
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    icon: Bitcoin,
    address: 'bc1xyz1234567890abcdefBITCOIN',
    network: 'Bitcoin',
  },
  {
    id: 'eth',
    name: 'Ethereum',
    icon: Shield,
    address: '0xXYZ1234567890abcdefETHEREUM',
    network: 'Ethereum',
  },
  {
    id: 'ton',
    name: 'Toncoin',
    icon: Send,
    address: 'EQXYZ1234567890abcdefTONCOIN',
    network: 'TON',
  },
  {
    id: 'sol',
    name: 'Solana',
    icon: Smartphone,
    address: 'SolXYZ1234567890abcdefSOLANA',
    network: 'Solana',
  },
];

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
  const [currency, setCurrency] = useState<CryptoCurrency>(CRYPTO_CURRENCIES[0]);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(currency.address);
  };

  const handlePay = async () => {
    setPaying(true);
    // Dev-mode activation — replace with real on-chain verification in production
    await new Promise((r) => setTimeout(r, 1200));
    setPremium(true, Date.now() + 30 * 24 * 60 * 60 * 1000);
    setPaying(false);
    setPaid(true);
    onSuccess();
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
          {/* Currency selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[#868b98] mb-2">
              {t('premium.cryptoCurrency')}
            </label>
            <div className="flex flex-wrap gap-2">
              {CRYPTO_CURRENCIES.map((c) => {
                const IconComp = c.icon;
                const isSel = currency.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition border ${
                      isSel
                        ? 'bg-[var(--nova-accent-color)]/20 border-[var(--nova-accent-color)]/50 text-white shadow-[var(--nova-accent-color)]/25'
                        : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{c.name}</span>
                    <span className="text-[9px] text-white/40">{c.network}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div className="bg-[#1b1c28] border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#868b98]">{t('premium.amount')}</span>
              <span className="text-xs font-mono text-white/60">$0.49</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-[20px] font-bold text-white">$0.49</span>
              <span className="text-[11px] text-[#868b98]">USD equivalent</span>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#868b98]">
              {t('premium.sendTo')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currency.address}
                readOnly
                className="flex-1 bg-[#12131b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-white/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={copyAddress}
                title={t('premium.copyAddress')}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition cursor-pointer"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="text-[10px] text-[#868b98]">
            {t('premium.networkFee', { network: currency.network })}
          </div>

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
