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
const MAX_EVENTS = 500;

export class LocalAnalytics {
  private events: AnalyticsEvent[] = [];

  constructor() {
    this.load();
    this.track({ type: 'app_open', timestamp: Date.now() });
    window.addEventListener('beforeunload', () => {
      this.track({ type: 'app_close', timestamp: Date.now() });
      this.save();
    });
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

  public save(): void {
    try {
      const trimmed = this.events.slice(-MAX_EVENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      this.events = trimmed;
    } catch {
      // localStorage may be unavailable in private mode
    }
  }

  track(event: AnalyticsEvent): void {
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

  clear(): void {
    this.events = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable in private mode
    }
  }
}

export const localAnalytics = new LocalAnalytics();
