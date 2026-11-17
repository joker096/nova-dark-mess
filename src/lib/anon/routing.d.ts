import type { PowChallenge, PowSolution } from './spam';
import type { AbuseReportSubmission } from './blocks';

export const ROUTING_VERSION: 1;
export const ROUTING_INFO: Uint8Array;

export interface RoutingKeyPair {
  privateKey: string;
  publicKey: string;
}

export type RoutingAction = 'enqueue' | 'poll' | 'ack' | 'create' | 'report';

export interface RoutingCommandAuth {
  signature?: string;
  signedAt?: number;
  commandNonce?: string;
}

export type RoutingRequest =
  | ({
    action: 'enqueue';
    queueId: string;
    token: string;
    packet: string;
    pow?: PowSolution;
    inviteToken?: string;
  } & RoutingCommandAuth)
  | ({
    action: 'poll';
    queueId: string;
    token: string;
    limit?: number;
  } & RoutingCommandAuth)
  | ({
    action: 'ack';
    queueId: string;
    token: string;
    packetIds: string[];
  } & RoutingCommandAuth)
  | {
    action: 'create';
    ttlMs?: number;
    replyPublicKey: string;
    signingPublicKey?: string;
    pow?: PowChallenge;
  }
  | {
    action: 'report';
    report: AbuseReportSubmission;
  };

export type RoutingPlaintext = RoutingRequest & {
  v: 1;
  iat: number;
  nonce: string;
};

export interface RoutingCreateResponse {
  v: 1;
  iat: number;
  nonce: string;
  action: 'create';
  queueId: string;
  senderToken: string;
  recipientToken: string;
  inviteToken: string;
  expiresAt: number;
}

export type RoutingPayload = RoutingRequest | Omit<RoutingCreateResponse, 'v' | 'iat' | 'nonce'>;

export interface RoutingEnvelope {
  v: 1;
  epk: string;
  salt: string;
  iv: string;
  ct: string;
}

export function routingPublicKey(privateKey: string): string;
export function generateRoutingKeyPair(): RoutingKeyPair;
export function sealRoutingEnvelope(
  relayPublicKey: string,
  route: RoutingPayload,
): Promise<RoutingEnvelope>;
export function openRoutingEnvelope<T extends RoutingPayload = RoutingPlaintext>(
  relayPrivateKey: string,
  envelope: RoutingEnvelope,
): Promise<T>;
