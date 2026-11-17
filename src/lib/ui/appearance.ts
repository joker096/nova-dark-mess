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

const LIGHT_ACCENT_COLORS: Record<string, string> = {
  '#ff4e18': '#c2410c',
  '#3b82f6': '#1d4ed8',
  '#8b5cf6': '#6d28d9',
  '#10b981': '#047857',
};

let selectedTheme: AppTheme = 'system';
let systemThemeQuery: MediaQueryList | null = null;

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
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function setAccentColorVariable(color: string): void {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const resolvedColor = isLight
    ? LIGHT_ACCENT_COLORS[color.toLowerCase()] ?? color
    : color;
  document.documentElement.style.setProperty('--nova-accent-color', resolvedColor);
}

export function applyAppTheme(theme: AppTheme): void {
  selectedTheme = theme;
  if (typeof window !== 'undefined' && !systemThemeQuery && window.matchMedia) {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)');
    systemThemeQuery.addEventListener('change', () => {
      if (selectedTheme === 'system') applyAppTheme('system');
    });
  }

  const effectiveTheme = resolveTheme(theme);
  const root = document.documentElement;
  const body = document.body;
  root.setAttribute('data-theme', effectiveTheme);
  root.style.colorScheme = effectiveTheme;
  body.className =
    'antialiased selection:bg-[var(--nova-accent-color)]/30 selection:text-white';
  body.style.backgroundColor = 'var(--nova-canvas)';
  body.style.color = 'var(--nova-text-primary)';
  try {
    setAccentColorVariable(
      localStorage.getItem(ACCENT_COLOR_KEY) ?? ACCENT_COLORS.default,
    );
  } catch {
    setAccentColorVariable(ACCENT_COLORS.default);
  }
}

export function applyFontSize(fontSize: FontSize): void {
  document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize];
}

export function applyAccentColor(color: string): void {
  setAccentColorVariable(color);
  try {
    localStorage.setItem(ACCENT_COLOR_KEY, color);
  } catch {
    void 0;
  }
}
