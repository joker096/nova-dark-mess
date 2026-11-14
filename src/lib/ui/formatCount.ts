/**
 * Compact counter formatting shared by every badge in the app.
 *
 * One format everywhere keeps the rail, chat rows and channel posts from
 * showing "1,200" in one place and "1.2K" in another.
 */

const UNITS = [
  { limit: 1_000_000_000, suffix: 'B' },
  { limit: 1_000_000, suffix: 'M' },
  { limit: 1_000, suffix: 'K' },
] as const;

export interface FormatCountOptions {
  /** Values above this are rendered as `max+` (default: no cap). */
  max?: number;
  /** Locale used for the decimal separator, defaults to `en`. */
  locale?: string;
}

export function formatCount(value: number, options: FormatCountOptions = {}): string {
  const { max, locale = 'en' } = options;
  if (!Number.isFinite(value)) return '0';
  const count = Math.max(0, Math.trunc(value));
  if (max !== undefined && count > max) return `${max}+`;
  if (count < 1000) return String(count);

  const unit = UNITS.find((candidate) => count >= candidate.limit)!;
  const scaled = count / unit.limit;
  // 1.2K / 12K / 120K — one decimal only while it adds information.
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: rounded < 100 ? 1 : 0,
  }).format(rounded);
  return `${formatted}${unit.suffix}`;
}
