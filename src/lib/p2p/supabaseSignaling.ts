import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';
import {
  SignalingMessage,
  SignalingStatus,
} from '../p2p/signaling';

export class SupabaseSignaling {
  private client = getSupabaseClient();
  private channel: any = null;
  private status: SignalingStatus = 'disconnected';
  private messageListeners = new Set<(msg: SignalingMessage) => void>();
  private statusListeners = new Set<(status: SignalingStatus) => void>();

  private setStatus(s: SignalingStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  onMessage(callback: (msg: SignalingMessage) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  onStatus(callback: (s: SignalingStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  getStatus(): SignalingStatus {
    return this.status;
  }

  isAvailable(): boolean {
    return isSupabaseConfigured() && this.client !== null;
  }

  async connect(): Promise<boolean> {
    if (!this.isAvailable()) {
      this.setStatus('error');
      return false;
    }

    try {
      this.setStatus('connecting');
      const fingerprint = localStorage.getItem('nova_fingerprint') || 'anonymous';

      this.channel = this.client!.channel(`signaling_${fingerprint}`);

      this.channel.on(
        'broadcast',
        { event: 'signal' },
        (payload: { message: SignalingMessage }) => {
          const msg = payload.message;
          if (msg && msg.senderFingerprint && msg.senderFingerprint !== fingerprint) {
            this.messageListeners.forEach((l) => l(msg));
          }
        }
      );

      await this.channel.subscribe();
      this.setStatus('connected');
      return true;
    } catch (err) {
      console.warn('Supabase signaling connect failed:', err);
      this.setStatus('error');
      return false;
    }
  }

  async sendSignal(message: SignalingMessage): Promise<void> {
    if (!this.isAvailable() || !this.channel) return;
    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { message },
      });
    } catch (err) {
      console.warn('Supabase signaling send failed:', err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.client?.removeChannel(this.channel);
      this.channel = null;
    }
    this.setStatus('disconnected');
  }
}

export const supabaseSignaling = new SupabaseSignaling();
