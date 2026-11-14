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
    const broadcastId = `bc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
