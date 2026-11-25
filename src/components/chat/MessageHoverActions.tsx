import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Reply, Forward, Pin, MoreHorizontal, Trash2, Pencil, Copy, CheckCheck, Flag, ShieldAlert } from 'lucide-react';
import { NovaIconButton, NovaMenu, NovaTooltip } from '../../lib/ui';
import { useLanguage } from '../../context/LanguageContext';

interface MessageHoverActionsProps {
  msg: {
    id: string;
    text?: string;
    isPinned?: boolean;
    replyTo?: { id: string };
  };
  isMine: boolean;
  onReply: () => void;
  onForward: () => void;
  onPin: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReaction: () => void;
  onBlock: () => void;
  hasThread: boolean;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onClose: () => void;
}

export const MessageHoverActions: React.FC<MessageHoverActionsProps> = ({
  msg,
  isMine,
  onReply,
  onForward,
  onPin,
  onCopy,
  onEdit,
  onDelete,
  onReaction,
  onBlock,
  hasThread,
  triggerRef,
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const triggerRect = triggerRef.current!.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width ?? 280;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const offset = 14;
      const triggerTop = triggerRect.top;
      const triggerLeft = isMine ? triggerRect.left : triggerRect.right;
      const triggerRight = isMine ? triggerRect.left + triggerRect.width : triggerRect.right;

      const left = isMine
        ? Math.max(8, triggerLeft - menuWidth - offset)
        : Math.min(viewportWidth - menuWidth - 8, triggerRight + offset);

      const menuHeight = menuRect?.height || 0;
      const openUpwards = triggerTop - menuHeight - 6 < 8;
      const top = openUpwards ? triggerRect.bottom + 6 : triggerRect.top - menuHeight - 6;

      setPosition({ top: Math.max(8, top), left });
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef, isMine]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  const items = [
    ...(msg.text
      ? [
          {
            key: 'copy',
            label: t('chat.messageActions.copy'),
            icon: <Copy className="w-4 h-4" />,
            shortcut: 'mod+c',
            onSelect: onCopy,
          },
        ]
      : []),
    ...(isMine && msg.text
      ? [
          {
            key: 'edit',
            label: t('chat.messageActions.edit'),
            icon: <Pencil className="w-4 h-4" />,
            onSelect: onEdit,
          },
        ]
      : []),
    ...(hasThread
      ? [
          {
            key: 'thread',
            label: t('chat.messageActions.thread'),
            icon: <Reply className="w-4 h-4" />,
            onSelect: () => {
              onClose();
            },
          },
        ]
      : []),
    ...(isMine
      ? [
          {
            key: 'delete',
            label: t('chat.messageActions.delete'),
            icon: <Trash2 className="w-4 h-4" />,
            danger: true,
            separatorBefore: true,
            onSelect: onDelete,
          },
        ]
      : [
          {
            key: 'block',
            label: t('chat.messageActions.block'),
            icon: <Flag className="w-4 h-4" />,
            danger: true,
            separatorBefore: true,
            onSelect: onBlock,
          },
          {
            key: 'report',
            label: t('chat.messageActions.report'),
            icon: <ShieldAlert className="w-4 h-4" />,
            danger: true,
            onSelect: () => {
              onClose();
              // TODO: Open report modal
            },
          },
        ]),
  ];

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('chat.messageActions.title')}
      className="fixed z-[80] bg-[var(--nova-surface)]/95 border border-[var(--nova-border-color)] backdrop-blur-xl rounded-2xl px-2 py-1.5 shadow-xl shadow-black/80 select-none animate-in fade-in-10 zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-1">
        <NovaTooltip label={t('a11y.addReaction')}>
          <NovaIconButton
            label={t('a11y.addReaction')}
            icon={<Heart className="fill-rose-400/50 w-5 h-5" />}
            size={36}
            className="text-rose-400 hover:bg-rose-500/25"
            onClick={(e) => {
              e.stopPropagation();
              onReaction();
            }}
          />
        </NovaTooltip>
        <NovaTooltip label={t('a11y.replyToMessage')}>
          <NovaIconButton
            label={t('a11y.replyToMessage')}
            icon={<Reply className="w-5 h-5" />}
            size={36}
            className="text-[var(--nova-accent-color,#ff4e18)]"
            onClick={(e) => {
              e.stopPropagation();
              onReply();
            }}
          />
        </NovaTooltip>
        <NovaTooltip label={t('a11y.forwardMessage')}>
          <NovaIconButton
            label={t('a11y.forwardMessage')}
            icon={<Forward className="w-5 h-5" />}
            size={36}
            className="text-[var(--nova-accent-color,#ff4e18)]"
            onClick={(e) => {
              e.stopPropagation();
              onForward();
            }}
          />
        </NovaTooltip>
        <NovaTooltip label={msg.isPinned ? t('chat.messageActions.unpin') : t('chat.messageActions.pin')}>
          <NovaIconButton
            label={msg.isPinned ? t('chat.messageActions.unpin') : t('chat.messageActions.pin')}
            icon={<Pin className="w-5 h-5" />}
            size={36}
            active={msg.isPinned}
            className="text-[var(--nova-accent-color,#ff4e18)]"
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
          />
        </NovaTooltip>
        <div className="w-[1px] h-5 bg-[var(--nova-overlay-medium)] mx-1" />
        <NovaMenu
          label={t('common.more')}
          trigger={
            <NovaIconButton
              label={t('common.more')}
              icon={<MoreHorizontal className="w-5 h-5" />}
              size={36}
              onClick={() => {}}
            />
          }
          items={items}
          align={isMine ? 'start' : 'end'}
        />
      </div>
    </div>,
    document.body,
  );
};