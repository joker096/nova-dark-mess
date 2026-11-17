import React, { useEffect, useState } from 'react';
import { Lock, AlertCircle, Delete, Fingerprint, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';

interface PinLockScreenProps {
  onUnlock: () => void;
  onSetPin?: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onUnlock, onSetPin }) => {
  const { t } = useLanguage();
  const {
    pinHash,
    verifyPin,
    pinLockoutUntil,
    pinLength = 4,
    biometricEnabled = false,
    unlockWithBiometric,
  } = useSecurity();
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSetting] = useState(!pinHash);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBiometricBusy, setIsBiometricBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isLockedOut = pinLockoutUntil !== null && pinLockoutUntil > now;
  const remainingSeconds = isLockedOut ? Math.ceil((pinLockoutUntil - now) / 1000) : 0;
  const dots = Math.max(4, Math.min(6, pinLength));

  useEffect(() => {
    if (pinLockoutUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= pinLockoutUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pinLockoutUntil]);

  const handleDigit = (digit: string) => {
    setError(null);
    if (!isLockedOut && !isVerifying && pin.length < dots) {
      setPinInput(pin + digit);
    }
  };

  const handleBackspace = () => {
    setError(null);
    if (!isLockedOut && !isVerifying) setPinInput(pin.slice(0, -1));
  };

  const handleUnlock = async () => {
    if (pin.length < 4 || isLockedOut || isVerifying) return;
    setIsVerifying(true);
    setError(null);
    try {
      if (await verifyPin(pin)) {
        setPinInput('');
        onUnlock();
      } else {
        setPinInput('');
        setError(t('common.passcodeError'));
      }
    } catch (verificationError) {
      setPinInput('');
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : String(verificationError),
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBiometric = async () => {
    if (!unlockWithBiometric || isBiometricBusy || isLockedOut) return;
    setIsBiometricBusy(true);
    setError(null);
    try {
      const ok = await unlockWithBiometric();
      if (ok) {
        onUnlock();
      } else {
        setError(t('common.biometricFailed'));
      }
    } finally {
      setIsBiometricBusy(false);
    }
  };

  const handleSkip = () => {
    onUnlock();
  };

  const digits = '123456789'.split('');

  const numpadButton =
    'w-full h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl font-light tracking-wide text-white hover:bg-white/[0.09] transition active:scale-95 disabled:opacity-35 disabled:pointer-events-none';

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0c10] flex flex-col items-center justify-center overflow-hidden p-6 text-white backdrop-blur-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[var(--nova-accent-color)]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 translate-x-1/3 translate-y-1/3 rounded-full bg-[var(--nova-accent-color)]/10 blur-3xl"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-white/[0.07] bg-[#111218]/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30">
          <Lock className="w-5 h-5 text-[var(--nova-accent-color)]" />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2 className="text-lg font-semibold text-white">
            {isSetting ? t('settings.passcodeLock') : t('common.passcodeLock')}
          </h2>
          <p className="text-[12.5px] leading-relaxed text-[#8c919d]">
            {isSetting ? t('common.passcodeCreate') : t('common.passcodeEnter')}
          </p>
        </div>

        <div className="flex items-center gap-2.5" aria-live="polite">
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-all duration-200 ${
                i < pin.length
                  ? 'scale-110 bg-[var(--nova-accent-color)] shadow-[0_0_10px_var(--nova-accent-color)]'
                  : 'bg-white/15'
              }`}
            />
          ))}
        </div>

        <div className="min-h-[18px] text-center">
          {isLockedOut ? (
            <p role="alert" className="flex items-center justify-center gap-1.5 text-[11.5px] text-red-400">
              <AlertCircle className="w-3 h-3" />
              {t('common.passcodeError')} · {remainingSeconds}s
            </p>
          ) : error ? (
            <p role="alert" className="flex items-center justify-center gap-1.5 text-[11.5px] text-red-400">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          {digits.map((d) => (
            <button
              key={d}
              disabled={isLockedOut || isVerifying}
              onClick={() => handleDigit(d)}
              className={numpadButton}
            >
              {d}
            </button>
          ))}
          <div className="h-14 w-full" aria-hidden="true" />
          <button
            disabled={isLockedOut || isVerifying}
            onClick={() => handleDigit('0')}
            className={numpadButton}
          >
            0
          </button>
          <button
            disabled={isLockedOut || isVerifying}
            onClick={handleBackspace}
            className={`${numpadButton} text-white/60`}
            aria-label={t('common.backspace') ?? 'Backspace'}
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {!isSetting && (
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={pin.length < 4 || isLockedOut || isVerifying}
            className="w-full rounded-2xl bg-[var(--nova-accent-color)] py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-35 disabled:pointer-events-none"
          >
            {t('common.unlock')}
          </button>
        )}

        {!isSetting && biometricEnabled && (
          <button
            type="button"
            onClick={() => void handleBiometric()}
            disabled={isBiometricBusy || isLockedOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/[0.08] py-2.5 text-[12.5px] font-medium text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/15 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Fingerprint className={`w-4 h-4 ${isBiometricBusy ? 'animate-pulse' : ''}`} />
            {t('common.unlockWithBiometric')}
          </button>
        )}

        {isSetting && onSetPin && (
          <button
            onClick={onSetPin}
            className="w-full rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 py-2 text-xs font-medium text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/20 active:scale-95"
          >
            {t('common.cancel')}
          </button>
        )}

        {!isSetting && (
          <button
            type="button"
            onClick={handleSkip}
            className="flex items-center gap-1 text-[11.5px] font-medium text-white/35 transition hover:text-white/60"
          >
            {t('onboarding.skip')}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="relative mt-5 max-w-sm text-center text-[10.5px] leading-relaxed text-white/25">
        {t('settings.lockLocalNote')}
      </p>
    </div>
  );
};
