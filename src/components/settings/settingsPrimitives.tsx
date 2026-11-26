import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode} from 'react';
import { createPortal } from 'react-dom';
import {IconCheck as Check, IconInfoCircle as Info, IconX as X, IconSearch as Search, IconEye as Eye, IconEyeOff as EyeOff} from '@tabler/icons-react';
import { useFocusTrap } from '../../lib/ui/useFocusTrap';

/* --------------------------------------------------------------------------
 * Shared settings primitives.
 *
 * Rules for this file:
 *  - every interactive target is at least 44x44 CSS px;
 *  - state is never communicated by colour alone (ring + fill / check / strike);
 *  - only --nova-* design tokens are used, so light and dark themes both work;
 *  - labels are >= 12px so the user font-size setting actually affects them.
 * ------------------------------------------------------------------------ */

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-surface)]';

/* Layout constants */
const TILE_SIZE = 'min-w-[56px] min-h-[56px]';
const TILE_GAP = 'gap-2';

export interface IconControlProps {
  icon: ReactNode;
  /** Visible short label under the icon. */
  label: string;
  /** Current value, announced in the accessible name and optionally shown. */
  valueLabel?: string;
  /** Extra line under the label (usually the current value). */
  detail?: ReactNode;
  onClick?: () => void;
  onChange?: (value: boolean) => void;
  onLongPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  badge?: string | number | ReactNode;
  className?: string;
  /** Override the generated "label: value" accessible name. */
  ariaLabel?: string;
  testId?: string;
}

function useLongPress(onClick: () => void, onLongPress?: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(() => {
    fired.current = false;
    if (!onLongPress) return;
    clear();
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 520);
  }, [clear, onLongPress]);

  const activate = useCallback(() => {
    clear();
    if (!fired.current) onClick();
    fired.current = false;
  }, [clear, onClick]);

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: activate,
    onContextMenu: (event: React.MouseEvent) => {
      if (!onLongPress) return;
      event.preventDefault();
      onLongPress();
    },
  };
}

export const IconCycleButton: React.FC<IconControlProps> = ({
  icon,
  label,
  valueLabel,
  detail,
  onClick,
  onLongPress,
  selected = false,
  disabled = false,
  badge,
  className = '',
  ariaLabel,
  testId,
}) => {
  const handlers = useLongPress(onClick, onLongPress);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel ?? (valueLabel ? `${label}: ${valueLabel}` : label)}
      aria-pressed={selected}
      title={onLongPress ? `${label}${valueLabel ? `: ${valueLabel}` : ''}` : undefined}
      disabled={disabled}
      {...handlers}
      className={`relative ${TILE_SIZE} flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-1.5 transition duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} ${
        selected
          ? 'border-[var(--nova-accent-color)]/60 bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)]/30 ring-offset-2 ring-offset-[var(--nova-surface)]'
          : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-accent-color)]/30'
      } ${className}`}
    >
      <span className="[&>svg]:h-[20px] [&>svg]:w-[20px]" aria-hidden="true">
        {icon}
      </span>
      <span className="max-w-[72px] truncate text-[12px] font-medium leading-none">{label}</span>
      {detail && <span className="max-w-[72px] truncate text-[10px] leading-none opacity-80">{detail}</span>}
      {badge !== undefined && badge !== '' && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full border border-[var(--nova-surface)] bg-[var(--nova-accent-color)] px-1 text-center text-[10px] font-bold leading-[18px] text-[var(--nova-on-accent)]">
          {badge}
        </span>
      )}
    </button>
  );
};

export const IconToggle: React.FC<IconControlProps & { checked: boolean }> = ({
  icon,
  label,
  valueLabel,
  detail,
  checked,
  onClick,
  onChange,
  disabled,
  badge,
  className = '',
  ariaLabel,
  testId,
}) => {
  const on = checked;
  const handleClick = () => {
    if (onChange) onChange(!on);
    if (onClick) onClick();
  };
  return (
    <button
      type="button"
      data-testid={testId}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel ?? `${label}: ${valueLabel ?? (on ? 'on' : 'off')}`}
      onClick={handleClick}
      disabled={disabled}
      className={`relative ${TILE_SIZE} flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-1.5 transition duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} ${
        on
          ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)]/30 ring-offset-2 ring-offset-[var(--nova-surface)]'
          : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] hover:border-[var(--nova-accent-color)]/30'
      } ${className}`}
    >
      <span
        className={`[&>svg]:h-[20px] [&>svg]:w-[20px] ${on ? '' : 'opacity-70'}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="max-w-[72px] truncate text-[12px] font-medium leading-none">
        {label}
      </span>
      {detail && <span className="max-w-[72px] truncate text-[10px] leading-none opacity-80">{detail}</span>}
      {/* Toggle indicator */}
      <span className={`absolute right-2 top-2 w-5 h-3 rounded-full border-2 transition-colors ${
        on
          ? 'bg-[var(--nova-accent-color)] border-[var(--nova-accent-color)]'
          : 'bg-transparent border-[var(--nova-border-subtle)]'
      }`} aria-hidden="true">
        <span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white transition-transform ${
          on ? 'translate-x-2' : 'translate-x-0'
        }`} aria-hidden="true" />
      </span>
      {badge !== undefined && badge !== '' && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full border border-[var(--nova-surface)] bg-[var(--nova-accent-color)] px-1 text-center text-[10px] font-bold leading-[18px] text-[var(--nova-on-accent)]">
          {badge}
        </span>
      )}
    </button>
  );
};

export interface IconSegmentOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

export interface IconSegmentedProps<T extends string> {
  options: IconSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  testId?: string;
}

export function IconSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  testId,
}: IconSegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const move = (event: React.KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const enabled = options.filter((option) => !option.disabled);
    const current = Math.max(0, enabled.findIndex((option) => option.value === options[index].value));
    const next = enabled[(current + delta + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[options.indexOf(next)]?.focus();
    }
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`flex items-center justify-center gap-1.5 ${className}`}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`relative ${TILE_SIZE} flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-1.5 text-[12px] font-medium transition duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} ${
              active
                ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)]/30 ring-offset-2 ring-offset-[var(--nova-surface)]'
                : 'border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-secondary)] hover:border-[var(--nova-accent-color)]/30'
            }`}
          >
            <span className="[&>svg]:h-[20px] [&>svg]:w-[20px]" aria-hidden="true">{option.icon}</span>
            <span className="max-w-full truncate leading-none">{option.label}</span>
            {active && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--nova-accent-color)]" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export const SettingsTile: React.FC<{
  icon: ReactNode;
  label: string;
  description?: string;
  badge?: string | number | ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  tone?: 'default' | 'danger';
  className?: string;
}> = ({ icon, label, description, badge, onClick, disabled, testId, tone = 'default', className = '' }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
    className={`relative flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-weak)] px-3 py-2.5 text-left transition duration-200 hover:bg-[var(--nova-overlay-medium)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING} ${className}`}
  >
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
        tone === 'danger'
          ? 'border-[var(--nova-danger)]/30 bg-[var(--nova-danger)]/10 text-[var(--nova-danger)]'
          : 'border-[var(--nova-accent-color)]/25 bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]'
      }`}
      aria-hidden="true"
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-[13px] font-semibold ${tone === 'danger' ? 'text-[var(--nova-danger)]' : 'text-[var(--nova-text-primary)]'}`}>
        {label}
      </span>
      {description && (
        <span className="mt-0.5 block truncate text-[11px] text-[var(--nova-text-muted)]">{description}</span>
      )}
    </span>
    {badge !== undefined && badge !== '' && (
      <span className="min-w-[22px] rounded-full border border-[var(--nova-border-subtle)] bg-[var(--nova-overlay-medium)] px-1.5 py-0.5 text-center text-[10px] font-bold text-[var(--nova-text-secondary)]">
        {badge}
      </span>
    )}
  </button>
);

export const InfoHint: React.FC<{ label: string; onClick?: () => void; className?: string }> = ({ label, onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    aria-label={label}
    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--nova-text-muted)] transition ${!onClick ? 'opacity-50 cursor-default' : 'hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)]'} ${FOCUS_RING} ${className}`}
  >
    <Info className="h-4 w-4" aria-hidden="true" />
  </button>
);

export const SettingsTabs: React.FC<{
  tabs: { key: string; label: string; icon: ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === active);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={`flex shrink-0 items-stretch border-b border-[var(--nova-border-subtle)] bg-[var(--nova-surface)] overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`settings-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`settings-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`relative flex min-h-[56px] flex-shrink-0 flex-col items-center justify-center gap-1 px-3 py-2 text-[12px] font-medium transition ${FOCUS_RING} ${
              selected
                ? 'text-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/5'
                : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)]'
            }`}
          >
            <span className="[&>svg]:h-[20px] [&>svg]:w-[20px]" aria-hidden="true">{tab.icon}</span>
            <span className={`max-w-full truncate px-1 ${selected ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
            {selected && (
              <span className="absolute bottom-0 inset-x-3 h-1 rounded-full bg-[var(--nova-accent-color)]" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export const SettingsSheet: React.FC<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}> = ({ open, title, description, onClose, children, footer, testId }) => {
  const trapRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useMemo(() => `settings-sheet-${Math.random().toString(36).slice(2, 9)}`, []);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[min(86dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--nova-border-subtle)] bg-[var(--nova-surface)] text-[var(--nova-text-primary)] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--nova-border-subtle)] p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-bold leading-tight">{title}</h2>
            {description && <p className="mt-1 text-[12px] leading-relaxed text-[var(--nova-text-muted)]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--nova-text-secondary)] transition hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--nova-border-subtle)] p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export const HoldToConfirm: React.FC<{
  label: string;
  holdLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}> = ({ label, holdLabel, onConfirm, disabled, tone = 'danger' }) => {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const confirmed = useRef(false);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const start = () => {
    if (disabled) return;
    confirmed.current = false;
    startedAt.current = Date.now();
    setHolding(true);
    timer.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const next = Math.min(1, elapsed / 2000);
      setProgress(next);
      if (next >= 1) {
        if (timer.current !== null) window.clearInterval(timer.current);
        timer.current = null;
        confirmed.current = true;
        setHolding(false);
        setProgress(0);
        onConfirm();
      }
    }, 50);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={`relative flex min-h-[48px] w-full items-center justify-center overflow-hidden rounded-2xl border px-3 text-[13px] font-semibold transition disabled:opacity-40 ${FOCUS_RING} ${
        tone === 'danger'
          ? 'border-[var(--nova-danger)]/40 bg-[var(--nova-danger)]/10 text-[var(--nova-danger)] hover:bg-[var(--nova-danger)]/15'
          : 'border-[var(--nova-accent-color)]/40 bg-[var(--nova-accent-color)]/10 text-[var(--nova-accent-color)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${
          tone === 'danger' ? 'bg-[var(--nova-danger)]/25' : 'bg-[var(--nova-accent-color)]/25'
        }`}
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{holding ? holdLabel : label}</span>
    </button>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  testId?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  description,
  error,
  iconLeft,
  iconRight,
  testId,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-[12px] font-medium text-[var(--nova-text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 text-[var(--nova-text-muted)] pointer-events-none" aria-hidden="true">
            {iconLeft}
          </span>
        )}
        <input
          id={inputId}
          data-testid={testId}
          className={`
            w-full bg-[var(--nova-overlay-weak)]/50 text-[var(--nova-text-primary)] placeholder-[var(--nova-text-muted)]
            rounded-xl px-3 py-2.5 text-sm transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]
            focus-visible:ring-offset-0
            disabled:opacity-40 disabled:cursor-not-allowed
            ${iconLeft ? 'pl-10' : ''}
            ${iconRight ? 'pr-10' : ''}
            ${error ? 'focus-visible:ring-[var(--nova-danger)]' : ''}
            ${className}
          `}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : description ? `${inputId}-desc` : undefined}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 text-[var(--nova-text-muted)] pointer-events-none" aria-hidden="true">
            {iconRight}
          </span>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-[11px] font-medium text-[var(--nova-danger)]" role="alert">
          {error}
        </p>
      )}
      {description && !error && (
        <p id={`${inputId}-desc`} className="text-[11px] text-[var(--nova-text-muted)]">
          {description}
        </p>
      )}
    </div>
  );
};

export const SettingsSection: React.FC<{
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  divider?: boolean;
  description?: string;
}> = ({ title, children, action, icon, className = '', divider, description }) => (
  <section className={`space-y-2 ${className} ${divider ? 'pt-4 border-t border-[var(--nova-border-subtle)]' : ''}`}>
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--nova-accent-color)]/15 text-[var(--nova-accent-color)]" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--nova-text-muted)]">{title}</h3>
          {description && <p className="mt-0.5 text-[10px] text-[var(--nova-text-muted)]">{description}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
);












