import { beforeEach, describe, expect, it } from 'vitest';
import type { InstalledBot } from './runtime';
import {
  BOT_GROUP_PEERS_KEY,
  botPeerFingerprints,
  loadBotGroupPeers,
  registerBotGroupPeer,
  syncBotGroupPeers,
  unregisterBotGroupPeer,
} from './groupPeers';

function bot(id: string, peerFingerprint?: string): InstalledBot {
  return {
    manifest: {
      id,
      name: id,
      username: `${id}_bot`,
      version: '1.0.0',
      commands: [],
      requestedPermissions: [],
    },
    grantedPermissions: [],
    installedAt: 0,
    enabled: true,
    peerFingerprint,
  };
}

describe('bot group peers', () => {
  beforeEach(() => localStorage.clear());

  it('registers only members whose fingerprint belongs to an installed bot', () => {
    const bots = [bot('gw', 'gw_fp_0001'), bot('local')];

    expect(registerBotGroupPeer('group1', 'human_fp_01', bots)).toEqual([]);
    expect(registerBotGroupPeer('group1', 'gw_fp_0001', bots)).toEqual(['gw_fp_0001']);
    expect(registerBotGroupPeer('group1', 'gw_fp_0001', bots)).toEqual(['gw_fp_0001']);
    expect(loadBotGroupPeers('group1')).toEqual(['gw_fp_0001']);
    expect(loadBotGroupPeers('group2')).toEqual([]);
  });

  it('removes a member from the roster and cleans up empty groups', () => {
    const bots = [bot('gw', 'gw_fp_0001')];
    registerBotGroupPeer('group1', 'gw_fp_0001', bots);

    expect(unregisterBotGroupPeer('group1', 'gw_fp_0001')).toEqual([]);
    expect(JSON.parse(localStorage.getItem(BOT_GROUP_PEERS_KEY) ?? '{}')).toEqual({});
  });

  it('drops bots that were uninstalled or left the group', () => {
    const bots = [bot('gw', 'gw_fp_0001'), bot('gw2', 'gw_fp_0002')];
    registerBotGroupPeer('group1', 'gw_fp_0001', bots);
    registerBotGroupPeer('group1', 'gw_fp_0002', bots);

    expect(syncBotGroupPeers('group1', ['gw_fp_0001', 'human'], bots)).toEqual(['gw_fp_0001']);
    expect(syncBotGroupPeers('group1', ['gw_fp_0001', 'gw_fp_0002'], [bot('gw')])).toEqual([]);
  });

  it('never treats a local bot without a mesh identity as a peer', () => {
    expect(botPeerFingerprints([bot('local')]).size).toBe(0);
    expect(registerBotGroupPeer('group1', 'local', [bot('local')])).toEqual([]);
  });
});
