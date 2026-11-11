export type TransportType = 'webrtc' | 'websocket' | 'mesh' | 'tor';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'blocked'
  | 'degraded';

export interface TransportBackend {
  id: TransportType;
  name: string;
  priority: number; // Lower = higher priority
  isAvailable: boolean;
  isBlocked: boolean;
  latency: number; // ms
  lastProbe: number | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (data: Uint8Array) => Promise<void>;
  onMessage?: (data: Uint8Array) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export interface TransportManagerOptions {
  backends: TransportBackend[];
  autoProbeInterval?: number; // ms, default: 30000
  probeTimeout?: number; // ms, default: 5000
  failoverThreshold?: number; // consecutive failures before failover, default: 3
}

export interface TransportStatus {
  current: TransportType | null;
  status: ConnectionStatus;
  latency: number;
  backends: Record<TransportType, {
    available: boolean;
    blocked: boolean;
    latency: number;
  }>;
}

export class TransportManager {
  private backends: Map<TransportType, TransportBackend> = new Map();
  private currentBackend: TransportType | null = null;
  private status: ConnectionStatus = 'disconnected';
  private latency: number = 0;
  private consecutiveFailures: number = 0;
  private probeTimer: NodeJS.Timeout | null = null;
  private options: Required<TransportManagerOptions>;
  private messageHandlers: Array<(data: Uint8Array) => void> = [];
  private statusChangeHandlers: Array<(status: TransportStatus) => void> = [];

  constructor(options: TransportManagerOptions) {
    this.options = {
      backends: options.backends,
      autoProbeInterval: options.autoProbeInterval ?? 30000,
      probeTimeout: options.probeTimeout ?? 5000,
      failoverThreshold: options.failoverThreshold ?? 3,
    };

    // Register backends
    for (const backend of options.backends) {
      this.backends.set(backend.id, backend);
      // Wire backend status changes
      backend.onStatusChange = (s) => {
        this.handleBackendStatusChange(backend.id, s);
      };
      backend.onMessage = (data) => {
        this.handleIncomingMessage(data);
      };
    }

    // Select initial backend (highest priority available)
    this.currentBackend = this.selectBestBackend()?.id ?? null;
  }

  /**
   * Get current transport status.
   */
  getStatus(): TransportStatus {
    return {
      current: this.currentBackend,
      status: this.status,
      latency: this.latency,
      backends: Object.fromEntries(
        Array.from(this.backends.entries()).map(([id, backend]) => [
          id,
          {
            available: backend.isAvailable,
            blocked: backend.isBlocked,
            latency: backend.latency,
          },
        ]),
      ) as TransportStatus['backends'],
    };
  }

  /**
   * Get all registered backends.
   */
  getBackends(): TransportBackend[] {
    return Array.from(this.backends.values());
  }

  /**
   * Connect using the current best backend.
   */
  async connect(): Promise<void> {
    const backend = this.selectBestBackend();
    if (!backend) {
      this.status = 'blocked';
      this.notifyStatusChange();
      throw new Error('No available transport backend');
    }

    await this.connectToBackend(backend.id);
  }

  /**
   * Disconnect from current backend.
   */
  async disconnect(): Promise<void> {
    if (this.currentBackend) {
      const backend = this.backends.get(this.currentBackend);
      if (backend) {
        await backend.disconnect();
      }
    }
    this.currentBackend = null;
    this.status = 'disconnected';
    this.latency = 0;
    this.notifyStatusChange();
  }

  /**
   * Send data through the current backend.
   */
  async send(data: Uint8Array): Promise<void> {
    if (!this.currentBackend) {
      throw new Error('No active transport backend');
    }

    const backend = this.backends.get(this.currentBackend);
    if (!backend || backend.isBlocked || !backend.isAvailable) {
      // Try to failover
      await this.failover();
      if (!this.currentBackend) {
        throw new Error('No available transport backend after failover');
      }
    }

    try {
      await backend!.send(data);
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.options.failoverThreshold) {
        await this.failover();
      }
      throw err;
    }
  }

  /**
   * Manually select a transport backend.
   */
  async selectBackend(id: TransportType): Promise<void> {
    const backend = this.backends.get(id);
    if (!backend) {
      throw new Error(`Unknown transport backend: ${id}`);
    }
    if (backend.isBlocked || !backend.isAvailable) {
      throw new Error(`Transport backend ${id} is not available`);
    }

    await this.disconnect();
    await this.connectToBackend(id);
  }

  /**
   * Probe all backends to measure latency and availability.
   */
  async probeAllBackends(): Promise<void> {
    const promises = Array.from(this.backends.values()).map(async (backend) => {
      const start = Date.now();
      try {
        // Simple probe - try to connect and measure latency
        await backend.connect();
        await backend.disconnect();
        backend.latency = Date.now() - start;
        backend.lastProbe = Date.now();
        backend.isBlocked = false;
        backend.isAvailable = true;
      } catch (err) {
        backend.isBlocked = true;
        backend.isAvailable = false;
        backend.latency = 0;
        backend.lastProbe = Date.now();
      }
    });

    await Promise.all(promises);
    this.selectBestBackend();
  }

  /**
   * Register a message handler.
   */
  onMessage(handler: (data: Uint8Array) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a status change handler.
   */
  onStatusChange(handler: (status: TransportStatus) => void): void {
    this.statusChangeHandlers.push(handler);
  }

  /**
   * Start automatic probing.
   */
  startProbing(): void {
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.probeTimer = setInterval(() => {
      this.probeAllBackends();
    }, this.options.autoProbeInterval);
  }

  /**
   * Stop automatic probing.
   */
  stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  /**
   * Manually trigger a failover to the next best backend.
   */
  async failover(): Promise<void> {
    const current = this.currentBackend;
    const available = this.getAvailableBackends().filter(
      (b) => b.id !== current,
    );

    if (available.length === 0) {
      this.status = 'blocked';
      this.notifyStatusChange();
      return;
    }

    // Sort by priority (lower = better)
    available.sort((a, b) => a.priority - b.priority);
    const next = available[0];

    await this.disconnect();
    await this.connectToBackend(next.id);
  }

  private selectBestBackend(): TransportBackend | null {
    const available = this.getAvailableBackends();
    if (available.length === 0) return null;

    available.sort((a, b) => a.priority - b.priority);
    return available[0];
  }

  private getAvailableBackends(): TransportBackend[] {
    return Array.from(this.backends.values()).filter(
      (b) => b.isAvailable && !b.isBlocked,
    );
  }

  private async connectToBackend(id: TransportType): Promise<void> {
    const backend = this.backends.get(id);
    if (!backend) throw new Error(`Unknown backend: ${id}`);

    this.status = 'connecting';
    this.notifyStatusChange();

    try {
      await backend.connect();
      this.currentBackend = id;
      this.status = 'connected';
      this.latency = backend.latency;
      this.consecutiveFailures = 0;
      this.notifyStatusChange();
    } catch (err) {
      this.status = 'blocked';
      this.notifyStatusChange();
      throw err;
    }
  }

  private handleBackendStatusChange(id: TransportType, status: ConnectionStatus): void {
    const backend = this.backends.get(id);
    if (!backend) return;

    if (status === 'connected') {
      this.latency = backend.latency;
    }

    // If current backend disconnected or blocked, try failover
    if (id === this.currentBackend && (status === 'disconnected' || status === 'blocked')) {
      this.failover();
    }

    this.notifyStatusChange();
  }

  private handleIncomingMessage(data: Uint8Array): void {
    for (const handler of this.messageHandlers) {
      handler(data);
    }
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    for (const handler of this.statusChangeHandlers) {
      handler(status);
    }
  }
}