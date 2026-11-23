import React, { useMemo } from 'react';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import { LazyMedia } from './LazyMedia';
import { ChatMessage, ContactProfile } from '../types/messenger';
import { CONVERSATION_HISTORIES } from '../data/mockMessengerData';
import { CONTACT_PROFILES } from '../data/mockMessengerData';
import { useLanguage } from '../context/LanguageContext';
import { NovaIconButton } from '../lib/ui';

interface ThreadSidebarProps {
  threadRootId: string | null;
  chatId: string;
  onClose: () => void;
  onScrollToMessage: (msgId: string) => void;
  profile?: ContactProfile;
  isOwnProfile?: boolean;
  accountDisplayName?: string;
  accountAvatar?: string;
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threadRootId,
  chatId,
  onClose,
  onScrollToMessage,
  profile,
  isOwnProfile,
  accountDisplayName,
  accountAvatar,
}) => {
  const { t } = useLanguage();

  const threadMessages = useMemo(() => {
    if (!threadRootId) return [];
    
    const threadMsgs = CONVERSATION_HISTORIES[chatId]?.filter((m) => 
      m.replyTo?.id === threadRootId || m.id === threadRootId
    ) ?? [];
    
    // Sort by createdAt
    return threadMsgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [threadRootId, chatId]);

  const rootMessage = useMemo(() => {
    if (!threadRootId) return null;
    return CONVERSATION_HISTORIES[chatId]?.find((m) => m.id === threadRootId) ?? null;
  }, [threadRootId, chatId]);

  // Helper to get sender display name and avatar
  const getSenderInfo = (msg: ChatMessage) => {
    const explicitAvatar = msg.avatar;
    if (msg.senderId === 'me') {
      return {
        name: t('chat.you'),
        avatar: accountAvatar || '',
        initials: accountDisplayName?.slice(0, 2).toUpperCase() || 'ME',
      };
    }
    // Use the passed profile or fall back to CONTACT_PROFILES
    const contactProfile = profile || CONTACT_PROFILES[chatId];
    if (contactProfile) {
      return {
        name: msg.senderName || contactProfile.name,
        avatar: explicitAvatar || contactProfile.avatar || '',
        initials: (msg.senderName || contactProfile.name).slice(0, 2).toUpperCase(),
      };
    }
    if (msg.senderName) {
      return {
        name: msg.senderName,
        avatar: explicitAvatar || '',
        initials: msg.senderName.slice(0, 2).toUpperCase(),
      };
    }
    return {
      name: 'Unknown',
      avatar: '',
      initials: '??',
    };
  };

  const getMessageContent = (msg: ChatMessage) => {
    if (msg.text) return msg.text;
    if (msg.voiceNote) return t('chat.voiceMessage');
    if (msg.images && msg.images.length > 0) return t('chat.photo');
    if (msg.document) return t('chat.file');
    if (msg.file) return msg.file.name || t('chat.file');
    if (msg.poll) return t('chat.poll');
    if (msg.location) return t('chat.location');
    if (msg.sticker) return t('chat.sticker');
    return '';
  };

  if (!threadRootId) return null;

  const renderThreadMessages = () => {
    if (threadMessages.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <div className="space-y-2">
            <MessageSquare className="w-10 h-10 text-[#8c919d] mx-auto" />
            <p className="text-sm font-medium text-[#8c919d]">{t('chat.noThreadMessages')}</p>
            <p className="text-xs text-[#636875]">{t('chat.noThreadMessagesDesc')}</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {threadMessages.map((msg) => {
          const isRoot = msg.id === threadRootId;
          const senderInfo = getSenderInfo(msg);
          return (
            <div
              key={msg.id}
              id={`thread-msg-${msg.id}`}
              className={`group relative border rounded-[22px] p-3.5 transition-all duration-150 cursor-pointer flex items-start gap-3.5 ${
                isRoot
                  ? 'bg-[var(--nova-accent-color)]/10 border-[var(--nova-accent-color)]/30 ring-1 ring-[var(--nova-accent-color)]/20'
                  : 'bg-[var(--nova-surface-high)]/90 hover:bg-[var(--nova-surface-raised)] border-[var(--nova-border-color)]/20'
              }`}
              onClick={() => onScrollToMessage(msg.id)}
              role="button"
              tabIndex={0}
              aria-label={`Thread message from ${senderInfo.name}`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border-strong)] bg-[var(--bg-surface-2)]">
                  {msg.senderId === 'me' ? (
                    <div className="w-full h-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white text-xs font-bold">You</div>
                  ) : senderInfo.avatar ? (
                    <LazyMedia src={senderInfo.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)]">
                      {senderInfo.initials}
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-[var(--nova-text-primary)] text-sm truncate">
                    {senderInfo.name}
                  </span>
                  <span className="text-[10px] text-[var(--nova-text-secondary)] shrink-0">{msg.time}</span>
                </div>

                <p className="text-[13px] text-[var(--nova-text-secondary)] leading-snug line-clamp-2">
                  {getMessageContent(msg)}
                </p>

                {msg.replyTo && (
                  <div className="mt-1.5 pt-1.5 border-t border-[var(--nova-border-color)] text-[11px] text-[var(--nova-text-secondary)]">
                    Replying to {msg.replyTo.senderName || 'Unknown'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <aside className="fixed md:relative right-0 top-0 h-full w-[360px] md:w-[360px] bg-[var(--nova-canvas)] border-l border-[var(--nova-border-color)] z-40 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b border-[var(--nova-border-color)] shrink-0">
        <div className="flex items-center gap-2">
          <NovaIconButton
            label={t('common.back')}
            icon={<ChevronLeft />}
            size={36}
            variant="subtle"
            className="border-[var(--nova-border-color)] bg-[var(--nova-surface-raised)]/80"
            onClick={onClose}
          />
          <MessageSquare className="w-5 h-5 text-[var(--nova-accent-color)]" />
          <h2 className="font-semibold text-[15px] text-[var(--nova-text-primary)] truncate">{t('chat.thread')}</h2>
        </div>
        <span className="text-[11px] text-[#8c919d]">{threadMessages.length} {t('chat.messages')}</span>
      </header>

      {/* Root Message Preview */}
      {rootMessage && (
        <div className="p-3 border-b border-[var(--nova-border-color)] bg-[var(--nova-canvas)]/50 shrink-0">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--nova-border-color)] bg-[var(--nova-surface-high)] shrink-0 mt-0.5">
              {rootMessage.senderId === 'me' ? (
                <div className="w-full h-full bg-[var(--nova-accent-color)] flex items-center justify-center text-white text-xs font-bold">You</div>
              ) : (() => {
                const senderInfo = getSenderInfo(rootMessage);
                return senderInfo.avatar ? (
                  <LazyMedia src={senderInfo.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)]">
                    {senderInfo.initials}
                  </div>
                );
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[var(--nova-text-primary)] text-sm truncate">
                  {(() => {
                    const senderInfo = getSenderInfo(rootMessage);
                    return senderInfo.name;
                  })()}
                </span>
                <span className="text-[10px] text-[var(--nova-text-secondary)] shrink-0">{rootMessage.time}</span>
              </div>
              <p className="text-[13px] text-[var(--nova-text-secondary)] leading-snug line-clamp-2 mt-1">
                {getMessageContent(rootMessage)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Thread Messages List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" role="log" aria-label={t('chat.threadMessages')}>
        {renderThreadMessages()}
      </div>
    </aside>
  );
};

export default ThreadSidebar;