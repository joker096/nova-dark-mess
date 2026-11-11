export type MessageEnvelopeType = 'message' | 'file' | 'call' | 'metadata';
export type MessagePriority = 'normal' | 'urgent' | 'low';

export interface MessageEnvelope {
  version: number;
  type: MessageEnvelopeType;
  sender: string;
  recipient: string;
  timestamp: number;
  ttl: number;
  encryptedPayload: string;
  iv: string;
  mac: string;
  forwardSecrecy: boolean;
  priority: MessagePriority;
}

export interface MessageEnvelopeInput {
  type: MessageEnvelopeType;
  sender: string;
  recipient: string;
  ttl?: number;
  encryptedPayload: string;
  iv: string;
  mac: string;
  forwardSecrecy?: boolean;
  priority?: MessagePriority;
}

export const MESSAGE_ENVELOPE_VERSION = 1;

const DEFAULT_TTL = 0;
const DEFAULT_FORWARD_SECRECY = true;
const DEFAULT_PRIORITY: MessagePriority = 'normal';

export function createMessageEnvelope(input: MessageEnvelopeInput): MessageEnvelope {
  return {
    version: MESSAGE_ENVELOPE_VERSION,
    type: input.type,
    sender: input.sender,
    recipient: input.recipient,
    timestamp: Date.now(),
    ttl: input.ttl ?? DEFAULT_TTL,
    encryptedPayload: input.encryptedPayload,
    iv: input.iv,
    mac: input.mac,
    forwardSecrecy: input.forwardSecrecy ?? DEFAULT_FORWARD_SECRECY,
    priority: input.priority ?? DEFAULT_PRIORITY,
  };
}

export function serializeMessageEnvelope(envelope: MessageEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeMessageEnvelope(json: string): MessageEnvelope {
  const parsed = JSON.parse(json) as MessageEnvelope;

  if (parsed.version !== MESSAGE_ENVELOPE_VERSION) {
    throw new Error(
      `Unsupported message envelope version: ${parsed.version}, expected ${MESSAGE_ENVELOPE_VERSION}`,
    );
  }

  const validTypes: MessageEnvelopeType[] = ['message', 'file', 'call', 'metadata'];
  if (!validTypes.includes(parsed.type)) {
    throw new Error(`Invalid message envelope type: ${parsed.type}`);
  }

  const validPriorities: MessagePriority[] = ['normal', 'urgent', 'low'];
  if (!validPriorities.includes(parsed.priority)) {
    throw new Error(`Invalid message priority: ${parsed.priority}`);
  }

  if (typeof parsed.sender !== 'string' || parsed.sender.length === 0) {
    throw new Error('Message envelope sender is required');
  }

  if (typeof parsed.recipient !== 'string' || parsed.recipient.length === 0) {
    throw new Error('Message envelope recipient is required');
  }

  if (typeof parsed.timestamp !== 'number' || parsed.timestamp <= 0) {
    throw new Error('Message envelope timestamp is required');
  }

  if (typeof parsed.ttl !== 'number' || parsed.ttl < 0) {
    throw new Error('Message envelope TTL must be a non-negative number');
  }

  if (typeof parsed.encryptedPayload !== 'string' || parsed.encryptedPayload.length === 0) {
    throw new Error('Message envelope encryptedPayload is required');
  }

  if (typeof parsed.iv !== 'string' || parsed.iv.length === 0) {
    throw new Error('Message envelope iv is required');
  }

  if (typeof parsed.mac !== 'string' || parsed.mac.length === 0) {
    throw new Error('Message envelope mac is required');
  }

  return parsed;
}

export function isMessageExpired(envelope: MessageEnvelope): boolean {
  if (envelope.ttl === 0) return false;
  const expiryTime = envelope.timestamp + envelope.ttl * 1000;
  return Date.now() > expiryTime;
}

export function getMessageTimeToLive(envelope: MessageEnvelope): number {
  if (envelope.ttl === 0) return Infinity;
  const expiryTime = envelope.timestamp + envelope.ttl * 1000;
  return Math.max(0, expiryTime - Date.now());
}