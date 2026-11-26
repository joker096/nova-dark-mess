import {
  createPortal } from 'react-dom';
import { useEffect,
  useRef,
  useState } from 'react';
import {IconX as X,
  IconMessageReply as Reply,
  IconShare2 as Share2,
  IconCopy as Copy,
  IconEdit as Edit,
  IconTrashX as Trash2,
  IconTrash as Trash,
  IconMessageForward as Forward,
  IconPin as Pin,
  IconFlag as Flag,
  IconTrash as TrashX,
} from '@tabler/icons-react';

interface ContextMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface NovaContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContextMenuItem[];
  anchorRef?: React.RefObject<HTMLElement>;
  position?: { x: number; y: number };
  triggerElement?: HTMLElement | null;
}

export function NovaContextMenu({
  isOpen,
  onClose,
  items,
  anchorRef,
  position,
  triggerElement,
}: NovaContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        if (triggerElement && triggerElement.contains(e.target as Node)) return;
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerElement]);

  useEffect(() => {
    if (!isOpen) return;

    let x = position?.x ?? 0;
    let y = position?.y ?? 0;

    if (anchorRef?.current && !position) {
      const rect = anchorRef.current.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 4;
    }

    // Ensure menu stays within viewport
    requestAnimationFrame(() => {
      if (!menuRef.current) return;
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + menuRect.width > viewportWidth - 8) {
        x = viewportWidth - menuRect.width - 8;
      }
      if (y + menuRect.height > viewportHeight - 8) {
        y = viewportHeight - menuRect.height - 8;
      }
      if (x < 8) x = 8;
      if (y < 8) y = 8;

      setMenuPosition({ x, y });
    });
  }, [isOpen, position, anchorRef]);

  if (!isOpen) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-[var(--bg-card)] border border-[var(--border-divider)] rounded-[var(--radius-card)] shadow-xl min-w-[180px] max-w-[280px] py-1 overflow-hidden animate-in fade-in-20 zoom-in-95 duration-150"
      style={{
        left: menuPosition.x,
        top: menuPosition.y,
      } as React.CSSProperties}
      role="menu"
      aria-orientation="vertical"
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          disabled={item.disabled}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${
            item.destructive
              ? 'text-[var(--c-danger)] hover:bg-[var(--c-danger)]/10'
              : 'text-[var(--text-primary)] hover:bg-[var(--bg-field)]'
          } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ outline: 'none' } as React.CSSProperties}
        >
          {item.icon && (
            <span className="w-5 h-5 flex items-center justify-center shrink-0" aria-hidden="true">
              {item.icon}
            </span>
          )}
          {!item.icon && <span className="w-5 shrink-0" />}
          <span className="flex-1 truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menuContent, document.body);
}

export const MessageContextMenuItems = (
  onReply: () => void,
  onForward: () => void,
  onEdit: () => void,
  onCopy: () => void,
  onDelete: () => void,
  onPin?: () => void,
  onReport?: () => void,
  isOwn: boolean = false,
  isPinned: boolean = false,
): ContextMenuItem[] => [
  {
    key: 'reply',
    label: 'Reply',
    icon: <Reply className="w-5 h-5" />,
    onClick: onReply,
  },
  {
    key: 'forward',
    label: 'Forward',
    icon: <Forward className="w-5 h-5" />,
    onClick: onForward,
  },
  isOwn && {
    key: 'edit',
    label: 'Edit',
    icon: <Edit className="w-5 h-5" />,
    onClick: onEdit,
  },
  {
    key: 'copy',
    label: 'Copy',
    icon: <Copy className="w-5 h-5" />,
    onClick: onCopy,
  },
  onPin && {
    key: 'pin',
    label: isPinned ? 'Unpin' : 'Pin',
    icon: <Pin className="w-5 h-5" />,
    onClick: onPin,
  },
  onReport && {
    key: 'report',
    label: 'Report',
    icon: <Flag className="w-5 h-5" />,
    onClick: onReport,
  },
  {
    key: 'delete',
    label: 'Delete',
    icon: <TrashX className="w-5 h-5" />,
    onClick: onDelete,
    destructive: true,
  },
].filter(Boolean) as ContextMenuItem[];

export type { ContextMenuItem, NovaContextMenuProps };



















