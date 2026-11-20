export type AppTheme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';

export const APP_THEME_KEY = 'nova_app_theme';
export const ACCENT_COLOR_KEY = 'nova_accent_color';
export const FONT_SIZE_KEY = 'nova_font_size';

export const ACCENT_COLORS: Record<'default' | 'sapphire' | 'amethyst' | 'emerald', string> = {
  default: '#ff4e18',
  sapphire: '#22d3ee',
  amethyst: '#f472b6',
  emerald: '#10B981',
};

const LIGHT_ACCENT_COLORS: Record<string, string> = {
  '#ff4e18': '#f9551c',
  '#22d3ee': '#0891b2',
  '#f472b6': '#db2777',
  '#10b981': '#059669',
};

/**
 * Accent used for text and icons (not for filled buttons). A saturated fill
 * that carries white text is too dark to read as an icon on the near-black
 * canvas, so the dark theme lifts it; the light theme reuses the deep tint.
 */
const DARK_ACCENT_TEXT_COLORS: Record<string, string> = {
  '#ff4e18': '#ff8a5c',
  '#22d3ee': '#67e8f9',
  '#f472b6': '#f9a8d4',
  '#10b981': '#4ade9f',
};

let selectedTheme: AppTheme = 'dark';
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
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  } catch {
    return 'dark';
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
  const key = color.toLowerCase();
  const resolvedColor = isLight ? LIGHT_ACCENT_COLORS[key] ?? color : color;
  const textColor = isLight
    ? LIGHT_ACCENT_COLORS[key] ?? color
    : DARK_ACCENT_TEXT_COLORS[key] ?? color;
  document.documentElement.style.setProperty('--nova-accent-color', resolvedColor);
  document.documentElement.style.setProperty('--nova-accent-text', textColor);
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
