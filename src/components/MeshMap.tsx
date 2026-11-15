import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mesh-map.css';
import {
  DEMO_MESH_NODES,
  DEMO_MESH_LINKS,
  MESH_NODE_STATUSES,
  type MeshNode,
  type MeshLink,
  type MeshNodeStatus,
  type MeshLinkType,
} from './meshDemoData';
import { saveLastGpsFix } from '../lib/p2p/meshMapNodes';
import { useLanguage } from '../context/LanguageContext';

/** Keeps the viewport on the current real nodes when they change. */
function FitBounds({ bounds }: { bounds?: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
  }, [bounds, map]);
  return null;
}

/**
 * Tracks browser online/offline state (network online + offline events).
 * The OSM TileLayer is mounted only while online; when offline the map
 * keeps its dark background and markers/polylines remain visible.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  useEffect(() => {
    const set = (isOnline: boolean) => setOnline(isOnline);
    window.addEventListener('online', () => set(true));
    window.addEventListener('offline', () => set(false));
    return () => {
      window.removeEventListener('online', () => set(true));
      window.removeEventListener('offline', () => set(false));
    };
  }, []);
  return online;
}

const STATUS_COLORS: Record<MeshNodeStatus, string> = {
  online: '#10b981',
  relaying: '#f59e0b',
  connecting: '#3b82f6',
  offline: '#6b7280',
};

const LINK_COLORS: Record<MeshLinkType, string> = {
  direct: '#10b981',
  relay: '#f59e0b',
  blocked: '#ef4444',
};

function makeIcon(status: MeshNodeStatus, demo: boolean) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const html = demo
    ? `<div style="display:flex;align-items:center;gap:4px;">
         <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 8px ${color};"></div>
         <div style="font-size:9px;font-weight:700;color:#fff;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.4);border-radius:4px;padding:1px 3px;letter-spacing:0.5px;">DEMO</div>
       </div>`
    : `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 8px ${color};"></div>`;
  return L.divIcon({
    className: 'mesh-node-marker',
    html,
    iconSize: demo ? [44, 14] : [14, 14],
    iconAnchor: [7, 7],
  });
}

export interface MeshMapProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  /** Real (live) P2P nodes. When provided and non-empty, demo data is hidden. */
  nodes?: MeshNode[];
  /** Real (live) mesh links. Pairs with `nodes`. */
  links?: MeshLink[];
  /** Set to `false` to suppress the demo fallback even when no live nodes exist. */
  showDemo?: boolean;
}

export const MeshMap: React.FC<MeshMapProps> = ({
  width = '100%',
  height = '100%',
  className,
  nodes,
  links,
  showDemo,
}) => {
  const { t } = useLanguage();
  const online = useOnline();
  // Real nodes only by default: the sample topology is an explicit opt-in, so
  // an empty map always means "no live peers", never fake data.
  const [demoEnabled, setDemoEnabled] = useState(showDemo === true);
  const [locating, setLocating] = useState(false);
  // One passive GPS fix per mount so the device's own node is at the real
  // position when permission was already granted; never prompts on its own.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveLastGpsFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp || Date.now(),
        });
      },
      () => undefined,
      { timeout: 5_000, maximumAge: 60_000 },
    );
  }, []);
  const liveNodes = useMemo(() => nodes ?? [], [nodes]);
  const liveLinks = useMemo(() => links ?? [], [links]);
  const hasLive = liveNodes.length > 0;
  const demoNodes = hasLive || !demoEnabled ? [] : DEMO_MESH_NODES;
  const demoLinks = hasLive || !demoEnabled ? [] : DEMO_MESH_LINKS;
  const allNodes = [...liveNodes, ...demoNodes];
  const allLinks = [...liveLinks, ...demoLinks];

  const center = useMemo<[number, number] | null>(() => {
    if (allNodes.length === 0) return null;
    const lats = allNodes.map((n) => n.lat);
    const lngs = allNodes.map((n) => n.lng);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  }, [allNodes]);

  const bounds = useMemo(() => {
    if (allNodes.length === 0) return undefined;
    const lats = allNodes.map((n) => n.lat);
    const lngs = allNodes.map((n) => n.lng);
    return [
      [Math.min(...lats) - 2, Math.min(...lngs) - 2],
      [Math.max(...lats) + 2, Math.max(...lngs) + 2],
    ] as [[number, number], [number, number]];
  }, [allNodes]);

  const fallbackCenter: [number, number] = [48.5, 134.5];
  const mapCenter = center ?? fallbackCenter;

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveLastGpsFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp || Date.now(),
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }, []);

  return (
    <div
      className={className}
      style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height, position: 'relative' }}
    >
      <MapContainer
        center={mapCenter}
        zoom={5}
        bounds={bounds}
        style={{ width: '100%', height: '100%', borderRadius: '12px', background: '#151722' }}
        scrollWheelZoom
        zoomControl
        attributionControl={false}
      >
        <FitBounds bounds={bounds} />
        {online ? (
          <TileLayer
            key="osm"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            minZoom={4}
          />
        ) : null}
        {allLinks.map((link) => {
          const from = allNodes.find((n) => n.id === link.from);
          const to = allNodes.find((n) => n.id === link.to);
          if (!from || !to) return null;
          return (
            <Polyline
              key={link.id}
              positions={[
                [from.lat, from.lng],
                [to.lat, to.lng],
              ]}
              color={LINK_COLORS[link.type]}
              weight={link.type === 'direct' ? 2 : 1.5}
              opacity={link.type === 'blocked' ? 0.35 : 0.6}
              dashArray={link.type === 'blocked' ? '6,4' : link.type === 'relay' ? '4,4' : undefined}
            />
          );
        })}
        {allNodes.map((node) => (
          <Marker key={node.id} position={[node.lat, node.lng]} icon={makeIcon(node.status, node.demo === true)}>
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{node.label}</strong>
                {node.demo ? (
                  <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: '#f59e0b' }}>DEMO</span>
                ) : null}
                <br />
                status: {node.status}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(11,12,16,0.85)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11,
          color: '#fff',
          zIndex: 1000,
        }}
      >
        {MESH_NODE_STATUSES.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[s], display: 'inline-block' }} />
            {s}
          </div>
        ))}
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(255,78,24,0.25)',
              border: '1px solid rgba(255,78,24,0.5)',
              borderRadius: 6,
              padding: '3px 6px',
              cursor: locating ? 'wait' : 'pointer',
              opacity: locating ? 0.6 : 1,
            }}
          >
            {locating ? '…' : t('meshMap.locateMe')}
          </button>
          <button
            type="button"
            onClick={() => setDemoEnabled((on) => !on)}
            style={{
              fontSize: 9.5,
              color: 'rgba(255,255,255,0.65)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 6,
              padding: '3px 6px',
              cursor: 'pointer',
            }}
          >
            {demoEnabled ? t('meshMap.hideSample') : t('meshMap.showSample')}
          </button>
          {!hasLive && !demoEnabled && (
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', maxWidth: 150 }}>
              {t('meshMap.noPeers')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeshMap;
