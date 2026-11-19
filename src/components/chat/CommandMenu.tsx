import React, { useRef, useEffect } from 'react';
import type { BotCommand } from '../../lib/bots/types';
import { NovaButton } from '../../lib/ui';
import { useLanguage } from '../../context/LanguageContext';

interface CommandMenuProps {
  /** Commands advertised by the bot in this chat. */
  commands: BotCommand[];
  /** Whether the menu is currently open. */
  isOpen: boolean;
  /** Fires when the user picks a command; payload is the command without the leading '/'. */
  onSelect: (command: string) => void;
  onClose: () => void;
}

/**
 * Slash-command menu for bots. Opens when the user types `/` in the composer
 * and lists every `bot.command` from the manifest. Picking one inserts the
 * command into the input so the user can review it before sending.
 *
 * One source of truth for the command list — no duplicated `BotCommandList`
 * anywhere else (see docs/bots-roadmap.md §B2).
 */
export const CommandMenu: React.FC<CommandMenuProps> = ({
  commands,
  isOpen,
  onSelect,
  onClose,
}) => {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const node = menuRef.current;
    if (!node) return;
    // Focus the first command for keyboard navigation.
    const first = node.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [isOpen]);

  if (!isOpen || commands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('bot.commandMenu', { defaultValue: 'Bot commands' })}
      className="z-50 w-[260px] bg-[#171825]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-90 duration-150"
    >
      {commands.map((cmd) => (
        <button
          key={cmd.command}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect(cmd.command);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/90 rounded-xl border border-transparent hover:bg-white/10 hover:border-white/10 transition cursor-pointer active:scale-95"
        >
          <span className="shrink-0 text-[var(--nova-accent-color, #ff4e18)] font-mono text-xs">{`/${cmd.command}`}</span>
          <span className="flex-1 truncate text-xs text-white/70">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
};
