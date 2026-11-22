import React, { useEffect, useState } from 'react';
import { Lock, AlertCircle, Delete, Fingerprint, ChevronRight, KeyRound, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((ms % (60 * 1000)) / 1000);
  if (days > 0) return `${days}d ${hours.toString().padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

interface PinLockScreenProps {
  onUnlock: () => void;
  onSetPin?: () => void;
  /** Called after a successful account recovery or reset (app reload by default). */
  onRecovered?: () => void;
}

type RecoveryKind = 'phrase' | 'backup' | 'pinReset';

export const PinLockScreen: React.FC<PinLockScreenProps> = ({ onUnlock, onSetPin, onRecovered }) => {
  const { t } = useLanguage();
  const {
    pinHash,
    verifyPin,
    pinLockoutUntil,
    pinLength = 4,
    biometricEnabled = false,
    unlockWithBiometric,
    recoverAccessWithMnemonic,
    recoverAccessWithBackup,
    resetLocalAccount,
    requestPinReset,
    isPinResetAllowed,
    performPinReset,
  } = useSecurity();
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSetting] = useState(!pinHash);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBiometricBusy, setIsBiometricBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryKind, setRecoveryKind] = useState<RecoveryKind>('phrase');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryFile, setRecoveryFile] = useState<File | null>(null);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pinResetRequested, setPinResetRequested] = useState(false);
  const [pinResetAllowedAt, setPinResetAllowedAt] = useState<number | null>(null);
  const isLockedOut = pinLockoutUntil !== null && pinLockoutUntil > now;
  const remainingSeconds = isLockedOut ? Math.ceil((pinLockoutUntil - now) / 1000) : 0;
  // Turn the hint into "Touch the sensor" once at least one attempt failed,
  // which is the whole reason the sensor was promoted into the keypad.
  const [biometricHintActive, setBiometricHintActive] = useState(false);
  const dots = Math.max(4, Math.min(6, pinLength));
  const showBiometricKey = !isSetting && biometricEnabled;
  const placementHint = biometricHintActive
    ? t('settings.biometricHint')
    : isSetting
      ? t('common.passcodeCreate')
      : t('common.passcodeEnter');

  useEffect(() => {
    if (biometricEnabled) setBiometricHintActive(false);
  }, [biometricEnabled]);

  const renderPinUI = () => (
    <div className="flex flex-col w-full gap-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--nova-accent-color)]/10 border border-[var(--nova-accent-color)]/30">
        <Lock className="w-5 h-5 text-[var(--nova-accent-color)]" />
      </div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="text-lg font-semibold text-white">
          {isSetting ? t('settings.passcodeLock') : t('common.passcodeLock')}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-[#8c919d]">{placementHint}</p>
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
        {showBiometricKey ? (
          <button
            type="button"
            onClick={() => void handleBiometric()}
            disabled={isBiometricBusy || isLockedOut}
            className={`${numpadButton} text-[var(--nova-accent-color)]`}
            aria-label={t('common.unlockWithBiometric')}
          >
            <Fingerprint className={`w-5 h-5 ${isBiometricBusy ? 'animate-pulse' : ''}`} />
          </button>
        ) : (
          <div className="h-14 w-full" aria-hidden="true" />
        )}
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
          disabled={pin.length < dots || isLockedOut || isVerifying}
          className="w-full rounded-2xl bg-[var(--nova-accent-color)] py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-35 disabled:pointer-events-none"
        >
          {t('common.unlock')}
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
          onClick={() => setShowRecovery(true)}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-white/40 transition hover:text-white/70"
        >
          <KeyRound className="w-3 h-3" />
          {t('common.forgotPin')}
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  const renderRecoveryUI = () => {
    if (!showRecovery) return null;
    return (
      <div className="flex flex-col w-full gap-4">
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowRecovery(false);
              setRecoveryError(null);
              setConfirmReset(false);
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition"
            aria-label={t('onboarding.back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold">{t('common.recoverTitle')}</h2>
        </div>

        <p className="text-[12px] leading-relaxed text-[#8c919d]">{t('common.recoverBody')}</p>

        <div className="grid w-full grid-cols-3 gap-1.5 rounded-2xl bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => {
              setRecoveryKind('phrase');
              setRecoveryError(null);
              setConfirmReset(false);
            }}
            className={`rounded-xl py-2 text-[11.5px] font-semibold transition ${
              recoveryKind === 'phrase' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {t('common.recoverWithPhrase')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryKind('backup');
              setRecoveryError(null);
              setConfirmReset(false);
            }}
            className={`rounded-xl py-2 text-[11.5px] font-semibold transition ${
              recoveryKind === 'backup' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {t('common.recoverWithBackup')}
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryKind('pinReset');
              setRecoveryError(null);
              setConfirmReset(false);
            }}
            className={`rounded-xl py-2 text-[11.5px] font-semibold transition ${
              recoveryKind === 'pinReset' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white/80'
            }`}
          >
            {t('common.pinReset7Days')}
          </button>
        </div>

        {recoveryKind === 'phrase' ? (
          <div className="w-full space-y-2">
            <textarea
              value={recoveryPhrase}
              onChange={(event) => {
                setRecoveryPhrase(event.target.value);
                setRecoveryError(null);
              }}
              placeholder={t('onboarding.phrasePlaceholder')}
              aria-label={t('onboarding.phraseLabel')}
              rows={3}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${textInput} resize-none font-mono text-[12px]`}
            />
            <button
              type="button"
              onClick={() => void recoverWithPhrase()}
              disabled={recoveryBusy || !recoveryPhrase.trim()}
              className="w-full rounded-2xl bg-[var(--nova-accent-color)] py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-35 disabled:pointer-events-none"
            >
              {t('onboarding.restoreAction')}
            </button>
          </div>
        ) : recoveryKind === 'backup' ? (
          <div className="w-full space-y-2">
            <input
              type="file"
              accept=".nova-backup"
              aria-label={t('onboarding.backupFileLabel')}
              onChange={(event) => {
                setRecoveryFile(event.target.files?.[0] ?? null);
                setRecoveryError(null);
              }}
              className="w-full text-xs text-white/70 file:mr-3 file:rounded-xl file:border file:border-white/10 file:bg-white/[0.05] file:px-3 file:py-2 file:text-xs file:text-white/80"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={recoveryPassphrase}
              onChange={(event) => {
                setRecoveryPassphrase(event.target.value);
                setRecoveryError(null);
              }}
              placeholder={t('onboarding.backupPassphrase')}
              aria-label={t('onboarding.backupPassphrase')}
              className={textInput}
            />
            <button
              type="button"
              onClick={() => void recoverWithBackup()}
              disabled={recoveryBusy || !recoveryFile || recoveryPassphrase.length < 8}
              className="w-full rounded-2xl bg-[var(--nova-accent-color)] py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-35 disabled:pointer-events-none"
            >
              {t('settings.importBackup')}
            </button>
          </div>
        ) : (
          <div className="w-full space-y-2 text-center">
            {pinResetRequested ? (
              <>
                <p className="text-[12px] leading-relaxed text-[#8c919d]">
                  {t('settings.pinResetRequested')}
                </p>
                <p className="text-lg font-mono tabular-nums text-[var(--nova-accent-color)]" role="timer">
                  {pinResetAllowedAt
                    ? formatTimeRemaining(pinResetAllowedAt - now)
                    : t('settings.pinResetCalculating')}
                </p>
                <button
                  type="button"
                  onClick={() => void handlePerformPinReset()}
                  disabled={recoveryBusy || !isPinResetAllowed()}
                  className="w-full rounded-2xl bg-[var(--nova-accent-color)] py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-35 disabled:pointer-events-none mt-4"
                >
                  {t('settings.pinResetNow')}
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] leading-relaxed text-[#8c919d]">
                  {t('settings.pinResetDescription')}
                </p>
                <button
                  type="button"
                  onClick={handleRequestPinReset}
                  className="w-full rounded-2xl border border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 py-2.5 text-[12.5px] font-semibold text-[var(--nova-accent-color)] transition hover:bg-[var(--nova-accent-color)]/20 mt-2"
                >
                  {t('settings.pinResetRequest')}
                </button>
              </>
            )}
          </div>
        )}

        {recoveryError && (
          <p role="alert" className="text-center text-[11px] text-red-400">
            {recoveryError}
          </p>
        )}

        <div className="w-full border-t border-white/[0.07] pt-3 space-y-2">
          <p className="text-[10.5px] leading-relaxed text-white/35">{t('settings.clearAllDataDesc')}</p>
          {confirmReset ? (
            <button
              type="button"
              onClick={() => void resetAccount()}
              disabled={recoveryBusy}
              className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 py-2.5 text-[12px] font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-40"
            >
              {t('common.recoverResetConfirm')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 text-[12px] font-semibold text-white/50 transition hover:text-red-300"
            >
              {t('settings.clearAllData')}
            </button>
          )}
        </div>
      </div>
    );
  };

  const finishRecovery = () => {
    if (onRecovered) {
      onRecovered();
      return;
    }
    window.location.reload();
  };

  useEffect(() => {
    if (pinLockoutUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= pinLockoutUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pinLockoutUntil]);

  const submitPin = async (value: string) => {
    if (value.length < dots || isLockedOut || isVerifying) return;
    setIsVerifying(true);
    setError(null);
    try {
      if (await verifyPin(value)) {
        setPinInput('');
        onUnlock();
      } else {
        setPinInput('');
        setError(t('common.passcodeError'));
        if (biometricEnabled) setBiometricHintActive(true);
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

  const handleDigit = (digit: string) => {
    setError(null);
    if (isLockedOut || isVerifying || pin.length >= dots) return;
    const next = pin + digit;
    setPinInput(next);
    // Unlock as soon as the expected number of digits is entered; the explicit
    // button stays for accessibility and for PIN lengths that change over time.
    if (next.length === dots) void submitPin(next);
  };

  const handleBackspace = () => {
    setError(null);
    if (!isLockedOut && !isVerifying) setPinInput(pin.slice(0, -1));
  };

  const handleUnlock = async () => {
    await submitPin(pin);
  };

  const handleBiometric = async () => {
    if (!unlockWithBiometric || isBiometricBusy || isLockedOut) return;
    setIsBiometricBusy(true);
    setError(null);
    setBiometricHintActive(false);
    try {
      const ok = await unlockWithBiometric();
      if (ok) {
        onUnlock();
      } else {
        setError(t('common.biometricFailed'));
        setBiometricHintActive(true);
      }
    } finally {
      setIsBiometricBusy(false);
    }
  };

  const handleRequestPinReset = () => {
    const allowedAt = requestPinReset();
    setPinResetRequested(true);
    setPinResetAllowedAt(allowedAt);
    setShowRecovery(true);
    setRecoveryKind('phrase');
  };

  const handlePerformPinReset = async () => {
    if (!isPinResetAllowed()) {
      setRecoveryError(t('settings.pinResetNotAllowed'));
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await performPinReset();
      finishRecovery();
    } catch (e) {
      setRecoveryError(e instanceof Error ? e.message : t('settings.pinResetFailed'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const recoverWithPhrase = async () => {
    if (!recoveryPhrase.trim()) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await recoverAccessWithMnemonic(recoveryPhrase.trim().toLowerCase().replace(/\s+/g, ' '));
      finishRecovery();
    } catch (recoveryFailure) {
      setRecoveryError(
        recoveryFailure instanceof Error ? recoveryFailure.message : t('onboarding.restoreFailed'),
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  const recoverWithBackup = async () => {
    if (!recoveryFile) return;
    if (recoveryPassphrase.length < 8) {
      setRecoveryError(t('settings.passphraseTooShort'));
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await recoverAccessWithBackup(await recoveryFile.text(), recoveryPassphrase);
      finishRecovery();
    } catch (recoveryFailure) {
      setRecoveryError(
        recoveryFailure instanceof Error ? recoveryFailure.message : t('onboarding.restoreFailed'),
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  const resetAccount = async () => {
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await resetLocalAccount();
      finishRecovery();
    } catch (resetFailure) {
      setRecoveryError(
        resetFailure instanceof Error ? resetFailure.message : t('onboarding.restoreFailed'),
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  const digits = '123456789'.split('');

  const numpadButton =
    'w-full h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl font-light tracking-wide text-white hover:bg-white/[0.09] transition active:scale-95 disabled:opacity-35 disabled:pointer-events-none';
  const textInput =
    'w-full bg-[#171821] border border-white/10 focus:border-[var(--nova-accent-color)] rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition';

return (
    <div className="fixed inset-0 z-50 bg-[#0b0c10] flex flex-col items-center justify-center overflow-y-auto no-scrollbar p-6 text-white backdrop-blur-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[var(--nova-accent-color)]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 translate-x-1/3 translate-y-1/3 rounded-full bg-[var(--nova-accent-color)]/10 blur-3xl"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-white/[0.07] bg-[#111218]/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
        {showRecovery ? renderRecoveryUI() : renderPinUI()}
      </div>

      <p className="relative mt-5 max-w-sm text-center text-[10.5px] leading-relaxed text-white/25">
        {t('settings.lockLocalNote')}
      </p>
    </div>
  );
};
