/**
 * Group member roles, stored on-device per group.
 *
 * A group starts with the local device as its admin. Admins can add and remove
 * members, promote others, and rotate the invite link; plain members can only
 * read the roster. Roles are local bookkeeping — sender keys still guard the
 * messages themselves.
 */

export type GroupRole = 'admin' | 'member';

export type GroupRoles = Record<string, GroupRole>;

const ROLES_KEY_PREFIX = 'nova_group_roles_';

function storageKey(chatId: string): string {
  return `${ROLES_KEY_PREFIX}${chatId}`;
}

function sanitize(value: unknown): GroupRoles {
  if (typeof value !== 'object' || value === null) return {};
  const roles: GroupRoles = {};
  for (const [member, role] of Object.entries(value as Record<string, unknown>)) {
    if (!member) continue;
    if (role === 'admin' || role === 'member') roles[member] = role;
  }
  return roles;
}

export function loadGroupRoles(chatId: string): GroupRoles {
  try {
    const raw = localStorage.getItem(storageKey(chatId));
    if (!raw) return {};
    return sanitize(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveGroupRoles(chatId: string, roles: GroupRoles): void {
  try {
    localStorage.setItem(storageKey(chatId), JSON.stringify(roles));
  } catch {
    /* storage unavailable: roles stay in memory for this session */
  }
}

/**
 * Returns the stored roles, seeding the local device as admin the first time a
 * group is opened.
 */
export function ensureGroupRoles(chatId: string, localFingerprint: string): GroupRoles {
  const stored = loadGroupRoles(chatId);
  if (stored[localFingerprint] === 'admin') return stored;
  if (Object.keys(stored).length > 0) return stored;
  const seeded: GroupRoles = { [localFingerprint]: 'admin' };
  saveGroupRoles(chatId, seeded);
  return seeded;
}

export function setMemberRole(chatId: string, member: string, role: GroupRole): GroupRoles {
  const roles: GroupRoles = { ...loadGroupRoles(chatId), [member]: role };
  saveGroupRoles(chatId, roles);
  return roles;
}

export function removeMemberRole(chatId: string, member: string): GroupRoles {
  const roles: GroupRoles = { ...loadGroupRoles(chatId) };
  delete roles[member];
  saveGroupRoles(chatId, roles);
  return roles;
}

export function isGroupAdmin(roles: GroupRoles, fingerprint: string | null | undefined): boolean {
  return Boolean(fingerprint) && roles[fingerprint as string] === 'admin';
}

export function getMemberRole(roles: GroupRoles, member: string): GroupRole {
  return roles[member] === 'admin' ? 'admin' : 'member';
}

/**
 * Merges roles received from another device of the same account.
 *
 * Members only present locally are kept, and the remote map wins on conflicts
 * so that a promotion or demotion made on one device reaches the others. The
 * result is returned as a new object and persisted for the group.
 */
export function mergeGroupRoles(chatId: string, local: GroupRoles, remote: unknown): GroupRoles {
  const incoming = sanitize(remote);
  const merged: GroupRoles = { ...local, ...incoming };
  saveGroupRoles(chatId, merged);
  return merged;
}
