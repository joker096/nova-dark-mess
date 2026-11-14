/**
 * Demo mesh topology (Russian Far East) shown on the mesh map.
 *
 * IMPORTANT: every node/link in this file is STATIC demo data — it is not
 * backed by any live P2P node, GPS position or WebRTC channel. Real nodes
 * are supplied to <MeshMap> through its `nodes` / `links` props instead.
 * The `demo: true` flag is rendered as a "DEMO" badge so the user can tell
 * the sample topology apart from real traffic.
 */

export interface MeshNode {
  id: string;
  lat: number;
  lng: number;
  label: string;
  status: MeshNodeStatus;
  /** Marks nodes that are static demo samples rather than live P2P peers. */
  demo?: boolean;
}

export type MeshNodeStatus = 'online' | 'relaying' | 'connecting' | 'offline';

export interface MeshLink {
  id: string;
  from: string;
  to: string;
  type: MeshLinkType;
  demo?: boolean;
}

export type MeshLinkType = 'direct' | 'relay' | 'blocked';

export const MESH_NODE_STATUSES: MeshNodeStatus[] = [
  'online',
  'relaying',
  'connecting',
  'offline',
];

export const DEMO_MESH_NODES: MeshNode[] = [
  { id: 'demo-khabarovsk', lat: 48.4814, lng: 135.0756, label: 'Khabarovsk', status: 'online', demo: true },
  { id: 'demo-vladivostok', lat: 43.1155, lng: 131.8855, label: 'Vladivostok', status: 'online', demo: true },
  { id: 'demo-volgochevsk', lat: 47.5, lng: 134.0, label: 'Volgochevsk-2', status: 'relaying', demo: true },
  { id: 'demo-dokuchaevsk', lat: 48.08, lng: 134.9, label: 'Dokuchaevsk', status: 'offline', demo: true },
  { id: 'demo-blagoveshensk', lat: 50.2484, lng: 127.5272, label: 'Blagoveshensk', status: 'connecting', demo: true },
  { id: 'demo-salgan', lat: 49.5, lng: 128.5, label: 'Salgan', status: 'online', demo: true },
  { id: 'demo-elan', lat: 50.0, lng: 129.0, label: 'Elan', status: 'offline', demo: true },
  { id: 'demo-khomutov', lat: 49.6, lng: 126.5, label: 'Khomutov', status: 'connecting', demo: true },
  { id: 'demo-sakhalin', lat: 47.0, lng: 142.5, label: 'Sakhalin', status: 'offline', demo: true },
];

export const DEMO_MESH_LINKS: MeshLink[] = [
  { id: 'demo-l1', from: 'demo-khabarovsk', to: 'demo-vladivostok', type: 'direct', demo: true },
  { id: 'demo-l2', from: 'demo-khabarovsk', to: 'demo-volgochevsk', type: 'direct', demo: true },
  { id: 'demo-l3', from: 'demo-volgochevsk', to: 'demo-dokuchaevsk', type: 'relay', demo: true },
  { id: 'demo-l4', from: 'demo-vladivostok', to: 'demo-salgan', type: 'direct', demo: true },
  { id: 'demo-l5', from: 'demo-salgan', to: 'demo-blagoveshensk', type: 'direct', demo: true },
  { id: 'demo-l6', from: 'demo-salgan', to: 'demo-elan', type: 'relay', demo: true },
  { id: 'demo-l7', from: 'demo-blagoveshensk', to: 'demo-khomutov', type: 'direct', demo: true },
  { id: 'demo-l8', from: 'demo-khomutov', to: 'demo-sakhalin', type: 'blocked', demo: true },
];
