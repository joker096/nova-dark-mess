import React from 'react';
import { Users, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export interface JoinRequestNoticeData {
  groupId: string;
  groupName: string;
  who: string;
}

interface JoinRequestNoticeProps {
  notice: JoinRequestNoticeData | null;
  onOpen: (groupId: string) => void;
  onDismiss: () => void;
}

/**
 * Overlay shown above any screen when a relayed join request reaches this
 * device while the group itself is closed.
 */
export const JoinRequestNotice: React.FC<JoinRequestNoticeProps> = ({
  notice,
  onOpen,
  onDismiss,
}) => {
  const { t } = useLanguage();
  if (!notice) return null;

  return (
    <div
      data-testid="join-request-notice"
      role="status"
      aria-live="polite"
      className="fixed top-3 inset-x-0 z-[70] flex justify-center px-3 pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-sm bg-[#151621]/95 border border-amber-400/40 backdrop-blur-md rounded-2xl shadow-2xl shadow-black/70 px-3.5 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white truncate">{notice.groupName}</p>
          <p className="text-[10.5px] text-[#a9aeba] truncate">
            {t('chats.joinRequestNotice', { who: notice.who })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(notice.groupId)}
          className="px-2.5 py-1 rounded-lg bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 text-[10px] font-semibold text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/30 transition cursor-pointer shrink-0"
        >
          {t('chats.joinRequestOpen')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.close')}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
