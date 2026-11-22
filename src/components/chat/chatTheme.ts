// Premium outgoing bubble themes (additive — default theme keeps the current design untouched)
export const PREMIUM_THEMES: Record<string, { label: string; grad: string; shadow: string; border: string }> = {
  default: { label: 'Default', grad: 'from-[var(--chat-theme-default-from)] to-[var(--chat-theme-default-to)]', shadow: 'shadow-[var(--chat-theme-default-to)]/25', border: 'border-[var(--chat-theme-default-to)]/45' },
  sapphire: { label: 'Sapphire', grad: 'from-[var(--chat-theme-sapphire-from)] to-[var(--chat-theme-sapphire-to)]', shadow: 'shadow-[var(--chat-theme-sapphire-to)]/25', border: 'border-[var(--chat-theme-sapphire-to)]/60' },
  amethyst: { label: 'Amethyst', grad: 'from-[var(--chat-theme-amethyst-from)] to-[var(--chat-theme-amethyst-to)]', shadow: 'shadow-[var(--chat-theme-amethyst-to)]/25', border: 'border-[var(--chat-theme-amethyst-to)]/60' },
  emerald: { label: 'Emerald', grad: 'from-[var(--chat-theme-emerald-from)] to-[var(--chat-theme-emerald-to)]', shadow: 'shadow-[var(--chat-theme-emerald-to)]/25', border: 'border-[var(--chat-theme-emerald-to)]/60' },
};

export const CHAT_THEME_KEY = 'nova_chat_theme';

export type ChatTheme = 'default' | 'sapphire' | 'amethyst' | 'emerald';

export const CHAT_THEME_ORDER: ChatTheme[] = ['default', 'sapphire', 'amethyst', 'emerald'];
