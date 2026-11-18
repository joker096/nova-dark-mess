import type { PowSolution } from './spam';

export const QUEUE_COMMAND_VERSION: 1;
export const IDENTITY_BINDING_VERSION: 1;

export function identityBindingMessage(identityKey: string, signingPublicKey: string): string;
export function signIdentityBinding(
  privateKey: string,
  identityKey: string,
  signingPublicKey: string,
): string;
export function verifyIdentityBinding(
  identityKey: string,
  signingPublicKey: string,
  signature: string,
): boolean;

export type QueueCommandAction = 'enqueue' | 'poll' | 'ack' | 'delete_queue';

export interface QueueCommandFields {
  action: QueueCommandAction;
  queueId: string;
  token: string;
  packet?: string;
  pow?: PowSolution;
  limit?: number;
  packetIds?: string[];
  signedAt: number;
  commandNonce: string;
}

export interface QueueCommandAuth {
  signature: string;
  signedAt: number;
  commandNonce: string;
}

export interface QueueSigningKeyPair {
  privateKey: string;
  publicKey: string;
}

export function generateQueueSigningKeyPair(): QueueSigningKeyPair;
export function queueSigningPublicKey(privateKey: string): string;
export function isQueuePublicKey(value: unknown): value is string;
export function isQueuePrivateKey(value: unknown): value is string;
export function queueCommandMessage(command: QueueCommandFields): string;
export function signQueueCommand(
  privateKey: string,
  command: Omit<QueueCommandFields, 'signedAt' | 'commandNonce'> &
    Partial<Pick<QueueCommandFields, 'signedAt' | 'commandNonce'>>,
): QueueCommandAuth;
export function verifyQueueCommand(
  publicKey: string,
  command: QueueCommandFields,
  signature: string,
): boolean;
