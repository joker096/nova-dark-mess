import {
  SenderKeyState,
  SenderKeyDistributionMessage,
  SenderKeyEncryptedMessage,
  createSenderKey,
  createDistributionMessage,
  processDistributionMessage,
  senderKeyEncrypt,
  senderKeyDecrypt,
} from '../crypto/senderKeys';

export type GroupRoleMap = Record<string, 'admin' | 'member'>;

export type GroupPayload =
  | { type: 'skdm'; groupId: string; distribution: SenderKeyDistributionMessage }
  | {
      type: 'group_message';
      groupId: string;
      senderFingerprint: string;
      message: SenderKeyEncryptedMessage;
    }
  | { type: 'group_roles'; groupId: string; roles: GroupRoleMap }
  | { type: 'group_join_request'; groupId: string; fingerprint: string; name?: string }
  | {
      type: 'group_join_response';
      groupId: string;
      fingerprint: string;
      approved: boolean;
    };

export interface GroupChatManagerOptions {
  groupId: string;
  localFingerprint: string;
  members: string[];
  sendToPeer?: (peerFingerprint: string, payload: GroupPayload) => void | Promise<void>;
  onMessage?: (senderFingerprint: string, plaintext: string) => void;
  onRoles?: (senderFingerprint: string, roles: GroupRoleMap) => void;
  onJoinRequest?: (
    senderFingerprint: string,
    request: { fingerprint: string; name?: string },
  ) => void;
  onJoinResponse?: (
    senderFingerprint: string,
    response: { fingerprint: string; approved: boolean },
  ) => void;
  onError?: (error: Error, peerFingerprint?: string) => void;
}

export class GroupChatManager {
  public readonly groupId: string;
  private readonly localFingerprint: string;
  private members: string[];
  private readonly sendToPeer?: GroupChatManagerOptions['sendToPeer'];
  private readonly onMessage?: GroupChatManagerOptions['onMessage'];
  private readonly onRoles?: GroupChatManagerOptions['onRoles'];
  private readonly onJoinRequest?: GroupChatManagerOptions['onJoinRequest'];
  private readonly onJoinResponse?: GroupChatManagerOptions['onJoinResponse'];
  private readonly onError?: GroupChatManagerOptions['onError'];

  private ownState: SenderKeyState | null = null;
  private readonly remoteStates = new Map<string, SenderKeyState>();
  /** Members that already accepted our current sender key. */
  private readonly keyDelivered = new Set<string>();

  constructor(options: GroupChatManagerOptions) {
    this.groupId = options.groupId;
    this.localFingerprint = options.localFingerprint;
    this.members = [...options.members];
    this.sendToPeer = options.sendToPeer;
    this.onMessage = options.onMessage;
    this.onRoles = options.onRoles;
    this.onJoinRequest = options.onJoinRequest;
    this.onJoinResponse = options.onJoinResponse;
    this.onError = options.onError;
  }

  public getMembers(): string[] {
    return [...this.members];
  }

  public setMembers(members: string[]): void {
    this.members = [...members];
    const current = new Set(this.members);
    for (const member of this.keyDelivered) {
      if (!current.has(member)) this.keyDelivered.delete(member);
    }
  }

  public async initialize(distribute = true): Promise<void> {
    this.ownState = createSenderKey();
    this.keyDelivered.clear();
    if (distribute) {
      await this.distributeSenderKey();
    }
  }

  /**
   * Adds a member and gives them the current sender key so they can read new
   * messages immediately. Existing members are not re-keyed.
   */
  public async addMember(member: string): Promise<void> {
    if (this.members.includes(member)) return;
    this.members.push(member);
    if (!this.ownState || member === this.localFingerprint) return;
    await this.sendDistributionTo(member, this.ownState);
  }

  /**
   * Removes a member and rotates our sender key. The removed member keeps the
   * old key and can read history they already received, but not new messages.
   */
  public async removeMember(member: string): Promise<void> {
    if (!this.members.includes(member)) return;
    this.members = this.members.filter((existing) => existing !== member);
    this.remoteStates.delete(member);
    if (member === this.localFingerprint) return;
    await this.rotateSenderKey();
  }

  /** Rotates our own sender key and distributes it to all remaining members. */
  public async rotateSenderKey(): Promise<void> {
    this.ownState = createSenderKey();
    this.keyDelivered.clear();
    await this.distributeSenderKey();
  }

  private async sendDistributionTo(member: string, state: SenderKeyState): Promise<boolean> {
    const payload: GroupPayload = {
      type: 'skdm',
      groupId: this.groupId,
      distribution: createDistributionMessage(state, this.localFingerprint),
    };
    if (!this.sendToPeer) return false;
    try {
      await this.sendToPeer(member, payload);
      this.keyDelivered.add(member);
      return true;
    } catch (err) {
      this.keyDelivered.delete(member);
      this.onError?.(
        err instanceof Error ? err : new Error(String(err)),
        member,
      );
      return false;
    }
  }

  /**
   * Sends our sender key to members that have not accepted it yet. Retrying
   * missing members on every send covers a member added before the first P2P
   * session exists: their first SKDM fails with the prekey exchange, and the
   * next send delivers it before the next group frame.
   */
  public async distributeSenderKey(onlyMissing = false): Promise<void> {
    if (!this.ownState) {
      this.ownState = createSenderKey();
    }
    for (const member of this.members) {
      if (member === this.localFingerprint) continue;
      if (onlyMissing && this.keyDelivered.has(member)) continue;
      await this.sendDistributionTo(member, this.ownState);
    }
  }

  public async sendText(text: string): Promise<boolean> {
    if (!this.ownState) {
      // First send also publishes our sender key: without it every other
      // member (including a bot added before the first message) would answer
      // "No sender key" and drop the frame.
      await this.initialize(false);
    }
    await this.distributeSenderKey(true);
    if (!this.ownState) return false;

    const { message, state } = await senderKeyEncrypt(this.ownState, text);
    this.ownState = state;

    const payload: GroupPayload = {
      type: 'group_message',
      groupId: this.groupId,
      senderFingerprint: this.localFingerprint,
      message: { ...message, senderFingerprint: this.localFingerprint },
    };

    let delivered = false;
    for (const member of this.members) {
      if (member === this.localFingerprint) continue;
      try {
        await this.sendToPeer?.(member, payload);
        delivered = true;
      } catch (err) {
        this.onError?.(
          err instanceof Error ? err : new Error(String(err)),
          member,
        );
      }
    }

    // Local echo.
    this.onMessage?.(this.localFingerprint, text);
    return delivered || this.members.filter((m) => m !== this.localFingerprint).length === 0;
  }

  /** Shares the current role map with every other member (last write wins). */
  public async broadcastRoles(roles: GroupRoleMap): Promise<void> {
    const payload: GroupPayload = { type: 'group_roles', groupId: this.groupId, roles };
    for (const member of this.members) {
      if (member === this.localFingerprint) continue;
      try {
        await this.sendToPeer?.(member, payload);
      } catch (err) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)), member);
      }
    }
  }

  /**
   * Asks the group admins for membership. The inviter has no roster for this
   * device yet, so when the local member list is empty the request is still
   * handed to the transport once (peers broadcast it to whoever is in the room).
   */
  public async requestToJoin(name?: string): Promise<void> {
    const payload: GroupPayload = {
      type: 'group_join_request',
      groupId: this.groupId,
      fingerprint: this.localFingerprint,
      ...(name ? { name } : {}),
    };
    const targets = this.members.filter((member) => member !== this.localFingerprint);
    for (const target of targets.length > 0 ? targets : ['']) {
      try {
        await this.sendToPeer?.(target, payload);
      } catch (err) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)), target);
      }
    }
  }

  /** Sends an admin decision back to the device that asked to join. */
  public async respondToJoin(fingerprint: string, approved: boolean): Promise<void> {
    const payload: GroupPayload = {
      type: 'group_join_response',
      groupId: this.groupId,
      fingerprint,
      approved,
    };
    try {
      await this.sendToPeer?.(fingerprint, payload);
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)), fingerprint);
    }
  }

  public async handleIncoming(
    fromFingerprint: string,
    payload: GroupPayload,
  ): Promise<void> {
    if (payload.groupId !== this.groupId) return;

    if (payload.type === 'group_roles') {
      this.onRoles?.(fromFingerprint, payload.roles);
      return;
    }

    if (payload.type === 'group_join_request') {
      this.onJoinRequest?.(fromFingerprint, {
        fingerprint: payload.fingerprint || fromFingerprint,
        ...(payload.name ? { name: payload.name } : {}),
      });
      return;
    }

    if (payload.type === 'group_join_response') {
      this.onJoinResponse?.(fromFingerprint, {
        fingerprint: payload.fingerprint,
        approved: payload.approved,
      });
      return;
    }

    if (payload.type === 'skdm') {
      this.remoteStates.set(fromFingerprint, processDistributionMessage(payload.distribution));
      return;
    }

    if (payload.type === 'group_message') {
      const sender = payload.senderFingerprint || fromFingerprint;
      let state = this.remoteStates.get(sender);
      if (!state) {
        this.onError?.(new Error(`No sender key for ${sender}`), sender);
        return;
      }
      try {
        const { plaintext, state: updated } = await senderKeyDecrypt(
          state,
          payload.message,
        );
        this.remoteStates.set(sender, updated);
        this.onMessage?.(sender, plaintext);
      } catch (err) {
        this.onError?.(
          err instanceof Error ? err : new Error(String(err)),
          sender,
        );
      }
    }
  }

  public hasSenderKey(senderFingerprint: string): boolean {
    return this.remoteStates.has(senderFingerprint);
  }

  public getOwnState(): SenderKeyState | null {
    return this.ownState;
  }
}
