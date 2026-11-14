import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCommunity,
  deleteCommunity,
  getCommunity,
  isAdmin,
  listCommunities,
  updateCommunity,
} from './communities';

describe('communities', () => {
  beforeEach(() => localStorage.clear());

  it('creates and lists communities', () => {
    const community = createCommunity('Nova', 'chan-1', 'group-1', ['fp-admin']);
    expect(community.name).toBe('Nova');
    expect(listCommunities()).toHaveLength(1);
    expect(getCommunity(community.id)?.channelId).toBe('chan-1');
  });

  it('updates the name, channel and discussion group', () => {
    const community = createCommunity('Nova', 'chan-1', 'group-1', ['fp-admin']);
    const updated = updateCommunity(community.id, {
      name: '  Nova Guild  ',
      channelId: 'chan-2',
      discussionGroupId: 'group-2',
    });

    expect(updated?.name).toBe('Nova Guild');
    expect(getCommunity(community.id)?.channelId).toBe('chan-2');
    expect(getCommunity(community.id)?.discussionGroupId).toBe('group-2');
    expect(updated?.adminFingerprints).toEqual(['fp-admin']);
    expect(updateCommunity('missing', { name: 'x' })).toBeUndefined();
  });

  it('deletes a community and reports unknown ids', () => {
    const community = createCommunity('Nova', 'chan-1', 'group-1', ['fp-admin']);
    expect(deleteCommunity(community.id)).toBe(true);
    expect(listCommunities()).toHaveLength(0);
    expect(deleteCommunity(community.id)).toBe(false);
  });

  it('checks admin membership', () => {
    const community = createCommunity('Nova', 'chan-1', 'group-1', ['fp-admin']);
    expect(isAdmin(community, 'fp-admin')).toBe(true);
    expect(isAdmin(community, 'fp-user')).toBe(false);
  });
});
