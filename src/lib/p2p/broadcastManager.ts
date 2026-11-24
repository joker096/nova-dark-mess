/**
 * Broadcast lists: WhatsApp-style fan-out of a single message to a list of
 * recipients over their existing P2P connections.
 */

export interface BroadcastRecipient {
  id: string;
  fingerprint: string;
}

export interface BroadcastMessage {
  broadcastId: string;
  senderFingerprint: string;
  text: string;
  createdAt: number;
  recipientIds: string[];
}

function randomId6(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return (bytes[0] >>> 0).toString(36).padStart(6, 'a').slice(-6);
}

export interface BroadcastManagerOptions {
  localFingerprint: string;
  sendToPeer?: (peerFingerprint: string, message: BroadcastMessage) => void | Promise<void>;
  onDelivered?: (broadcastId: string, recipientFingerprint: string) => void;
  onFailed?: (broadcastId: string, recipientFingerprint: string, error: Error) => void;
}

export class BroadcastManager {
  private readonly localFingerprint: string;
  private readonly sendToPeer?: BroadcastManagerOptions['sendToPeer'];
  private readonly onDelivered?: BroadcastManagerOptions['onDelivered'];
  private readonly onFailed?: BroadcastManagerOptions['onFailed'];

  constructor(options: BroadcastManagerOptions) {
    this.localFingerprint = options.localFingerprint;
    this.sendToPeer = options.sendToPeer;
    this.onDelivered = options.onDelivered;
    this.onFailed = options.onFailed;
  }

  public async send(
    recipients: BroadcastRecipient[],
    text: string,
  ): Promise<string> {
    const broadcastId = `bc-${Date.now()}-${randomId6()}`;
    const message: BroadcastMessage = {
      broadcastId,
      senderFingerprint: this.localFingerprint,
      text,
      createdAt: Date.now(),
      recipientIds: recipients.map((r) => r.id),
    };

    for (const recipient of recipients) {
      try {
        await this.sendToPeer?.(recipient.fingerprint, message);
        this.onDelivered?.(broadcastId, recipient.fingerprint);
      } catch (err) {
        this.onFailed?.(
          broadcastId,
          recipient.fingerprint,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    return broadcastId;
  }
}
