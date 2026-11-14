/**
 * Ephemeral delivery & read receipts + typing indicators.
 * These are never persisted; they are fire-and-forget P2P signals.
 */

export type ReceiptType = 'delivered' | 'read' | 'typing' | 'typing_stop';

export interface ReceiptSignal {
  type: ReceiptType;
  chatId: string;
  messageId?: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  timestamp: number;
}

export interface ReceiptManagerOptions {
  localFingerprint: string;
  sendToPeer?: (peerFingerprint: string, signal: ReceiptSignal) => void | Promise<void>;
  onSignal?: (signal: ReceiptSignal) => void;
}

export class ReceiptManager {
  private readonly localFingerprint: string;
  private readonly sendToPeer?: ReceiptManagerOptions['sendToPeer'];
  private readonly onSignal?: ReceiptManagerOptions['onSignal'];

  constructor(options: ReceiptManagerOptions) {
    this.localFingerprint = options.localFingerprint;
    this.sendToPeer = options.sendToPeer;
    this.onSignal = options.onSignal;
  }

  public async sendReceipt(
    peerFingerprint: string,
    chatId: string,
    type: ReceiptType,
    messageId?: string,
  ): Promise<void> {
    const signal: ReceiptSignal = {
      type,
      chatId,
      messageId,
      senderFingerprint: this.localFingerprint,
      recipientFingerprint: peerFingerprint,
      timestamp: Date.now(),
    };
    await this.sendToPeer?.(peerFingerprint, signal);
  }

  public handleIncoming(signal: ReceiptSignal): void {
    if (signal.recipientFingerprint !== this.localFingerprint) return;
    this.onSignal?.(signal);
  }
}
