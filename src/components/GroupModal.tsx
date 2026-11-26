import React, { useState, useCallback, useEffect } from 'react';
import {
  useLanguage } from '../context/LanguageContext';
import { useFocusTrap } from '../lib/ui/useFocusTrap';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import {IconX as X,
  IconCheck as Check,
  IconUsers as Users,
  IconUserPlus as UserPlus,
  IconUserMinus as UserMinus,
  IconCrown as Crown,
  IconShield as Shield,
  IconSettings as Settings,
  IconTrashX as Trash2,
  IconTrash as Trash,
  IconUserX as UserX,
  IconSend as Send,
  IconMessageCircle as MessageCircle,
  IconKey as Key,
  IconRotate as Rotate,
  IconTrash as TrashX,
} from '@tabler/icons-react';
import {
  createGroupSession,
  rotateGroupSession,
  distributeGroupSession,
  sendEncryptedGroupMessage,
  type GroupSession} from '../lib/anon/groups';
import { createAnonTransport } from '../lib/anon/transport';
import { InMemoryAnonRelay } from '../lib/anon/relay';
import { x25519 } from '@noble/curves/ed25519.js';
import { LazyMedia } from './LazyMedia';

interface GroupMember {
  memberId: string;
  queueId: string;
  tokens: any;
  signingKey: any;
  privateKey: string;
  invite: {
    v: 1;
    relayUrl: string;
    queueId: string;
    senderToken: string;
    signingKey: any;
    recipientPublicKey: string;
    inviteToken: string;
    expiresAt: number;
  };
  displayName?: string;
  avatar?: string;
  isAdmin?: boolean;
  isSelf?: boolean;
}

interface GroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated?: (groupId: string) => void;
  existingGroup?: {
    id: string;
    name: string;
    session: any;
    members: any[];
    relayUrl: string;
  } | null;
}

const relay = new InMemoryAnonRelay();

function generateMemberInvite(): GroupMember {
  const { queueId, tokens, signingKey, inviteToken } = relay.createQueue();
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  return {
    memberId: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queueId,
    tokens,
    signingKey,
    privateKey: b64(secret),
    invite: {
      v: 1 as const,
      relayUrl: 'http://localhost',
      queueId,
      senderToken: tokens.senderToken,
      signingKey,
      recipientPublicKey: b64(publicKey),
      inviteToken,
      expiresAt: Date.now() + 60_000,
    },
    displayName: 'New Member',
    avatar: `https://ui-avatars.com/api/?name=Member${Math.random().toString(36).slice(2, 6)}`,
    isAdmin: false,
    isSelf: false,
  };
}

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export const GroupModal: React.FC<GroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
  existingGroup,
}) => {
  const { t } = useLanguage();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  const { encryptAndSendMessage, identity } = useSecurity();
  const { account } = useAccount();

  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'members'>(existingGroup ? 'members' : 'create');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [members, setMembers] = useState<GroupMember[]>(existingGroup?.members || []);
  const [session, setSession] = useState<GroupSession | null>(existingGroup?.session || null);
  const [relayUrl, setRelayUrl] = useState(existingGroup?.relayUrl || 'http://localhost');
  const [groupId, setGroupId] = useState(existingGroup?.id || '');
  const [isCreating, setIsCreating] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const transport = createAnonTransport({ relayUrl });

  // Initialize with some test members if creating new
  useEffect(() => {
    if (activeTab === 'create' && members.length === 0 && !existingGroup) {
      // Add self as first member
      const self = generateMemberInvite();
      self.displayName = account?.displayName || 'You';
      self.avatar = account?.avatar;
      self.isSelf = true;
      self.isAdmin = true;
      setMembers([self]);
      // Add a couple test members
      const bob = generateMemberInvite();
      bob.displayName = 'Bob';
      bob.avatar = 'https://ui-avatars.com/api/?name=Bob';
      const carol = generateMemberInvite();
      carol.displayName = 'Carol';
      carol.avatar = 'https://ui-avatars.com/api/?name=Carol';
      setMembers([self, bob, carol]);
    }
  }, [activeTab, existingGroup]);

  const handleCreateGroup = async () => {
    if (!groupName.trim() || members.length < 2) {
      setErrorMsg('Need at least 2 members and a name');
      return;
    }
    setIsCreating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const memberQueueIds = members.map(m => m.invite.queueId);
      const newSession = await createGroupSession(memberQueueIds);
      setSession(newSession);
      setGroupId(`g_${Date.now()}`);
      setSuccessMsg(`Group "${groupName}" created!`);
      
      // Distribute keys to all members
      setIsDistributing(true);
      const result = await distributeGroupSession(
        () => transport,
        members.map(m => ({ memberId: m.memberId, invite: m.invite })),
        newSession
      );
      setIsDistributing(false);
      
      if (result.failed.length > 0) {
        setErrorMsg(`Failed to distribute keys to: ${result.failed.join(', ')}`);
      } else {
        setSuccessMsg(`Group created and keys distributed to ${result.delivered.length} members!`);
        
        // Save to localStorage
        const groupData = {
          id: groupId,
          name: groupName,
          relayUrl,
          session: newSession,
          members: members.map(m => ({
            ...m,
            isAdmin: m.isSelf || m.isAdmin,
          })),
        };
        localStorage.setItem(`anon_group_${groupId}`, JSON.stringify(groupData));
        
        if (onGroupCreated) onGroupCreated(groupId);
        setActiveTab('members');
      }
    } catch (err) {
      setErrorMsg(`Failed to create group: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMember = () => {
    const newMember = generateMemberInvite();
    newMember.displayName = `Member ${members.length + 1}`;
    newMember.avatar = `https://ui-avatars.com/api/?name=Member${members.length + 1}`;
    setMembers([...members, newMember]);
  };

  const handleRemoveMember = async (memberId: string) => {
    const memberToRemove = members.find(m => m.memberId === memberId);
    if (!memberToRemove || memberToRemove.isSelf) return;
    
    setIsRotating(true);
    try {
      const remainingMembers = members.filter(m => m.memberId !== memberId);
      const newSession = await rotateGroupSession(session!, remainingMembers.map(m => m.invite.queueId));
      
      // Distribute new key
      const result = await distributeGroupSession(
        () => transport,
        remainingMembers.map(m => ({ memberId: m.memberId, invite: m.invite })),
        newSession
      );
      
      setSession(newSession);
      setMembers(remainingMembers.map(m => ({
        ...m,
        isAdmin: m.isAdmin || m.isSelf,
      })));
      
      // Update stored group
      const groupData = {
        id: groupId,
        name: groupName,
        relayUrl,
        session: newSession,
        members: remainingMembers.map(m => ({
          ...m,
          isAdmin: m.isAdmin || m.isSelf,
        })),
      };
      localStorage.setItem(`anon_group_${groupId}`, JSON.stringify(groupData));
      
      setSuccessMsg('Member removed and key rotated!');
    } catch (err) {
      setErrorMsg(`Failed to remove member: ${err}`);
    } finally {
      setIsRotating(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || !session) return;
    
    try {
      await sendEncryptedGroupMessage(
        transport,
        members.map(m => ({ memberId: m.memberId, invite: m.invite })),
        session,
        message
      );
      setSuccessMsg('Message sent!');
    } catch (err) {
      setErrorMsg(`Failed to send: ${err}`);
    }
  };

  const handleRotateKey = async () => {
    setIsRotating(true);
    try {
      const newSession = await rotateGroupSession(session!, members.map(m => m.invite.queueId));
      const result = await distributeGroupSession(
        () => transport,
        members.map(m => ({ memberId: m.memberId, invite: m.invite })),
        newSession
      );
      setSession(newSession);
      setSuccessMsg(`Key rotated! Distributed to ${result.delivered.length} members.`);
    } catch (err) {
      setErrorMsg(`Failed to rotate key: ${err}`);
    } finally {
      setIsRotating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      onClick={() => onClose()}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--nova-surface-raised)] border border-[var(--nova-border-subtle)] rounded-3xl p-5 max-w-2xl w-full max-h-[90vh] shadow-2xl animate-in slide-in-from-bottom-2"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-[var(--nova-text-primary)]">
            {existingGroup ? 'Group Settings' : 'Create Group'}
          </h3>
          <button
            onClick={() => { setErrorMsg(''); setSuccessMsg(''); onClose(); }}
            className="p-1 rounded-lg text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-surface-high)]"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="text-red-400 text-sm mb-3 p-2 bg-red-500/10 rounded-lg" role="alert">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="text-emerald-400 text-sm mb-3 p-2 bg-emerald-500/10 rounded-lg" role="status">
            {successMsg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--nova-border-subtle)] mb-4">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === 'create'
                ? 'border-[var(--nova-accent-color)] text-[var(--nova-accent-color)]'
                : 'border-transparent text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]'
            }`}
            disabled={!!existingGroup}
          >
            {existingGroup ? t('group.settings') : t('group.create')}
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === 'members'
                ? 'border-[var(--nova-accent-color)] text-[var(--nova-accent-color)]'
                : 'border-transparent text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]'
            }`}
            disabled={!session}
          >
            {t('group.members')}
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === 'manage'
                ? 'border-[var(--nova-accent-color)] text-[var(--nova-accent-color)]'
                : 'border-transparent text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)]'
            }`}
            disabled={!session}
          >
            {t('group.manage')}
          </button>
        </div>

        {/* Create Tab */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--nova-text-secondary)] mb-1">
                {t('group.name')}
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] text-sm rounded-xl px-3 py-2.5 border border-[var(--nova-border-subtle)] focus:border-[var(--nova-accent-color)] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--nova-text-secondary)] mb-1">
                {t('group.relayUrl')}
              </label>
              <input
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="http://relay.example"
                className="w-full bg-[var(--nova-surface-high)] text-[var(--nova-text-primary)] text-sm rounded-xl px-3 py-2.5 border border-[var(--nova-border-subtle)] focus:border-[var(--nova-accent-color)] outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--nova-text-secondary)]">
                  {t('group.members')} ({members.length})
                </label>
                <button
                  onClick={handleAddMember}
                  className="px-2 py-1 text-xs font-medium text-[var(--nova-accent-color)] hover:text-[var(--nova-accent-color)]/80"
                >
                  <UserPlus className="w-3.5 h-3.5 inline mr-1" /> {t('group.addMember')}
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {members.map((member) => (
                  <label key={member.memberId} className="flex items-center gap-2 text-sm text-[var(--nova-text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!member.isSelf}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Already in members array
                        }
                      }}
                      disabled={member.isSelf}
                    />
                    <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                      {member.avatar ? (
                        <LazyMedia src={member.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold">{member.displayName?.charAt(0)}</span>
                      )}
                    </div>
                    <span className="truncate flex-1">{member.displayName}</span>
                    {member.isSelf && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] rounded">
                        {t('group.you')}
                      </span>
                    )}
                    {member.isAdmin && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                        <Crown className="w-3 h-3 inline mr-0.5" /> {t('group.admin')}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreateGroup}
                disabled={isCreating || !groupName.trim() || members.length < 2}
                className="flex-1 py-2.5 bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] font-semibold text-sm rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : t('group.create')}
              </button>
              <button
                onClick={() => { setErrorMsg(''); setSuccessMsg(''); onClose(); }}
                className="flex-1 py-2.5 bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] font-semibold text-sm rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && session && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm text-[var(--nova-text-secondary)]">
                {t('group.members')} ({members.length})
              </h4>
              <button
                onClick={handleAddMember}
                className="px-3 py-1.5 text-xs font-medium text-[var(--nova-accent-color)] hover:text-[var(--nova-accent-color)]/80 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" /> {t('group.addMember')}
              </button>
            </div>

            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.memberId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--nova-surface-high)] border border-[var(--nova-border-subtle)]"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
                    {member.avatar ? (
                      <LazyMedia src={member.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold">{member.displayName?.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[var(--nova-text-primary)] truncate">
                      {member.displayName}
                      {member.isSelf && <span className="ml-1 text-xs text-[var(--nova-accent-color)]">({t('group.you')})</span>}
                    </p>
                    <p className="text-xs text-[var(--nova-text-muted)] truncate">
                      {member.invite.queueId.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {member.isAdmin && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded flex items-center gap-1">
                        <Crown className="w-3 h-3" /> {t('group.admin')}
                      </span>
                    )}
                    {!member.isSelf && (
                      <button
                        onClick={() => handleRemoveMember(member.memberId)}
                        disabled={isRotating}
                        className="p-1.5 rounded-lg text-[var(--nova-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                        aria-label={t('group.removeMember')}
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                    {member.isSelf && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] rounded">
                        {t('group.you')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {session && (
              <div className="pt-4 border-t border-[var(--nova-border-subtle)]">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm text-[var(--nova-text-secondary)]">
                    {t('group.session')}
                  </h4>
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-[var(--nova-accent-color)]/20 text-[var(--nova-accent-color)] rounded">
                    v{session.version} • {session.members.length} members
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleRotateKey}
                    disabled={isRotating}
                    className="flex-1 py-2 bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] font-semibold text-sm rounded-xl transition disabled:opacity-50"
                  >
                    {isRotating ? 'Rotating...' : t('group.rotateKey')}
                  </button>
                  <button
                    onClick={() => handleSendMessage('Test message')}
                    className="flex-1 py-2 bg-[var(--nova-accent-color)] text-[var(--nova-on-accent)] font-semibold text-sm rounded-xl transition"
                  >
                    {t('group.sendTestMessage')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manage Tab */}
        {activeTab === 'manage' && session && (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm text-[var(--nova-text-secondary)] mb-2">
                {t('group.dangerZone')}
              </h4>
              <button
                onClick={() => {
                  if (confirm(t('group.confirmDelete'))) {
                    localStorage.removeItem(`anon_group_${groupId}`);
                    onClose();
                  }
                }}
                className="w-full py-2 bg-red-500/20 text-red-400 font-semibold text-sm rounded-xl transition hover:bg-red-500/30"
              >
                <TrashX className="w-4 h-4 inline mr-2" />
                {t('group.deleteGroup')}
              </button>
            </div>

            <div>
              <h4 className="font-medium text-sm text-[var(--nova-text-secondary)] mb-2">
                {t('group.exportImport')}
              </h4>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const groupData = localStorage.getItem(`anon_group_${groupId}`);
                    if (groupData) {
                      navigator.clipboard.writeText(groupData);
                      setSuccessMsg('Group data copied to clipboard!');
                    }
                  }}
                  className="w-full py-2 bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] font-semibold text-sm rounded-xl transition"
                >
                  <Key className="w-4 h-4 inline mr-2" /> {t('group.exportKey')}
                </button>
                <button
                  onClick={() => {
                    const text = prompt(t('group.importPrompt'));
                    if (text) {
                      try {
                        localStorage.setItem(`anon_group_${groupId}`, text);
                        setSuccessMsg('Group imported!');
                      } catch {
                        setErrorMsg('Invalid group data');
                      }
                    }
                  }}
                  className="w-full py-2 bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] font-semibold text-sm rounded-xl transition"
                >
                  <Send className="w-4 h-4 inline mr-2" /> {t('group.importKey')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!existingGroup && !session && (
          <div className="pt-4 border-t border-[var(--nova-border-subtle)]">
            <p className="text-xs text-[var(--nova-text-muted)] text-center">
              {t('group.p2pNote')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupModal;





















