import { type HTMLAttributes, forwardRef } from 'react';

interface NovaDateSeparatorProps extends HTMLAttributes<HTMLDivElement> {
  date: Date | string | number;
  format?: 'short' | 'long' | 'relative';
  sticky?: boolean;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(date: Date, format: 'short' | 'long' | 'relative'): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (format === 'relative') {
    if (targetDate.getTime() === today.getTime()) return 'Today';
    if (targetDate.getTime() === yesterday.getTime()) return 'Yesterday';
  }

  if (format === 'short') {
    return `${MONTHS_SHORT[date.getMonth()]} ${getOrdinal(date.getDate())}`;
  }

  if (format === 'long') {
    return `${MONTHS_LONG[date.getMonth()]} ${getOrdinal(date.getDate())}, ${date.getFullYear()}`;
  }

  // Default: check if today/yesterday
  if (targetDate.getTime() === today.getTime()) return 'Today';
  if (targetDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return `${MONTHS_LONG[date.getMonth()]} ${getOrdinal(date.getDate())}`;
}

export const NovaDateSeparator = forwardRef<HTMLDivElement, NovaDateSeparatorProps>(
  ({ date, format = 'long', sticky = true, className, style, ...props }, ref) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const formatted = formatDate(dateObj, format);

    return (
      <div
        ref={ref}
        className={`flex items-center justify-center py-2 ${sticky ? 'sticky top-0 z-10' : ''} ${className ?? ''}`}
        style={style}
        {...props}
      >
        <span
          className="px-3 py-0.5 rounded-full text-[13px] font-medium text-[var(--text-secondary)] bg-[var(--bg-field)] backdrop-blur-sm"
          style={{
            boxShadow: sticky ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
          } as React.CSSProperties}
        >
          {formatted}
        </span>
      </div>
    );
  }
);

NovaDateSeparator.displayName = 'NovaDateSeparator';

export type { NovaDateSeparatorProps };