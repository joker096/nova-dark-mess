export type AnalyticsEvent =
  | { type: 'app_open'; timestamp: number }
  | { type: 'app_close'; timestamp: number }
  | { type: 'chat_open'; chatId: string; timestamp: number }
  | { type: 'message_send'; chatId: string; timestamp: number }
  | { type: 'message_receive'; chatId: string; timestamp: number }
  | { type: 'voice_message_send'; chatId: string; timestamp: number }
  | { type: 'voice_message_receive'; chatId: string; timestamp: number }
  | { type: 'backup_export'; timestamp: number }
  | { type: 'backup_import'; timestamp: number }
  | { type: 'pin_set'; timestamp: number }
  | { type: 'pin_remove'; timestamp: number }
  | { type: 'two_factor_enable'; timestamp: number }
  | { type: 'two_factor_disable'; timestamp: number }
  | { type: 'identity_regenerate'; timestamp: number }
  | { type: 'data_clear'; timestamp: number }
  | { type: 'settings_change'; key: string; timestamp: number }
  | { type: 'folder_create'; folderId: string; timestamp: number }
  | { type: 'folder_delete'; folderId: string; timestamp: number };

const STORAGE_KEY = 'nova_local_analytics';
const CRASH_STORAGE_KEY = 'nova_local_crashes';
const MAX_EVENTS = 500;
const MAX_CRASHES = 50;

interface CrashReport {
  timestamp: number;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}

export class LocalAnalytics {
  private events: AnalyticsEvent[] = [];
  private crashes: CrashReport[] = [];
  private analyticsConsent = false;
  private crashReportsConsent = false;

  constructor() {
    this.load();
    this.loadCrashes();
    // Only track app_open if analytics consent is already set.
    if (this.analyticsConsent) {
      this.track({ type: 'app_open', timestamp: Date.now() });
    }
    window.addEventListener('beforeunload', () => {
      if (this.analyticsConsent) {
        this.track({ type: 'app_close', timestamp: Date.now() });
      }
      this.save();
      this.saveCrashes();
    });

    // Global crash capture (only stores if crashReports consent is enabled)
    const originalOnError = window.onerror;
    window.onerror = (message, filename, lineno, colno, error) => {
      const stack = error?.stack ?? undefined;
      this.recordCrash(String(message), filename, lineno, colno, stack);
      if (originalOnError) {
        return originalOnError(message, filename, lineno, colno, error);
      }
      return false;
    };
    const originalUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = (event) => {
      const reason = event.reason;
      const stack = reason?.stack ?? undefined;
      this.recordCrash(
        typeof reason === 'string' ? reason : String(reason),
        undefined,
        undefined,
        undefined,
        stack
      );
      if (originalUnhandledRejection) {
        (originalUnhandledRejection as (e: PromiseRejectionEvent) => void)(event);
      }
    };
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.events = JSON.parse(raw) as AnalyticsEvent[];
      }
    } catch {
      this.events = [];
    }
  }

  private loadCrashes(): void {
    try {
      const raw = localStorage.getItem(CRASH_STORAGE_KEY);
      if (raw) {
        this.crashes = JSON.parse(raw) as CrashReport[];
      }
    } catch {
      this.crashes = [];
    }
  }

  public save(): void {
    try {
      const trimmed = this.events.slice(-MAX_EVENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      this.events = trimmed;
    } catch {
      // localStorage may be unavailable in private mode
    }
  }

  private saveCrashes(): void {
    try {
      const trimmed = this.crashes.slice(-MAX_CRASHES);
      localStorage.setItem(CRASH_STORAGE_KEY, JSON.stringify(trimmed));
      this.crashes = trimmed;
    } catch {
      // localStorage may be unavailable in private mode
    }
  }

  /** Call from the settings UI when the user toggles analytics consent. */
  setAnalyticsConsent(consent: boolean): void {
    this.analyticsConsent = consent;
    if (consent) {
      this.track({ type: 'app_open', timestamp: Date.now() });
    }
    this.save();
  }

  /** Call from the settings UI when the user toggles crash report consent. */
  setCrashReportsConsent(consent: boolean): void {
    this.crashReportsConsent = consent;
    // Revoking consent also drops reports captured under the previous grant.
    if (!consent) this.clearCrashes();
    else this.saveCrashes();
  }

  /** Check whether analytics tracking is currently enabled. */
  hasAnalyticsConsent(): boolean {
    return this.analyticsConsent;
  }

  /** Check whether crash report storage is currently enabled. */
  hasCrashReportsConsent(): boolean {
    return this.crashReportsConsent;
  }

  private recordCrash(
    message: string,
    filename?: string,
    lineno?: number,
    colno?: number,
    stack?: string
  ): void {
    if (!this.crashReportsConsent) return;
    this.crashes.push({
      timestamp: Date.now(),
      message,
      filename,
      lineno,
      colno,
      stack,
    });
    this.saveCrashes();
  }

  track(event: AnalyticsEvent): void {
    if (!this.analyticsConsent) return;
    this.events.push(event);
    // Debounce save - save every 10 events or on app_close
    if (this.events.length % 10 === 0) {
      this.save();
    }
  }

  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  getEventCountsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }

  getMessagesByChat(): Record<string, { send: number; receive: number }> {
    const stats: Record<string, { send: number; receive: number }> = {};
    for (const event of this.events) {
      if (event.type === 'message_send' && event.chatId) {
        if (!stats[event.chatId]) stats[event.chatId] = { send: 0, receive: 0 };
        stats[event.chatId].send += 1;
      } else if (event.type === 'message_receive' && event.chatId) {
        if (!stats[event.chatId]) stats[event.chatId] = { send: 0, receive: 0 };
        stats[event.chatId].receive += 1;
      }
    }
    return stats;
  }

  getCrashes(): CrashReport[] {
    return [...this.crashes];
  }

  /** Remove stored crash reports without touching analytics events. */
  clearCrashes(): void {
    this.crashes = [];
    try {
      localStorage.removeItem(CRASH_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable in private mode
    }
  }

  clear(): void {
    this.events = [];
    this.crashes = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CRASH_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable in private mode
    }
  }
}

export const localAnalytics = new LocalAnalytics();
