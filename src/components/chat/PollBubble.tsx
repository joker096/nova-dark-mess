import React from 'react';
import {
  IconBulb as Bulb,
  IconChartBar as ChartBar,
  IconCheck as Check,
  IconHelpCircle as HelpCircle,
  IconRotate as Rotate,
  IconX as X,
  IconChartBar as BarChart3,
  IconBulb as Lightbulb,
  IconRotate as RotateCcw,
  IconX as XIcon,
} from '@tabler/icons-react';
import { PollData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';

interface PollBubbleProps {
  poll: PollData;
  onVote?: (pollId: string, optionId: string) => void;
  onRetractVote?: (pollId: string) => void;
}

export const PollBubble: React.FC<PollBubbleProps> = ({
  poll,
  onVote,
  onRetractVote,
}) => {
  const { t } = useLanguage();

  const hasVoted = poll.options.some((o) => o.votedByMe);
  const totalVotes = Math.max(
    poll.totalVotes,
    poll.options.reduce((sum, o) => sum + o.votes, 0)
  );

  const handleOptionClick = (optionId: string) => {
    if (poll.closed) return;
    if (onVote) {
      onVote(poll.id, optionId);
    }
  };

  return (
    <div className="w-full min-w-[270px] max-w-md select-none">
      {/* Header Badges */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--nova-accent-color,#ff4e18)]">
          {poll.isQuiz ? (
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <BarChart3 className="w-3.5 h-3.5" />
          )}
          <span className="uppercase tracking-wider text-[10px]">
            {poll.isQuiz
              ? t('poll.quiz', 'Quiz')
              : poll.isAnonymous
              ? t('poll.anonymous', 'Anonymous Poll')
              : t('poll.public', 'Public Poll')}
          </span>
        </div>
        {poll.allowsMultiple && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
            {t('poll.multipleAnswers', 'Multiple answers')}
          </span>
        )}
      </div>

      {/* Question */}
      <h4 className="text-[14px] font-semibold text-white leading-snug mb-3">
        {poll.question}
      </h4>

      {/* Options List */}
      <div className="space-y-2 mb-3">
        {poll.options.map((option) => {
          const percentage =
            totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
          const isSelected = !!option.votedByMe;
          const isCorrect = poll.isQuiz && option.id === poll.correctOptionId;
          const isWrong = poll.isQuiz && hasVoted && isSelected && !isCorrect;

          let optionStyle = 'border-white/10 bg-white/5 hover:bg-white/10 text-white';
          let fillStyle = 'bg-white/15';

          if (hasVoted) {
            if (poll.isQuiz) {
              if (isCorrect) {
                optionStyle = 'border-emerald-500/60 bg-emerald-950/30 text-emerald-200';
                fillStyle = 'bg-emerald-500/25';
              } else if (isWrong) {
                optionStyle = 'border-rose-500/60 bg-rose-950/30 text-rose-200';
                fillStyle = 'bg-rose-500/25';
              } else {
                optionStyle = 'border-white/5 bg-white/[0.02] text-white/70';
                fillStyle = 'bg-white/10';
              }
            } else if (isSelected) {
              optionStyle =
                'border-[var(--nova-accent-color,#ff4e18)]/80 bg-[var(--nova-accent-color,#ff4e18)]/15 text-white ring-1 ring-[var(--nova-accent-color,#ff4e18)]/40';
              fillStyle = 'bg-[var(--nova-accent-color,#ff4e18)]/35';
            }
          }

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionClick(option.id)}
              disabled={poll.closed}
              className={`w-full relative overflow-hidden rounded-xl border p-2.5 transition text-left cursor-pointer active:scale-[0.99] group ${optionStyle}`}
            >
              {/* Progress Percentage Bar Fill */}
              {hasVoted && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-xl pointer-events-none ${fillStyle}`}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative z-10 flex items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Selector checkbox / radio / status icon */}
                  <div
                    className={`w-4 h-4 rounded-${
                      poll.allowsMultiple ? 'md' : 'full'
                    } border flex items-center justify-center shrink-0 transition ${
                      poll.isQuiz && hasVoted
                        ? isCorrect
                          ? 'border-emerald-400 bg-emerald-500 text-white'
                          : isWrong
                          ? 'border-rose-400 bg-rose-500 text-white'
                          : 'border-white/20'
                        : isSelected
                        ? 'border-[var(--nova-accent-color,#ff4e18)] bg-[var(--nova-accent-color,#ff4e18)] text-white'
                        : 'border-white/30 group-hover:border-white/60'
                    }`}
                  >
                    {isSelected && !poll.isQuiz && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    {poll.isQuiz && hasVoted && isCorrect && (
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    )}
                    {poll.isQuiz && hasVoted && isWrong && (
                      <XIcon className="w-2.5 h-2.5 stroke-[3]" />
                    )}
                  </div>

                  <span className="font-medium truncate text-white/95">{option.text}</span>
                </div>

                {/* Percentage & Vote Count */}
                {hasVoted && (
                  <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono">
                    <span className="text-white/60">{option.votes}</span>
                    <span className="font-bold text-white">{percentage}%</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Quiz explanation card */}
      {poll.isQuiz && hasVoted && poll.explanation && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>{t('poll.explanation', 'Explanation')}</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-amber-100/90">{poll.explanation}</p>
        </div>
      )}

      {/* Footer Details & Actions */}
      <div className="flex items-center justify-between text-[11px] text-white/60 pt-1">
        <span>
          {t('poll.votesCount', {
            count: totalVotes,
            defaultValue: `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`,
          })}
        </span>

        {hasVoted && onRetractVote && !poll.closed && !poll.isQuiz && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetractVote(poll.id);
            }}
            className="flex min-h-6 items-center gap-1 text-[var(--nova-accent-color,#ff4e18)] hover:underline cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('poll.retractVote', 'Retract vote')}</span>
          </button>
        )}
      </div>
    </div>
  );
};










