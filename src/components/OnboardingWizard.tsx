import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Globe,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { normalizeNickname } from '../lib/account/account';
import { completeOnboarding, type OnboardingPath } from '../lib/onboarding';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { copyTextToClipboard, saveTextFile, type TextSaveOutcome } from '../lib/ui/download';

interface OnboardingWizardProps {
  onDone: () => void;
}

type Step =
  | 'welcome'
  | 'language'
  | 'choice'
  | 'nickname'
  | 'phrase'
  | 'phraseCheck'
  | 'restoreBackup'
  | 'security'
  | 'backup'
  | 'done';

type RestoreMethod = 'phrase' | 'backup';

interface PhraseQuestion {
  index: number;
  correct: string;
  options: string[];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds a short "pick the word at position N" check so a user cannot move on
 * before the recovery phrase is actually written down. Positions are spread
 * across the phrase so the start and the end are both checked.
 */
function buildPhraseQuiz(mnemonic: string | undefined): PhraseQuestion[] {
  const words = (mnemonic ?? '').split(' ').filter(Boolean);
  if (words.length < 4) return [];
  const unique = Array.from(new Set(words));
  const picked: number[] = [];
  while (picked.length < Math.min(3, words.length)) {
    const index = Math.floor(Math.random() * words.length);
    if (!picked.includes(index)) picked.push(index);
  }
  return picked.map((index) => {
    const correct = words[index];
    const decoys = shuffle(unique.filter((word) => word !== correct)).slice(0, 3);
    return { index, correct, options: shuffle([correct, ...decoys]) };
  });
}

/**
 * First-launch setup. Two clearly separated paths:
 *  - create: nickname → recovery phrase → phrase check → PIN → backup;
 *  - restore: phrase or backup file → nickname → PIN.
 * Every optional step can be skipped and the PIN is never mandatory.
 */
export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onDone }) => {
  const { t, language, changeLanguage, languages } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  const {
    identity,
    restoreIdentityFromMnemonic,
    setPin,
    setPinLength,
    exportEncryptedBackup,
    importEncryptedBackup,
  } = useSecurity();
  const { account, updateAccount } = useAccount();

  const [step, setStep] = useState<Step>('welcome');
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [restoreMethod, setRestoreMethod] = useState<RestoreMethod>('phrase');
  const [nickname, setNickname] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const [pin, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
  const [backupCreated, setBackupCreated] = useState(false);
  const [error, setError] = useState('');
  const [afterNickname, setAfterNickname] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phraseSaveNotice, setPhraseSaveNotice] = useState<{
    outcome: TextSaveOutcome;
    copied: boolean;
  } | null>(null);
  const [quizRound, setQuizRound] = useState(0);

  const words = useMemo(
    () => (identity?.mnemonic ? identity.mnemonic.split(' ') : []),
    [identity],
  );
  const quiz = useMemo(() => buildPhraseQuiz(identity?.mnemonic), [identity?.mnemonic]);
  const normalizedNickname = useMemo(() => {
    try {
      return normalizeNickname(nickname);
    } catch {
      return '';
    }
  }, [nickname]);

  const currentLanguage = languages.find((item) => item.code === language);

  const sequence: Step[] =
    path === 'restore'
      ? [
          'choice',
          restoreMethod === 'backup' ? 'restoreBackup' : 'phrase',
          'nickname',
          'security',
          'done',
        ]
      : path === 'create'
        ? ['nickname', 'phrase', 'phraseCheck', 'security', 'backup', 'done']
        : [];
  const stepIndex = sequence.indexOf(step) + 1;
  const showProgress = sequence.length > 0 && stepIndex > 0;

  const goBack = () => {
    setError('');
    switch (step) {
      case 'language':
      case 'choice':
        setStep('welcome');
        break;
      case 'nickname':
        setStep(
          path === 'restore'
            ? restoreMethod === 'backup'
              ? 'restoreBackup'
              : 'choice'
            : 'welcome',
        );
        break;
      case 'phrase':
        setStep(path === 'restore' ? 'choice' : 'nickname');
        break;
      case 'phraseCheck':
        setStep('phrase');
        break;
      case 'restoreBackup':
        setStep('choice');
        break;
      case 'security':
        setStep(path === 'restore' ? 'nickname' : 'phraseCheck');
        break;
      case 'backup':
        setStep('security');
        break;
      default:
        break;
    }
  };

  const startCreate = () => {
    setPath('create');
    setRestoreMethod('phrase');
    setError('');
    setStep('nickname');
  };

  const startRestore = () => {
    setPath('restore');
    setError('');
    setStep('choice');
  };

  const askForNickname = (option: RestoreMethod) => {
    const saved = (account.nickname ?? '').replace(/^@+/, '').trim();
    setNickname(saved && saved.toLowerCase() !== 'nova' ? saved : '');
    setAfterNickname('security');
    setBackupCreated(option === 'backup');
    setStep('nickname');
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      // A restored identity can reach this screen without a nickname, so send the
      // user back to pick one instead of failing on save.
      if (!normalizedNickname) {
        setAfterNickname('done');
        setStep('nickname');
        return;
      }
      updateAccount({
        displayName: normalizedNickname.slice(1),
        nickname: normalizedNickname,
        phone: '',
      });
      if (pin) {
        try {
          await setPin(pin);
          setPinLength(pin.length === 6 ? 6 : 4);
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
      const phrase = phraseInput.trim().toLowerCase().replace(/\s+/g, ' ');
      await restoreIdentityFromMnemonic(phrase);
      setPath('restore');
      askForNickname('phrase');
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
      askForNickname('backup');
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
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoking right away can abort the download in some WebViews.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupPassphrase('');
      setBackupPassphraseConfirm('');
      setBackupCreated(true);
      setStep('done');
    } catch (e) {
      console.error('onboarding: backup export failed', e);
      setError(e instanceof Error ? e.message : t('premium.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const copyPhrase = async () => {
    if (!identity?.mnemonic) return;
    if (await copyTextToClipboard(identity.mnemonic)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setError(t('premium.errorGeneric'));
    }
  };

  const downloadPhrase = async () => {
    if (!identity?.mnemonic) return;
    const body = [
      'Nova Dark Messenger — recovery phrase',
      '',
      identity.mnemonic,
      '',
      'Anyone with these words can restore this account. Keep this file offline.',
    ].join('\n');
    // Copy first, while the click's user activation is still fresh; the picker
    // then consumes the same activation to open its save dialog. Only claim the
    // copy when it actually succeeded: some WebViews reject clipboard writes.
    const copied = await copyTextToClipboard(identity.mnemonic);
    if (copied) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
    const outcome = await saveTextFile('nova-recovery-phrase.txt', body);
    setPhraseSaveNotice({ outcome, copied });
    window.setTimeout(() => setPhraseSaveNotice(null), 12_000);
  };

  const phraseSaveMessage = (() => {
    if (!phraseSaveNotice) return '';
    const { outcome, copied } = phraseSaveNotice;
    const clipboardNote = copied
      ? language === 'ru'
        ? ' Фраза также скопирована в буфер обмена.'
        : ' The phrase is also copied to your clipboard.'
      : '';
    if (language === 'ru') {
      switch (outcome) {
        case 'saved':
          return `Файл сохранён.${clipboardNote}`;
        case 'shared':
          return `Открыто системное меню «Поделиться». Выберите «Файлы» или облако, чтобы сохранить фразу.${clipboardNote}`;
        case 'downloaded':
          return `Скачивание запрошено. Если файл не появился, нажмите «Скопировать фразу» выше — слова также показаны на экране.${clipboardNote}`;
        case 'cancelled':
          return `Сохранение отменено. Фраза осталась на экране — скопируйте её кнопкой выше.${clipboardNote}`;
        default:
          return `Не удалось сохранить файл. Скопируйте фразу кнопкой выше — она также показана на экране.${clipboardNote}`;
      }
    }
    switch (outcome) {
      case 'saved':
        return `File saved.${clipboardNote}`;
      case 'shared':
        return `The system share sheet is open. Choose Files or cloud storage to keep the phrase.${clipboardNote}`;
      case 'downloaded':
        return `Download requested. If no file appeared, use "Copy phrase" above — the words are also shown on screen.${clipboardNote}`;
      case 'cancelled':
        return `Save cancelled. The phrase is still on screen — copy it with the button above.${clipboardNote}`;
      default:
        return `Could not save the file. Copy the phrase with the button above — the words are also shown on screen.${clipboardNote}`;
    }
  })();

  const answerPhraseQuestion = (answer: string) => {
    const question = quiz[quizRound];
    if (!question) return;
    if (answer !== question.correct) {
      setError(t('onboarding.phraseCheckWrong'));
      return;
    }
    setError('');
    if (quizRound + 1 < quiz.length) {
      setQuizRound(quizRound + 1);
      return;
    }
    setQuizRound(0);
    setStep('security');
  };

  const nextAfterSecurity = (): Step => (path === 'restore' ? 'done' : 'backup');

  const skipSecurity = () => {
    setPinValue('');
    setPinConfirm('');
    setError('');
    setStep(nextAfterSecurity());
  };

  const primaryBtn =
    // `text-[#ffffff]`, not `text-white`: the light theme remaps white text to
    // dark ink, which would disappear on this accent fill.
    'w-full py-3 rounded-2xl bg-[var(--nova-accent-color,#ff4e18)] hover:brightness-110 text-[#ffffff] text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer';
  const ghostBtn =
    'w-full py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/75 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2';
  const inputCls =
    'w-full bg-[#171821] border border-white/10 focus:border-[var(--nova-accent-color,#ff4e18)] rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition';
  const optionCard =
    'w-full text-left p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 transition cursor-pointer flex gap-3 items-start';

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
        <div className="flex items-center gap-2 mb-6 min-h-8">
          {step !== 'welcome' && step !== 'language' && (
            <button
              type="button"
              onClick={goBack}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition cursor-pointer"
              aria-label={t('onboarding.back')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          {showProgress ? (
            <>
              <div className="flex-1 flex items-center gap-1.5" data-testid="onboarding-progress">
                {sequence.map((item, index) => (
                  <span
                    key={item}
                    className={`h-1 flex-1 rounded-full transition ${
                      index < stepIndex ? 'bg-[var(--nova-accent-color,#ff4e18)]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-white/40 font-mono">
                {t('onboarding.stepOf', { current: stepIndex, total: sequence.length })}
              </span>
            </>
          ) : (
            <div className="flex-1" />
          )}
          {step === 'welcome' && (
            <button
              type="button"
              onClick={() => setStep('language')}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:bg-white/[0.08]"
            >
              <Globe className="w-3.5 h-3.5" />
              {currentLanguage?.nativeName ?? language.toUpperCase()}
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center gap-4">
          {step === 'welcome' && (
            <div className="text-center space-y-5" data-testid="onboarding-welcome">
              <div className="mx-auto w-20 h-20 rounded-3xl bg-[var(--nova-accent-color,#ff4e18)]/15 border border-[var(--nova-accent-color,#ff4e18)]/40 flex items-center justify-center text-[var(--nova-accent-color,#ff4e18)]">
                <Sparkles className="w-9 h-9" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">{t('onboarding.welcomeTitle')}</h1>
                <p className="text-[13px] leading-relaxed text-white/65">{t('onboarding.welcomeBody')}</p>
              </div>
              <div className="space-y-2">
                <button type="button" className={primaryBtn} onClick={startCreate}>
                  <UserRound className="w-4 h-4" />
                  {t('onboarding.createOption')}
                </button>
                <button
                  type="button"
                  className="w-full py-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white/80 text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2"
                  onClick={startRestore}
                >
                  <KeyRound className="w-4 h-4" />
                  {t('onboarding.restoreOption')}
                </button>
              </div>
              <p className="text-[10.5px] leading-relaxed text-white/35">
                {t('settings.lockLocalNote')}
              </p>
            </div>
          )}

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
              <button type="button" className={primaryBtn} onClick={() => setStep('welcome')}>
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'choice' && (
            <div className="space-y-3" data-testid="onboarding-choice">
              <h2 className="text-lg font-bold">{t('onboarding.restoreOption')}</h2>
              <p className="text-[12px] leading-relaxed text-white/60">
                {t('onboarding.restoreOptionDesc')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRestoreMethod('phrase');
                  setError('');
                  setStep('phrase');
                }}
                className={optionCard}
              >
                <KeyRound className="w-5 h-5 mt-0.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {t('onboarding.restoreTitle')}
                  </span>
                  <span className="block text-[11.5px] text-white/55 mt-0.5">
                    {t('onboarding.restoreBody')}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestoreMethod('backup');
                  setBackupFile(null);
                  setBackupPassphrase('');
                  setError('');
                  setStep('restoreBackup');
                }}
                className={optionCard}
              >
                <Upload className="w-5 h-5 mt-0.5 text-[var(--nova-accent-color,#ff4e18)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {t('settings.importBackup')}
                  </span>
                  <span className="block text-[11.5px] text-white/55 mt-0.5">
                    {t('onboarding.restoreBackupBody')}
                  </span>
                </span>
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
                  const next = afterNickname ?? 'phrase';
                  setAfterNickname(null);
                  setError('');
                  setStep(next);
                }}
              >
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
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
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`${inputCls} font-mono text-[12.5px] resize-none`}
              />
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
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
                  setStep('nickname');
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
              <div className="flex gap-2">
                <button type="button" className={ghostBtn} onClick={copyPhrase}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('onboarding.copied') : t('onboarding.copyPhrase')}
                </button>
                <button type="button" className={ghostBtn} onClick={downloadPhrase}>
                  <Download className="w-3.5 h-3.5" />
                  {t('onboarding.downloadPhrase')}
                </button>
              </div>
              {phraseSaveMessage && (
                <p role="status" className="text-[10.5px] text-emerald-300/90 leading-relaxed">
                  {phraseSaveMessage}
                </p>
              )}
              <p className="text-[10.5px] text-amber-400/90 leading-relaxed">{t('onboarding.seedWarning')}</p>
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
              <button
                type="button"
                className={primaryBtn}
                onClick={() => {
                  setQuizRound(0);
                  setError('');
                  setStep('phraseCheck');
                }}
              >
                {t('onboarding.savedPhrase')}
              </button>
            </div>
          )}

          {step === 'phraseCheck' && (
            <div className="space-y-4" data-testid="onboarding-phrase-check" data-round={String(quizRound)}>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold">{t('onboarding.phraseCheckTitle')}</h2>
                <p className="text-[12px] leading-relaxed text-white/60">
                  {t('onboarding.phraseCheckPrompt', {
                    position: (quiz[quizRound]?.index ?? 0) + 1,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {quiz.map((question, index) => (
                  <span
                    key={question.index}
                    className={`h-1 flex-1 rounded-full transition ${
                      index < quizRound ? 'bg-[var(--nova-accent-color,#ff4e18)]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(quiz[quizRound]?.options ?? []).map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-testid="phrase-check-option"
                    onClick={() => answerPhraseQuestion(option)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12.5px] font-mono text-white/85 transition hover:bg-white/[0.08] active:scale-95"
                  >
                    {option}
                  </button>
                ))}
              </div>
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
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
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
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
                type="password"
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
                type="password"
                placeholder={t('onboarding.pinConfirmLabel')}
                aria-label={t('onboarding.pinConfirmLabel')}
                className={`${inputCls} font-mono tracking-[0.4em] text-center`}
              />
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || (!!pin && pin !== pinConfirm)}
                onClick={() => {
                  if (pin && pin !== pinConfirm) {
                    setError(t('onboarding.pinMismatch'));
                    return;
                  }
                  setError('');
                  setStep(nextAfterSecurity());
                }}
              >
                {t('onboarding.continue')}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" className={ghostBtn} onClick={skipSecurity}>
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
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
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
                  setError('');
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
              {!backupCreated && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-left space-y-2">
                  <p className="text-[11.5px] leading-relaxed text-amber-200/85">
                    {t('onboarding.backupReminder')}
                  </p>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-amber-400/30 bg-amber-400/10 py-2 text-[11.5px] font-semibold text-amber-200 transition hover:bg-amber-400/15"
                    onClick={() => {
                      setError('');
                      setStep('backup');
                    }}
                  >
                    {t('onboarding.backupNow')}
                  </button>
                </div>
              )}
              {error && (
                <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">
                  {error}
                </p>
              )}
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
