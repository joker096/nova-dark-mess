export type AppTheme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';

export const APP_THEME_KEY = 'nova_app_theme';
export const ACCENT_COLOR_KEY = 'nova_accent_color';
export const FONT_SIZE_KEY = 'nova_font_size';

export const ACCENT_COLORS: Record<'default' | 'sapphire' | 'amethyst' | 'emerald', string> = {
  default: '#ff4e18',
  sapphire: '#3B82F6',
  amethyst: '#8B5CF6',
  emerald: '#10B981',
};

const FONT_SIZE_PX: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
};

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isFontSize(value: unknown): value is FontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function readAppTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(APP_THEME_KEY);
    return isAppTheme(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function readFontSize(): FontSize {
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return isFontSize(saved) ? saved : 'medium';
  } catch {
    return 'medium';
  }
}

export function resolveTheme(theme: AppTheme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyAppTheme(theme: AppTheme): void {
  const effective = resolveTheme(theme);
  const root = document.documentElement;
  const body = document.body;
  root.setAttribute('data-theme', effective);
  if (effective === 'light') {
    body.className =
      'bg-[#f5f5f7] text-[#1a1a1a] antialiased selection:bg-[var(--nova-accent-color)]/30 selection:text-white';
  } else {
    body.className =
      'bg-[#0b0c10] text-[#f1f2f6] antialiased selection:bg-[var(--nova-accent-color)]/30 selection:text-white';
  }
}

export function applyFontSize(fontSize: FontSize): void {
  document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize];
}

export function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty('--nova-accent-color', color);
  try {
    localStorage.setItem(ACCENT_COLOR_KEY, color);
  } catch {
    void 0;
  }
}
