import { sendAnonMessage, type AnonInvite } from './session';
import type { AnonTransport, EnqueueResult } from './types';
import {
  encodeGroupKeyDistribution,
  sealGroupMessage,
  type GroupSession,
  createGroupSession,
  rotateGroupSession,
} from './groupSession';

/**
 * Client-side group fan-out.
 *
 * There is no group queue: the sender writes one copy of the (separately
 * sealed) message into every member's own queue. The relay therefore learns
 * nothing about group membership or size, only unrelated queue writes.
 * Traffic cost grows linearly with the member count — this is why the roadmap
 * caps fan-out groups at roughly 50–100 members.
 */
export interface GroupMemberInvite {
  memberId: string;
  invite: AnonInvite;
}

export interface FanOutResult {
  delivered: string[];
  failed: string[];
}

export async function sendGroupMessage(
  transport: AnonTransport,
  members: GroupMemberInvite[],
  plaintext: string,
): Promise<FanOutResult> {
  const delivered: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    members.map(async (member) => {
      try {
        const result: EnqueueResult | null = await sendAnonMessage(
          transport,
          member.invite,
          plaintext,
        );
        if (result) delivered.push(member.memberId);
        else failed.push(member.memberId);
      } catch {
        failed.push(member.memberId);
      }
    }),
  );

  return { delivered, failed };
}

/**
 * Send one group message to every member under the shared group key.
 *
 * The group envelope (AES-256-GCM under `session.keyJwk`) is wrapped separately
 * for each member under that member's personal key, exactly like a one-to-one
 * anonymous message. Members without a current group key cannot open it.
 */
export async function sendEncryptedGroupMessage(
  transport: AnonTransport,
  members: GroupMemberInvite[],
  session: GroupSession,
  plaintext: string,
): Promise<FanOutResult> {
  if (members.length > MAX_FANOUT_MEMBERS) {
    return { delivered: [], failed: members.map((member) => member.memberId) };
  }
  const envelope = await sealGroupMessage(session, plaintext);
  const payload = JSON.stringify(envelope);

  const delivered: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    members.map(async (member) => {
      try {
        const result: EnqueueResult | null = await sendAnonMessage(
          transport,
          member.invite,
          payload,
        );
        if (result) delivered.push(member.memberId);
        else failed.push(member.memberId);
      } catch {
        failed.push(member.memberId);
      }
    }),
  );

  return { delivered, failed };
}

export const MAX_FANOUT_MEMBERS = 100;

/**
 * Send the current group key to one member as a personal sealed message. This
 * is how a new member receives the key: the relay sees a normal 1:1 queue
 * write, never a roster or a group key exchange.
 */
export async function distributeGroupKey(
  transport: AnonTransport,
  member: GroupMemberInvite,
  session: GroupSession,
): Promise<boolean> {
  const body = encodeGroupKeyDistribution(session);
  const result = await sendAnonMessage(transport, member.invite, body);
  return Boolean(result);
}

/**
 * Distribute a (possibly rotated) group key to every remaining member. The
 * caller supplies a per-relay transport factory because member queues can live
 * on different relays.
 */
export async function distributeGroupSession(
  transportFor: (relayUrl: string) => AnonTransport | null,
  members: GroupMemberInvite[],
  session: GroupSession,
): Promise<FanOutResult> {
  if (members.length > MAX_FANOUT_MEMBERS) {
    return { delivered: [], failed: members.map((member) => member.memberId) };
  }

  const delivered: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    members.map(async (member) => {
      try {
        const transport = transportFor(member.invite.relayUrl);
        if (!transport) {
          failed.push(member.memberId);
          return;
        }
        if (await distributeGroupKey(transport, member, session)) delivered.push(member.memberId);
        else failed.push(member.memberId);
      } catch {
        failed.push(member.memberId);
      }
    }),
  );

  return { delivered, failed };
}

export function fanOutCostEstimate(memberCount: number, packetProfileBytes = 16384): number {
  return memberCount * packetProfileBytes;
}

// Re-export from groupSession for convenience
export { createGroupSession, rotateGroupSession, sealGroupMessage, type GroupSession } from './groupSession';
