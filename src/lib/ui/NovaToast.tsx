import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {IconX as X} from '@tabler/icons-react';

export interface ToastUndo {
  label: string;
  onUndo: () => void;
}

export interface ToastOptions {
  /** Milliseconds before the toast disappears (default 5 s). */
  duration?: number;
  /** Adds an Undo button; the toast waits for it or times out. */
  undo?: ToastUndo;
  tone?: 'default' | 'danger' | 'success';
}

interface ToastEntry extends ToastOptions {
  id: number;
  message: string;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;

export function NovaToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const entry: ToastEntry = { id, message, duration: options.duration ?? 5000, ...options };
      setToasts((current) => [...current, entry].slice(-MAX_VISIBLE));
      const timer = setTimeout(() => dismiss(id), entry.duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-3 pointer-events-none"
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} onUndo={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onUndo,
}: {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
  onUndo: (id: number) => void;
}) {
  const tone =
    toast.tone === 'danger'
      ? 'border-[var(--danger)]/30'
      : toast.tone === 'success'
        ? 'border-[var(--success)]/30'
        : 'border-[var(--border)]';

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border ${tone} bg-[var(--bg-surface)]/[0.96] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] shadow-[var(--shadow-2)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150`}
    >
      <span className="flex-1 min-w-0 break-words">{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            onUndo(toast.id);
            toast.undo!.onUndo();
          }}
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--nova-accent-color)] hover:bg-[var(--bg-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)] cursor-pointer"
        >
          {toast.undo.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-full p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color)]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Access the toast queue; throws outside a `NovaToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a NovaToastProvider');
  return api;
}










