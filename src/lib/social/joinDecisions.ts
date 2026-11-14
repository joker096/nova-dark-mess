/**
 * Admin decisions on join requests, applied from the chat list.
 *
 * The group screen has a live room channel; the chat list does not. A decision
 * taken there still has to (a) update the local request ledger, (b) add the
 * approved member to the local roster, and (c) get the answer to the requester,
 * which is parked in the session relay outbox when no peer is connected.
 */

import { MOCK_CHATS, loadCreatedGroups, saveCreatedGroups } from '../../data/mockMessengerData';
import { GroupChatManager, type GroupPayload } from '../p2p/groupManager';
import { setJoinRequestStatus } from './groupJoinRequests';
import { isGroupAdmin, loadGroupRoles, setMemberRole, type GroupRoles } from './groupRoles';
import {
  enqueueJoinPayload,
  getActiveJoinRelay,
  notifyJoinRequestsChanged,
} from './joinRequestRelay';

function groupMembers(groupId: string): string[] {
  const chat = MOCK_CHATS.find((entry) => entry.id === groupId);
  if (chat?.type === 'group' && chat.members?.length) return chat.members;
  return loadCreatedGroups().find((group) => group.id === groupId)?.members ?? [];
}

function persistGroupMembers(groupId: string, members: string[]): void {
  const chat = MOCK_CHATS.find((entry) => entry.id === groupId);
  if (chat?.type === 'group') chat.members = members;

  const created = loadCreatedGroups();
  if (created.some((group) => group.id === groupId)) {
    saveCreatedGroups(
      created.map((group) => (group.id === groupId ? { ...group, members } : group)),
    );
  }
}

export interface JoinDecisionOptions {
  groupId: string;
  fingerprint: string;
  localFingerprint: string;
  approved: boolean;
}

/**
 * Approves or declines a request. Returns the updated role map, or null when
 * the local device is not an admin of that group (nothing is changed then).
 */
export function decideJoinRequest(options: JoinDecisionOptions): GroupRoles | null {
  const { groupId, fingerprint, localFingerprint, approved } = options;
  if (!groupId || !fingerprint || !localFingerprint) return null;
  if (fingerprint === localFingerprint) return null;
  if (!isGroupAdmin(loadGroupRoles(groupId), localFingerprint)) return null;

  const manager = new GroupChatManager({
    groupId,
    localFingerprint,
    members: groupMembers(groupId),
    // Same offline-first path as the group screen: the session relay delivers
    // the decision once a peer is reachable.
    sendToPeer: (_peer, payload: GroupPayload) => {
      enqueueJoinPayload(payload);
    },
  });

  void manager.respondToJoin(fingerprint, approved);

  if (approved) {
    void manager.addMember(fingerprint);
    persistGroupMembers(groupId, manager.getMembers());
    setMemberRole(groupId, fingerprint, 'member');
  }

  setJoinRequestStatus(groupId, fingerprint, approved ? 'approved' : 'rejected');
  notifyJoinRequestsChanged(groupId);
  // A live session relay can take the decision right away instead of waiting
  // for its next scheduled wake-up.
  getActiveJoinRelay()?.flush();

  return loadGroupRoles(groupId);
}
