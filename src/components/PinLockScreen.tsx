import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';

interface PinLockScreenProps {
  onUnlock: () => void;
  onSetPin?: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onUnlock, onSetPin }) => {
  const { t } = useLanguage();
  const { verifyPin, setPin, pinHash } = useSecurity();
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState(false);
  const [isSetting, setIsSetting] = useState(!pinHash);

  const handleDigit = (digit: string) => {
    setError(false);
    if (pin.length < 6) {
      setPinInput(pin + digit);
    }
  };

  const handleBackspace = () => {
    setError(false);
    setPinInput(pin.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (isSetting) {
      if (pin.length < 4) {
        setError(true);
        return;
      }
      await setPin(pin);
      setIsSetting(false);
      setPinInput('');
      onUnlock();
      return;
    }
    const ok = await verifyPin(pin);
    if (ok) {
      setError(false);
      setPinInput('');
      onUnlock();
    } else {
      setError(true);
      setPinInput('');
    }
  };

  const digits = '1234567890'.split('');

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0c10] flex flex-col items-center justify-center p-6 text-white backdrop-blur-sm">
      <div className="w-full max-w-sm flex flex-col items-center justify-center gap-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 mb-2">
          <Lock className="w-6 h-6 text-[var(--nova-accent-color)]" />
        </div>
        <h2 className="text-xl font-bold text-white">{isSetting ? t('settings.passcodeLock') : t('common.passcodeLock')}</h2>
        <p className="text-sm text-[#8c919d] text-center mb-6">
          {isSetting ? t('settings.passcodeCreate') : t('settings.passcodeEnter')}
        </p>

        {/* PIN dots */}
        <div className="flex gap-2 mb-8">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                i < pin.length
                  ? 'bg-[var(--nova-accent-color)] shadow-[0_0_10px_rgba(255,78,24,0.6)]'
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              {i < pin.length && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mb-4 animate-pulse">
            <AlertCircle className="w-3 h-3" />
            <span>{t('common.passcodeError')}</span>
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 w-full mb-4">
          {digits.map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg font-medium text-white hover:bg-white/10 transition active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleBackspace}
            className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg font-medium text-white/60 hover:bg-white/10 transition active:scale-95"
            aria-label={t('common.backspace') ?? 'Backspace'}
          >
            <span className="text-[var(--nova-accent-color)]">⌫</span>
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg font-medium text-white hover:bg-white/10 transition active:scale-95"
          >
            0
          </button>
        </div>

        {isSetting && onSetPin && (
          <button
            onClick={onSetPin}
            className="w-full py-2 rounded-xl bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30 text-[var(--nova-accent-color)] text-xs font-medium hover:bg-[var(--nova-accent-color)]/20 transition active:scale-95"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
};
