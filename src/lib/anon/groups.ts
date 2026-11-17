import { sendAnonMessage, type AnonInvite } from './session';
import type { AnonTransport, EnqueueResult } from './types';

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

export const MAX_FANOUT_MEMBERS = 100;

export function fanOutCostEstimate(memberCount: number, packetProfileBytes = 16384): number {
  return memberCount * packetProfileBytes;
}
