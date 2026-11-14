export interface RelayEnvelope {
  id: string;
  origin: string;
  destination: string;
  ttl: number;
  createdAt: number;
  hops: string[];
  sealed: boolean;
  payload: unknown;
}

export type RelaySender = (envelope: RelayEnvelope) => boolean;
export type RelayDeliveryHandler = (envelope: RelayEnvelope) => void;

/**
 * Destination used for payloads that any relay node should accept, e.g. a
 * group join request whose author does not know the admins' fingerprints yet.
 */
export const RELAY_BROADCAST = '*';

const DEFAULT_TTL = 3;
const MAX_SEEN_ENVELOPES = 5000;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class MeshRelay {
  public readonly localFingerprint: string;
  private readonly channel: BroadcastChannel | null;
  private readonly directPeers = new Map<string, RelaySender>();
  private readonly seen = new Map<string, number>();
  private deliveryHandler: RelayDeliveryHandler | null = null;
  private closed = false;

  constructor(localFingerprint: string, channelName = 'nova_mesh_relay') {
    this.localFingerprint = localFingerprint;
    this.channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<RelayEnvelope>) => {
        if (event.data?.id) {
          this.receive(event.data, true);
        }
      };
    }
  }

  public onDeliver(callback: RelayDeliveryHandler): void {
    this.deliveryHandler = callback;
  }

  public addDirectPeer(fingerprint: string, sender: RelaySender): void {
    this.directPeers.set(fingerprint, sender);
  }

  public removeDirectPeer(fingerprint: string): void {
    this.directPeers.delete(fingerprint);
  }

  private markSeen(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.set(id, Date.now());
    if (this.seen.size > MAX_SEEN_ENVELOPES) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [key, timestamp] of this.seen) {
        if (timestamp < cutoff || this.seen.size > MAX_SEEN_ENVELOPES) {
          this.seen.delete(key);
        }
      }
    }
    return true;
  }

  public send(destination: string, payload: unknown, ttl = DEFAULT_TTL): boolean {
    if (this.closed || destination === this.localFingerprint) return false;

    const envelope: RelayEnvelope = {
      id: randomId(),
      origin: this.localFingerprint,
      destination,
      ttl,
      createdAt: Date.now(),
      hops: [this.localFingerprint],
      sealed: true,
      payload,
    };

    this.markSeen(envelope.id);
    return this.forward(envelope);
  }

  private forward(envelope: RelayEnvelope): boolean {
    const direct = this.directPeers.get(envelope.destination);
    if (direct && direct(envelope)) {
      return true;
    }

    for (const [peerFingerprint, sender] of this.directPeers) {
      if (peerFingerprint === envelope.origin) continue;
      if (sender(envelope)) return true;
    }

    if (this.channel) {
      this.channel.postMessage(envelope);
      return true;
    }

    return false;
  }

  public receive(envelope: RelayEnvelope, fromBus = false): void {
    if (this.closed || !envelope.id) return;
    if (!this.markSeen(envelope.id)) return;

    if (envelope.destination === this.localFingerprint) {
      this.deliveryHandler?.(envelope);
      return;
    }

    // Broadcast envelopes are handed to the local handler and still forwarded,
    // so every device in the mesh gets a chance to see them.
    if (envelope.destination === RELAY_BROADCAST) {
      this.deliveryHandler?.(envelope);
    }

    if (envelope.ttl <= 1 || envelope.hops.length >= 8) return;
    if (envelope.hops.includes(this.localFingerprint)) return;

    const forwarded: RelayEnvelope = {
      ...envelope,
      ttl: envelope.ttl - 1,
      hops: [...envelope.hops, this.localFingerprint],
    };

    const delay = fromBus ? 10 + Math.floor(Math.random() * 40) : 0;
    if (delay === 0) {
      this.forward(forwarded);
    } else {
      setTimeout(() => {
        if (!this.closed) this.forward(forwarded);
      }, delay);
    }
  }

  public close(): void {
    this.closed = true;
    this.directPeers.clear();
    this.seen.clear();
    if (this.channel) {
      this.channel.close();
    }
  }
}
