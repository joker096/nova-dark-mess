import type { ReactNode } from 'react';
import { formatCount } from './formatCount';

export interface NovaBadgeProps {
  /** Numeric badge value; strings for labels like "New". */
  value?: number | string;
  /** Caps numeric values (`99` → `99+`). */
  max?: number;
  variant?: 'accent' | 'neutral' | 'danger';
  /** Hides the badge when the value is zero/empty. */
  hideZero?: boolean;
  className?: string;
  children?: ReactNode;
}

const VARIANTS: Record<NonNullable<NovaBadgeProps['variant']>, string> = {
  accent: 'bg-[var(--nova-accent-color)] text-white',
  neutral: 'bg-white/[0.12] text-white/80',
  danger: 'bg-red-500 text-white',
};

/** Small numeric/label pill used by nav rails, chat rows and channel lists. */
export function NovaBadge({
  value,
  max,
  variant = 'accent',
  hideZero = true,
  className = '',
  children,
}: NovaBadgeProps) {
  const isNumber = typeof value === 'number';
  const text = isNumber ? formatCount(value, { max }) : value;
  if (hideZero && (value === 0 || text === '' || text === undefined)) return null;

  return (
    <span
      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none ${VARIANTS[variant]} ${className}`}
    >
      {children ?? text}
    </span>
  );
}
