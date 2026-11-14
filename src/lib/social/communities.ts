/**
 * Communities: a channel paired with a linked discussion group, moderated
 * locally by admins.
 */

export interface Community {
  id: string;
  name: string;
  channelId: string;
  discussionGroupId: string;
  adminFingerprints: string[];
  createdAt: number;
}

export interface CommunityStore {
  communities: Community[];
}

const STORAGE_KEY = 'nova_communities';

function readStore(): CommunityStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { communities: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.communities)) return { communities: [] };
    return parsed as CommunityStore;
  } catch {
    return { communities: [] };
  }
}

function writeStore(store: CommunityStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function createCommunity(
  name: string,
  channelId: string,
  discussionGroupId: string,
  adminFingerprints: string[],
): Community {
  const community: Community = {
    id: `community-${Date.now()}`,
    name,
    channelId,
    discussionGroupId,
    adminFingerprints: [...adminFingerprints],
    createdAt: Date.now(),
  };
  const store = readStore();
  store.communities.push(community);
  writeStore(store);
  return community;
}

export function listCommunities(): Community[] {
  return readStore().communities;
}

export function getCommunity(id: string): Community | undefined {
  return readStore().communities.find((c) => c.id === id);
}

export type CommunityPatch = Partial<
  Pick<Community, 'name' | 'channelId' | 'discussionGroupId' | 'adminFingerprints'>
>;

export function updateCommunity(id: string, patch: CommunityPatch): Community | undefined {
  const store = readStore();
  const index = store.communities.findIndex((community) => community.id === id);
  if (index === -1) return undefined;

  const current = store.communities[index];
  const next: Community = {
    ...current,
    ...patch,
    id: current.id,
    name: (patch.name ?? current.name).trim() || current.name,
    adminFingerprints: patch.adminFingerprints ? [...patch.adminFingerprints] : current.adminFingerprints,
  };
  store.communities[index] = next;
  writeStore(store);
  return next;
}

export function deleteCommunity(id: string): boolean {
  const store = readStore();
  const next = store.communities.filter((community) => community.id !== id);
  if (next.length === store.communities.length) return false;
  writeStore({ communities: next });
  return true;
}

export function isAdmin(community: Community, fingerprint: string): boolean {
  return community.adminFingerprints.includes(fingerprint);
}
