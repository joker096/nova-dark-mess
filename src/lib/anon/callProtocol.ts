import type { SignalingMessage } from '../p2p/signaling';

export const ANON_CALL_VERSION = 1;

export type AnonCallMode = 'voice' | 'video';
export type AnonCallSignalType = 'offer' | 'answer' | 'candidate';

export interface AnonCallMessage {
  __novaCall: typeof ANON_CALL_VERSION;
  kind: 'invite' | 'accept' | 'decline' | 'end' | 'signal';
  callId: string;
  mode?: AnonCallMode;
  signalType?: AnonCallSignalType;
  payload?: unknown;
}

const CALL_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const SIGNAL_TYPES = new Set<AnonCallSignalType>(['offer', 'answer', 'candidate']);

export function isAnonCallMessage(value: unknown): value is AnonCallMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Partial<AnonCallMessage>;
  if (msg.__novaCall !== ANON_CALL_VERSION) return false;
  if (!msg.callId || !CALL_ID_PATTERN.test(msg.callId)) return false;
  if (msg.kind === 'invite') {
    return msg.mode === 'voice' || msg.mode === 'video';
  }
  if (msg.kind === 'signal') {
    return Boolean(msg.signalType && SIGNAL_TYPES.has(msg.signalType));
  }
  return msg.kind === 'accept' || msg.kind === 'decline' || msg.kind === 'end';
}

export function parseAnonCallMessage(body: string): AnonCallMessage | null {
  if (!body.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return isAnonCallMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function encodeAnonCallMessage(message: AnonCallMessage): string {
  if (!isAnonCallMessage(message)) {
    throw new Error('Invalid anonymous call message');
  }
  return JSON.stringify(message);
}

/**
 * Routes WebRTC signaling through an encrypted contact queue.
 *
 * `P2PMediaCall` only needs `onMessage`, `connect` and `sendSignal`; it never
 * sees the anon transport. The caller is always the initiator, so the adapter
 * exposes deterministic local/peer ids instead of identity fingerprints.
 */
export class AnonCallSignaling {
  private readonly listeners = new Set<(message: SignalingMessage) => void>();

  constructor(
    private readonly options: {
      callId: string;
      localId: 'a' | 'b';
      peerId: 'a' | 'b';
      send: (message: AnonCallMessage) => Promise<boolean>;
    },
  ) {}

  public onMessage(listener: (message: SignalingMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async connect(): Promise<boolean> {
    return true;
  }

  public async sendSignal(message: SignalingMessage): Promise<void> {
    if (
      message.type !== 'offer' &&
      message.type !== 'answer' &&
      message.type !== 'candidate'
    ) {
      return;
    }
    await this.options.send({
      __novaCall: ANON_CALL_VERSION,
      kind: 'signal',
      callId: this.options.callId,
      signalType: message.type,
      payload: message.payload,
    });
  }

  public receive(message: AnonCallMessage): void {
    if (message.kind !== 'signal' || !message.signalType) return;
    const signal: SignalingMessage = {
      type: message.signalType,
      senderFingerprint: this.options.peerId,
      targetFingerprint: this.options.localId,
      payload: message.payload,
    };
    for (const listener of this.listeners) listener(signal);
  }

  public close(): void {
    this.listeners.clear();
  }
}

/** Caller/callee ids keep `P2PMediaCall`'s lexical initiator rule stable. */
export function anonCallIds(role: 'caller' | 'callee'): { localId: 'a' | 'b'; peerId: 'a' | 'b' } {
  return role === 'caller'
    ? { localId: 'a', peerId: 'b' }
    : { localId: 'b', peerId: 'a' };
}
