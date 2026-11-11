// Premium outgoing bubble themes (additive — default theme keeps the current design untouched)
export const PREMIUM_THEMES: Record<string, { label: string; grad: string; shadow: string; border: string }> = {
  default: { label: 'Default', grad: 'from-[var(--nova-accent-color, #ff521a)] to-[var(--nova-accent-color, #ff3b00)]', shadow: 'shadow-[var(--nova-accent-color, #ff4e18)]/25', border: 'border-[var(--nova-accent-color, #ff4e18)]/45' },
  sapphire: { label: 'Sapphire', grad: 'from-[#1E3A8A] to-[#3B82F6]', shadow: 'shadow-[#3B82F6]/25', border: 'border-[#3B82F6]/60' },
  amethyst: { label: 'Amethyst', grad: 'from-[#4C1D95] to-[#8B5CF6]', shadow: 'shadow-[#8B5CF6]/25', border: 'border-[#8B5CF6]/60' },
  emerald: { label: 'Emerald', grad: 'from-[#064E3B] to-[#10B981]', shadow: 'shadow-[#10B981]/25', border: 'border-[#10B981]/60' },
};

export const CHAT_THEME_KEY = 'nova_chat_theme';

export type ChatTheme = 'default' | 'sapphire' | 'amethyst' | 'emerald';

export const CHAT_THEME_ORDER: ChatTheme[] = ['default', 'sapphire', 'amethyst', 'emerald'];
