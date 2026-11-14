import React, { useState } from 'react';
import { Plus, Trash2, HelpCircle, Check, BarChart2 } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { PollData, PollOption } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';

interface PollCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (poll: PollData) => void;
}

export const PollCreateModal: React.FC<PollCreateModalProps> = ({
  isOpen,
  onClose,
  onCreatePoll,
}) => {
  const { t } = useLanguage();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctOptionIdx, setCorrectOptionIdx] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setIsAnonymous(true);
    setAllowsMultiple(false);
    setIsQuiz(false);
    setCorrectOptionIdx(null);
    setExplanation('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
    if (correctOptionIdx === index) {
      setCorrectOptionIdx(null);
    } else if (correctOptionIdx !== null && correctOptionIdx > index) {
      setCorrectOptionIdx(correctOptionIdx - 1);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleToggleQuiz = (checked: boolean) => {
    setIsQuiz(checked);
    if (checked) {
      setAllowsMultiple(false);
      if (correctOptionIdx === null) setCorrectOptionIdx(0);
    }
  };

  const handleToggleMultiple = (checked: boolean) => {
    setAllowsMultiple(checked);
    if (checked) {
      setIsQuiz(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      setError(t('poll.errorQuestionRequired', 'Please enter a poll question'));
      return;
    }

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError(t('poll.errorOptionsRequired', 'Please provide at least 2 options'));
      return;
    }

    if (isQuiz && (correctOptionIdx === null || correctOptionIdx >= cleanOptions.length)) {
      setError(t('poll.errorSelectCorrectOption', 'Please choose the correct answer for the quiz'));
      return;
    }

    const pollOptions: PollOption[] = cleanOptions.map((text, idx) => ({
      id: `opt-${idx + 1}-${Date.now()}`,
      text,
      votes: 0,
      votedByMe: false,
    }));

    const correctOptionId =
      isQuiz && correctOptionIdx !== null ? pollOptions[correctOptionIdx]?.id : undefined;

    const pollData: PollData = {
      id: `poll-${Date.now()}`,
      question: cleanQuestion,
      options: pollOptions,
      totalVotes: 0,
      isAnonymous,
      allowsMultiple: !isQuiz && allowsMultiple,
      isQuiz,
      correctOptionId,
      explanation: isQuiz && explanation.trim() ? explanation.trim() : undefined,
    };

    onCreatePoll(pollData);
    handleClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('poll.createTitle', 'New Poll')}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-white"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Question Input */}
        <div>
          <label className="block text-xs font-semibold text-white/80 mb-1.5 uppercase tracking-wider">
            {t('poll.questionLabel', 'Question')}
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t('poll.questionPlaceholder', 'Ask a question...')}
            className="w-full bg-[#11121a] border border-white/10 focus:border-[var(--nova-accent-color,#ff4e18)] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none transition shadow-inner"
            maxLength={250}
            autoFocus
          />
        </div>

        {/* Poll Options */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-white/80 uppercase tracking-wider">
              {t('poll.optionsLabel', 'Poll options')}
            </label>
            <span className="text-[11px] text-white/40">{options.length}/10</span>
          </div>

          <div className="space-y-2">
            {options.map((option, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {isQuiz && (
                  <button
                    type="button"
                    onClick={() => setCorrectOptionIdx(idx)}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition cursor-pointer ${
                      correctOptionIdx === idx
                        ? 'border-emerald-400 bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                        : 'border-white/20 hover:border-emerald-400/60 bg-white/5'
                    }`}
                    title={t('poll.markCorrect', 'Mark as correct answer')}
                  >
                    {correctOptionIdx === idx && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                )}

                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    handleOptionChange(idx, e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={t('poll.optionPlaceholder', {
                    count: idx + 1,
                    defaultValue: `Option ${idx + 1}`,
                  })}
                  className="flex-1 bg-[#11121a] border border-white/10 focus:border-[var(--nova-accent-color,#ff4e18)] rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/30 focus:outline-none transition"
                  maxLength={100}
                />

                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    className="p-2 rounded-xl text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                    title={t('common.remove', 'Remove option')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < 10 && (
            <button
              type="button"
              onClick={handleAddOption}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--nova-accent-color,#ff4e18)] hover:underline pt-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('poll.addOption', 'Add an option')}</span>
            </button>
          )}
        </div>

        {/* Poll Settings / Toggles */}
        <div className="pt-2 border-t border-white/10 space-y-3">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider block">
            {t('poll.settings', 'Poll Settings')}
          </label>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div>
              <p className="text-xs font-semibold text-white">{t('poll.anonymousVoting', 'Anonymous Voting')}</p>
              <p className="text-[11px] text-white/50">{t('poll.anonymousDesc', 'Nobody sees who voted for what')}</p>
            </div>
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 accent-[var(--nova-accent-color,#ff4e18)] cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div>
              <p className="text-xs font-semibold text-white">{t('poll.multipleAnswers', 'Multiple Answers')}</p>
              <p className="text-[11px] text-white/50">{t('poll.multipleDesc', 'Users can select more than one choice')}</p>
            </div>
            <input
              type="checkbox"
              checked={allowsMultiple}
              disabled={isQuiz}
              onChange={(e) => handleToggleMultiple(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 accent-[var(--nova-accent-color,#ff4e18)] cursor-pointer disabled:opacity-30"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">{t('poll.quizMode', 'Quiz Mode')}</p>
                <p className="text-[11px] text-white/50">{t('poll.quizDesc', 'Poll has one correct answer and explanation')}</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isQuiz}
              onChange={(e) => handleToggleQuiz(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 accent-amber-500 cursor-pointer"
            />
          </div>

          {isQuiz && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5 animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-amber-300">
                {t('poll.explanationLabel', 'Explanation (optional)')}
              </label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={t('poll.explanationPlaceholder', 'Users will see this explanation after choosing an answer...')}
                rows={2}
                className="w-full bg-[#11121a] border border-amber-500/30 focus:border-amber-400 rounded-xl p-2.5 text-xs text-white placeholder-white/30 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition cursor-pointer active:scale-95"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            className="flex items-center px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--nova-accent-color,#ff4e18)] hover:brightness-110 text-white shadow-md transition cursor-pointer active:scale-95"
          >
            <BarChart2 className="w-4 h-4 mr-1.5" />
            {t('poll.createButton', 'Create Poll')}
          </button>
        </div>
      </form>
    </NovaModal>
  );
};
