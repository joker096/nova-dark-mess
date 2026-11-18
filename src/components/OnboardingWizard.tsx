import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Download, KeyRound, ShieldCheck, Sparkles, Upload, UserRound } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { normalizeNickname } from '../lib/account/account';
import { completeOnboarding, type OnboardingPath } from '../lib/onboarding';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface OnboardingWizardProps {
  onDone: () => void;
}

type Step = 'language' | 'nickname' | 'welcome' | 'choice' | 'phrase' | 'restoreBackup' | 'security' | 'backup' | 'done';

const STEP_ORDER: Step[] = ['language', 'nickname', 'welcome', 'choice', 'phrase', 'restoreBackup', 'security', 'backup', 'done'];

/**
 * First-launch setup. Replaces the "Hello, Joseph" fallback: a new install has to
 * either create a local identity (and save its recovery phrase) or restore one.
 */
export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onDone }) => {
  const { t, language, changeLanguage, languages } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const { identity, restoreIdentityFromMnemonic, setPin, exportEncryptedBackup, importEncryptedBackup } = useSecurity();
  const { updateAccount } = useAccount();

  const [step, setStep] = useState<Step>('language');
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [nickname, setNickname] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const [pin, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
  const [error, setError] = useState('');
  const [afterNickname, setAfterNickname] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const words = useMemo(
    () => (identity?.mnemonic ? identity.mnemonic.split(' ') : []),
    [identity],
  );
  const normalizedNickname = useMemo(() => {
    try {
      return normalizeNickname(nickname);
    } catch {
      return '';
    }
  }, [nickname]);
  const stepIndex = STEP_ORDER.indexOf(step) + 1;

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      // A restored identity can reach this screen without a nickname, so send the
      // user back to pick one instead of failing on save.
      const accountNickname = normalizedNickname;
      if (!accountNickname) {
        setStep('nickname');
        setAfterNickname('done');
        return;
      }
      updateAccount({
        displayName: accountNickname.slice(1),
        nickname: accountNickname,
        phone: '',
      });
      if (pin) {
        try {
          await setPin(pin);
        } catch (e) {
          console.error('onboarding: setPin failed', e);
          setError(t('premium.errorGeneric'));
          return;
        }
      }
      completeOnboarding(path ?? 'create');
      onDone();
    } catch (e) {
      console.error('onboarding: finish failed', e);
      setError(e instanceof Error ? e.message : t('premium.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      await restoreIdentityFromMnemonic(phraseInput);
      setPath('restore');
      setStep('security');
    } catch {
      setError(t('onboarding.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const restoreFromBackupFile = async () => {
    if (!backupFile) {
      setError(t('onboarding.restoreFailed'));
      return;
    }
    if (backupPassphrase.length < 8) {
      setError(t('settings.passphraseTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await importEncryptedBackup(await backupFile.text(), backupPassphrase);
      setPath('restore');
      setBackupFile(null);
      setBackupPassphrase('');
      setStep('security');
    } catch (e) {
      console.error('onboarding: backup restore failed', e);
      setError(e instanceof Error ? e.message : t('onboarding.restoreFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveOnboardingBackup = async () => {
    if (backupPassphrase.length < 8) {
      setError(t('settings.passphraseTooShort'));
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirm) {
      setError(t('onboarding.backupPassphraseMismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await exportEncryptedBackup(backupPassphrase, []);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nova_backup_${new Date().toISOString().slice(0, 10)}.nova-backup`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupPassphrase('');
      setBackupPassphraseConfirm('');
      setStep('done');
    } catch (e) {
      console.error('onboarding: backup export failed', e);
      setError(e instanceof Error ? e.message : t('premium.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'restoreBackup') {
      setStep('choice');
    } else if (step === 'security') {
      setStep(path === 'restore' ? 'choice' : 'phrase');
    } else if (step === 'backup') {
      setStep('security');
    } else if (step === 'phrase' && path === 'restore') {
      setStep('choice');
    } else {
      setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1] ?? 'welcome');
    }
  };

  const copyPhrase = async () => {
    if (!identity?.mnemonic) return;
    try {
      await navigator.clipboard.writeText(identity.mnemonic);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('premium.errorGeneric'));
    }
  };

  const primaryBtn =
    // `text-[#ffffff]`, not `text-white`: the light theme remaps white text to
    // dark ink, which would disappear on this accent fill.
    'w-full py-3 rounded-2xl bg-[var(--nova-accent-color,#ff4e18)] hover:brightness-110 text-[#ffffff] text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer';
  const ghostBtn =
    'w-full py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/75 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2';
  const inputCls =
    'w-full bg-[#171821] border border-white/10 focus:border-[var(--nova-accent-color,#ff4e18)] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('app.name')}
      className="fixed inset-0 z-[100] bg-[#0b0c10] text-white flex flex-col overflow-y-auto no-scrollbar"
      data-testid="onboarding-wizard"
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col px-5 pt-6 pb-8">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {step !== 'welcome' && (
            <button
              type="button"
              onClick={goBack}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition cursor-pointer"
              aria-label={t('onboarding.back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 flex items-center gap-1.5" data-testid="onboarding-progress">
            {STEP_ORDER.map((item, index) => (
              <span
                key={item}
                className={`h-1 flex-1 rounded-full transition ${
                  index < stepIndex ? 'bg-[var(--nova-accent-color,#ff4e18)]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-white/40 font-mono">
            {t('onboarding.stepOf', { current: stepIndex, total: STEP_ORDER.length })}
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-4">
          {step === 'language' && (
            <div className="space-y-4" data-testid="onboarding-language">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">{t('onboarding.languageTitle')}</h1>
                <p className="text-[13px] leading-relaxed text-white/65">{t('onboarding.languageBody')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto no-scrollbar pr-1">
                {languages.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => changeLanguage(item.code)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition active:scale-95 ${
                      language === item.code
                        ? 'bg-[var(--nova-accent-color,#ff4e18)]/15 border-[var(--nova-accent-color,#ff4e18)]/60 text-white'
                        : 'bg-white/[0.04] border-white/10 text-white/80 hover:bg-white/[0.08]'
                    }`}
                    aria-pressed={language === item.code}
                  >
                    <span className="text-lg leading-none">{item.flag}</span>
                    <span className="text-[13px] font-medium truncate">{item.nativeName}</span>
                  </button>
                ))}
              </div>
              <button type="button" className={primaryBtn} onClick={() => setStep('nickname')}>
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'nickname' && (
            <div className="space-y-4" data-testid="onboarding-nickname">
              <h2 className="text-lg font-bold">{t('onboarding.nameLabel')}</h2>
              <input
                autoFocus
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder={t('onboarding.namePlaceholder')}
                className={inputCls}
                maxLength={32}
                aria-label={t('onboarding.nameLabel')}
              />
              <p className="text-[11px] text-white/50">{t('onboarding.nicknameHint')}</p>
              <button
                type="button"
                className={primaryBtn}
                disabled={!normalizedNickname}
                onClick={() => {
                  const next = afterNickname ?? 'welcome';
                  setAfterNickname(null);
                  setStep(next);
                }}
              >
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'welcome' && (
            <div className="text-center space-y-4" data-testid="onboarding-welcome">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)]">
                <Sparkles className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{t('onboarding.welcomeTitle')}</h1>
              <p className="text-[13px] leading-relaxed text-white/65">{t('onboarding.welcomeBody')}</p>
              <button type="button" className={primaryBtn} onClick={() => setStep('choice')}>
                {t('onboarding.getStarted')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'choice' && (
            <div className="space-y-3" data-testid="onboarding-choice">
              <h2 className="text-lg font-bold">{t('onboarding.welcomeTitle')}</h2>
              <button
                type="button"
                onClick={() => {
                  setPath('create');
                  setError('');
                  setStep('phrase');
                }}
                className="w-full text-left p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 transition cursor-pointer flex gap-3 items-start"
              >
                <UserRound className="w-5 h-5 mt-0.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t('onboarding.createOption')}</span>
                  <span className="block text-[11.5px] text-white/55 mt-0.5">{t('onboarding.createOptionDesc')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPath('restore');
                  setError('');
                  setStep('phrase');
                }}
                className="w-full text-left p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 transition cursor-pointer flex gap-3 items-start"
              >
                <KeyRound className="w-5 h-5 mt-0.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t('onboarding.restoreOption')}</span>
                  <span className="block text-[11.5px] text-white/55 mt-0.5">{t('onboarding.restoreOptionDesc')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPath('restore');
                  setBackupFile(null);
                  setBackupPassphrase('');
                  setError('');
                  setStep('restoreBackup');
                }}
                className="w-full text-left p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 transition cursor-pointer flex gap-3 items-start"
              >
                <Upload className="w-5 h-5 mt-0.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t('settings.importBackup')}</span>
                  <span className="block text-[11.5px] text-white/55 mt-0.5">{t('onboarding.restoreBackupBody')}</span>
                </span>
              </button>
            </div>
          )}

          {step === 'phrase' && path === 'restore' && (
            <div className="space-y-3" data-testid="onboarding-restore">
              <h2 className="text-lg font-bold">{t('onboarding.restoreTitle')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">{t('onboarding.restoreBody')}</p>
              <textarea
                value={phraseInput}
                onChange={(event) => {
                  setPhraseInput(event.target.value);
                  setError('');
                }}
                placeholder={t('onboarding.phrasePlaceholder')}
                aria-label={t('onboarding.phraseLabel')}
                rows={4}
                className={`${inputCls} font-mono text-[12.5px] resize-none`}
              />
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || !phraseInput.trim()}
                onClick={restore}
              >
                {t('onboarding.restoreAction')}
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  setPhraseInput('');
                  setError('');
                  setPath('create');
                  setStep('phrase');
                }}
              >
                {t('onboarding.createOption')}
              </button>
            </div>
          )}

          {step === 'phrase' && path !== 'restore' && (
            <div className="space-y-3" data-testid="onboarding-seed">
              <h2 className="text-lg font-bold">{t('onboarding.identityTitle')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">{t('onboarding.identityBody')}</p>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {words.map((word, index) => (
                  <span key={`${word}-${index}`} className="text-[11px] font-mono text-white/85">
                    <span className="text-white/30 mr-1">{index + 1}</span>
                    {word}
                  </span>
                ))}
              </div>
              <button type="button" className={ghostBtn} onClick={copyPhrase}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('onboarding.copied') : t('onboarding.copyPhrase')}
              </button>
              <p className="text-[10.5px] text-amber-400/90 leading-relaxed">{t('onboarding.seedWarning')}</p>
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button type="button" className={primaryBtn} onClick={() => setStep('security')}>
                {t('onboarding.savedPhrase')}
              </button>
            </div>
          )}

          {step === 'restoreBackup' && (
            <div className="space-y-3" data-testid="onboarding-restore-backup">
              <h2 className="text-lg font-bold">{t('settings.importBackup')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">{t('onboarding.restoreBackupBody')}</p>
              <label className="block text-[11px] font-medium text-white/70" htmlFor="onboarding-backup-file">
                {t('onboarding.backupFileLabel')}
              </label>
              <input
                id="onboarding-backup-file"
                type="file"
                accept=".nova-backup"
                aria-label={t('onboarding.backupFileLabel')}
                onChange={(event) => {
                  setBackupFile(event.target.files?.[0] ?? null);
                  setError('');
                }}
                className="w-full text-xs text-white/70 file:mr-3 file:rounded-xl file:border file:border-white/10 file:bg-white/[0.05] file:px-3 file:py-2 file:text-xs file:text-white/80"
              />
              <label className="block text-[11px] font-medium text-white/70" htmlFor="onboarding-restore-passphrase">
                {t('onboarding.backupPassphrase')}
              </label>
              <input
                id="onboarding-restore-passphrase"
                type="password"
                autoComplete="new-password"
                value={backupPassphrase}
                onChange={(event) => {
                  setBackupPassphrase(event.target.value);
                  setError('');
                }}
                className={inputCls}
              />
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || !backupFile || backupPassphrase.length < 8}
                onClick={restoreFromBackupFile}
              >
                {t('settings.importBackup')}
              </button>
            </div>
          )}

          {step === 'security' && (
            <div className="space-y-3" data-testid="onboarding-security">
              <h2 className="text-lg font-bold">{t('onboarding.securityTitle')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">{t('onboarding.securityBody')}</p>
              <input
                value={pin}
                onChange={(event) => {
                  setPinValue(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setError('');
                }}
                inputMode="numeric"
                placeholder={t('onboarding.pinLabel')}
                aria-label={t('onboarding.pinLabel')}
                className={`${inputCls} font-mono tracking-[0.4em] text-center`}
              />
              <input
                value={pinConfirm}
                onChange={(event) => {
                  setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setError('');
                }}
                inputMode="numeric"
                placeholder={t('onboarding.pinConfirmLabel')}
                aria-label={t('onboarding.pinConfirmLabel')}
                className={`${inputCls} font-mono tracking-[0.4em] text-center`}
              />
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || (!!pin && pin !== pinConfirm)}
                onClick={() => {
                  if (pin !== pinConfirm) {
                    setError(t('onboarding.pinMismatch'));
                    return;
                  }
                  setStep('backup');
                }}
              >
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  setPinValue('');
                  setPinConfirm('');
                  setError('');
                  setStep('backup');
                }}
              >
                {t('onboarding.skip')}
              </button>
            </div>
          )}

          {step === 'backup' && (
            <div className="space-y-3" data-testid="onboarding-backup">
              <h2 className="text-lg font-bold">{t('settings.exportBackup')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">{t('onboarding.backupSetupBody')}</p>
              <label className="block text-[11px] font-medium text-white/70" htmlFor="onboarding-backup-passphrase">
                {t('onboarding.backupPassphrase')}
              </label>
              <input
                id="onboarding-backup-passphrase"
                type="password"
                autoComplete="new-password"
                value={backupPassphrase}
                onChange={(event) => {
                  setBackupPassphrase(event.target.value);
                  setError('');
                }}
                className={inputCls}
              />
              <label className="block text-[11px] font-medium text-white/70" htmlFor="onboarding-backup-confirm">
                {t('onboarding.backupConfirmPassphrase')}
              </label>
              <input
                id="onboarding-backup-confirm"
                type="password"
                autoComplete="new-password"
                value={backupPassphraseConfirm}
                onChange={(event) => {
                  setBackupPassphraseConfirm(event.target.value);
                  setError('');
                }}
                className={inputCls}
              />
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || backupPassphrase.length < 8}
                onClick={saveOnboardingBackup}
              >
                <Download className="w-4 h-4" />
                {t('settings.exportBackup')}
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  setBackupPassphrase('');
                  setBackupPassphraseConfirm('');
                  setStep('done');
                }}
              >
                {t('onboarding.skip')}
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4" data-testid="onboarding-done">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold">{t('onboarding.doneTitle')}</h2>
              <p className="text-[12.5px] leading-relaxed text-white/60">{t('onboarding.doneBody')}</p>
              {identity?.fingerprint && (
                <p className="text-[10.5px] font-mono text-white/40 break-all">{identity.fingerprint}</p>
              )}
              {error && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{error}</p>}
              <button type="button" className={primaryBtn} disabled={busy} onClick={finish}>
                {t('onboarding.startMessaging')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
