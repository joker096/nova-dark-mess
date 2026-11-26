import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {IconActivity as Activity, IconGlobe as Globe, IconShieldExclamation as ShieldExclamation, IconShieldHeart as ShieldHeart, IconLink as Link, IconMinus as Minus, IconPlus as Plus} from '@tabler/icons-react';

export interface MeshNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: 'online' | 'offline' | 'relaying' | 'connecting';
  hops: number;
  latency: number;
  isLocal: boolean;
}

export interface MeshLink {
  id: string;
  from: string;
  to: string;
  status: 'active' | 'idle' | 'blocked';
  latency: number;
  bytesPerSecond: number;
}

interface MeshRadarProps {
  className?: string;
  nodes?: MeshNode[];
  links?: MeshLink[];
  autoAnimate?: boolean;
}

const DEFAULT_NODES: MeshNode[] = [
  { id: 'local', label: 'You', x: 300, y: 300, status: 'online', hops: 0, latency: 5, isLocal: true },
  { id: 'node-1', label: 'Node Alpha', x: 450, y: 200, status: 'online', hops: 1, latency: 24, isLocal: false },
  { id: 'node-2', label: 'Node Beta', x: 420, y: 420, status: 'relaying', hops: 1, latency: 31, isLocal: false },
  { id: 'node-3', label: 'Node Gamma', x: 600, y: 280, status: 'online', hops: 2, latency: 45, isLocal: false },
  { id: 'node-4', label: 'Node Delta', x: 150, y: 450, status: 'offline', hops: 3, latency: 999, isLocal: false },
  { id: 'node-5', label: 'Node Epsilon', x: 520, y: 480, status: 'connecting', hops: 2, latency: 120, isLocal: false },
];

const DEFAULT_LINKS: MeshLink[] = [
  { id: 'l1', from: 'local', to: 'node-1', status: 'active', latency: 24, bytesPerSecond: 12500 },
  { id: 'l2', from: 'local', to: 'node-2', status: 'active', latency: 31, bytesPerSecond: 8900 },
  { id: 'l3', from: 'node-1', to: 'node-3', status: 'active', latency: 45, bytesPerSecond: 6200 },
  { id: 'l4', from: 'node-2', to: 'node-5', status: 'idle', latency: 120, bytesPerSecond: 1200 },
  { id: 'l5', from: 'node-1', to: 'node-4', status: 'blocked', latency: 999, bytesPerSecond: 0 },
  { id: 'l6', from: 'node-3', to: 'node-5', status: 'active', latency: 38, bytesPerSecond: 4100 },
];

const STATUS_COLORS: Record<string, string> = {
  online: '#10b981',
  offline: '#6b7280',
  relaying: '#f59e0b',
  connecting: '#3b82f6',
};

const LINK_COLORS: Record<string, string> = {
  active: '#10b981',
  idle: '#94a3b8',
  blocked: '#ef4444',
};

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 4) / 4));

export const MeshRadar: React.FC<MeshRadarProps> = ({
  className = '',
  nodes: propsNodes,
  links: propsLinks,
  autoAnimate = true,
}) => {
  const [nodes, setNodes] = useState<MeshNode[]>(propsNodes ?? DEFAULT_NODES);
  const [links, setLinks] = useState<MeshLink[]>(propsLinks ?? DEFAULT_LINKS);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const animateRef = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragPos = useRef({ x: 0, y: 0 });

  const stats = useMemo(() => {
    const online = nodes.filter((n) => n.status === 'online').length;
    const relaying = nodes.filter((n) => n.status === 'relaying').length;
    const offline = nodes.filter((n) => n.status === 'offline').length;
    const connecting = nodes.filter((n) => n.status === 'connecting').length;
    const activeLinks = links.filter((l) => l.status === 'active').length;
    const totalBps = links.reduce((sum, l) => sum + l.bytesPerSecond, 0);
    return { online, relaying, offline, connecting, activeLinks, totalBps };
  }, [nodes, links]);

  useEffect(() => {
    if (!autoAnimate) return;
    animateRef.current = window.requestAnimationFrame(() => {
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          latency: n.status === 'offline' ? 999 : Math.max(5, n.latency + Math.floor(Math.random() * 10) - 5),
        }))
      );
      setLinks((prev) =>
        prev.map((l) => ({
          ...l,
          bytesPerSecond: Math.max(0, l.bytesPerSecond + Math.floor(Math.random() * 500) - 250),
        }))
      );
    });
    return () => {
      if (animateRef.current) window.cancelAnimationFrame(animateRef.current);
    };
  }, [autoAnimate]);

  const setViewScale = useCallback(
    (nextScale: number, cx?: number, cy?: number) => {
      const scale = clampScale(nextScale);
      setView((prev) => {
        if (cx === undefined || cy === undefined) {
          return { scale, x: 0, y: 0 };
        }
        const worldX = (cx - prev.x) / prev.scale;
        const worldY = (cy - prev.y) / prev.scale;
        return { scale, x: cx - worldX * scale, y: cy - worldY * scale };
      });
    },
    []
  );

  const handleNodeClick = (id: string) => {
    setSelectedNode(id === selectedNode ? null : id);
  };

  const handleLinkMouseEnter = (id: string) => {
    setHoveredLink(id);
  };

  const handleLinkMouseLeave = () => {
    setHoveredLink(null);
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(ctm.inverse());
      const delta = -e.deltaY * 0.001;
      setViewScale(view.scale + delta, svgP.x, svgP.y);
    },
    [view.scale, setViewScale]
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(ctm.inverse());
      if (view.scale > 1) {
        setView({ scale: 1, x: 0, y: 0 });
      } else {
        setViewScale(2, svgP.x, svgP.y);
      }
    },
    [view.scale, setViewScale]
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragPos.current = { x: view.x, y: view.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    const next = {
      x: dragPos.current.x + e.clientX - dragStart.current.x,
      y: dragPos.current.y + e.clientY - dragStart.current.y,
    };
    dragPos.current = next;
    setView((prev) => ({ ...prev, x: next.x, y: next.y }));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const selectedNodeData = nodes.find((n) => n.id === selectedNode);
  const hoveredLinkData = links.find((l) => l.id === hoveredLink);

  return (
    <section
      className={`relative w-full h-[600px] rounded-2xl bg-[#0b0c10] border border-white/10 shadow-2xl shadow-black/80 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-30 px-6 py-4 bg-[#12131c]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--nova-accent-color,#ff4e18)]" />
          <h2 className="text-sm font-semibold text-white">Mesh Network Radar</h2>
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewScale(view.scale - SCALE_STEP, 400, 300)}
            disabled={view.scale <= MIN_SCALE}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              view.scale <= MIN_SCALE ? 'bg-white/5' : 'bg-white/10 hover:bg-white/20'
            }"
            title="Уменьшить"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setView({ scale: 1, x: 0, y: 0 })}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-medium text-white/70 hover:text-white transition active:scale-95 bg-white/10 hover:bg-white/20"
            title="По размеру"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setViewScale(view.scale + SCALE_STEP, 400, 300)}
            disabled={view.scale >= MAX_SCALE}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              view.scale >= MAX_SCALE ? 'bg-white/5' : 'bg-white/10 hover:bg-white/20'
            }"
            title="Увеличить"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#8c919d]">
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full bg-[${STATUS_COLORS.online}]`} />{' '}
            <span>{stats.online} online</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full bg-[${STATUS_COLORS.relaying}]`} />{' '}
            <span>{stats.relaying} relaying</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full bg-[${STATUS_COLORS.offline}]`} />{' '}
            <span>{stats.offline} offline</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full bg-[${STATUS_COLORS.connecting}]`} />{' '}
            <span>{stats.connecting} connecting</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-[var(--nova-accent-color,#ff4e18)]">
            {Math.round(stats.totalBps / 1000)} KB/s
          </span>
          <span className="text-xs text-[#8c919d]">throughput</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <svg
          ref={svgRef}
          className={`w-full h-full transition-transform duration-150 ease-out ${
            view.scale > 1 ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onDoubleClick={handleDblClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ touchAction: view.scale > 1 ? 'none' : 'auto' }}
        >
          {/* Defs */}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
            </marker>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}>
            {/* Links (connections) */}
            <g className="links-layer">
              {links.map((link) => {
                const fromNode = nodes.find((n) => n.id === link.from);
                const toNode = nodes.find((n) => n.id === link.to);
                if (!fromNode || !toNode) return null;
                const isActive = link.status === 'active';
                const isHovered = hoveredLink === link.id;
                const isSelectedPath =
                  selectedNode &&
                  (link.from === selectedNode || link.to === selectedNode);

                return (
                  <line
                    key={link.id}
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={LINK_COLORS[link.status]}
                    strokeOpacity={isHovered || isSelectedPath ? 1 : 0.4}
                    strokeWidth={isActive ? 2 : 1.5}
                    strokeDasharray={link.status === 'idle' ? '4 4' : link.status === 'blocked' ? '8 4' : '0'}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => handleLinkMouseEnter(link.id)}
                    onMouseLeave={handleLinkMouseLeave}
                    onClick={() => {
                      setSelectedNode(link.from === selectedNode ? null : link.from);
                    }}
                  >
                    {isActive && (
                      <animateMotion
                        dur="2s"
                        repeatCount="indefinite"
                        path={`M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`}
                      />
                    )}
                  </line>
                );
              })}
            </g>

            {/* Nodes */}
            <g className="nodes-layer">
              {nodes.map((node) => {
                const isSelected = selectedNode === node.id;
                const statusColor = STATUS_COLORS[node.status];

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-all duration-200"
                    onClick={() => handleNodeClick(node.id)}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? 14 : 10}
                      fill={statusColor}
                      stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                      strokeWidth={2}
                      filter={isSelected || node.status === 'relaying' ? 'url(#glow)' : undefined}
                      className="transition-all duration-200"
                    />
                    {node.isLocal && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={6}
                        fill="transparent"
                        stroke={statusColor}
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        className="animate-pulse"
                      />
                    )}
                    {node.status === 'relaying' && (
                      <animate
                        attributeName="r"
                        values="10;12;10"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    )}
                    <foreignObject x={node.x - 60} y={node.y + 18} width="120" height="24">
                      <div
                        className={`text-[10px] font-medium whitespace-nowrap ${
                          node.status === 'offline' ? 'text-[#6b7280]' : 'text-white'
                        }`}
                      >
                        {node.label}
                      </div>
                    </foreignObject>
                    <foreignObject x={node.x - 40} y={node.y + 40} width="80" height="16">
                      <div className="text-[9px] text-[#8c919d] whitespace-nowrap">
                        {node.hops} hops • {node.latency}ms
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>

            {/* Center overlay (selected node info) */}
            {selectedNodeData && (
              <g className="info-overlay">
                <rect
                  x={20}
                  y={20}
                  width={260}
                  height={140}
                  fill="#12131c"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                  rx="8"
                />
                <text x={36} y={42} fill="var(--nova-accent-color,#ff4e18)" fontSize="11" fontWeight="bold">
                  Selected Node
                </text>
                <text x={36} y={60} fill="#ffffff" fontSize="13" fontWeight="semibold">
                  {selectedNodeData.label}
                </text>
                <text x={36} y={78} fill="#8c919d" fontSize="11">
                  ID: {selectedNodeData.id}
                </text>
                <text x={36} y={94} fill="#8c919d" fontSize="11">
                  Status: {selectedNodeData.status}
                </text>
                <text x={36} y={112} fill="#8c919d" fontSize="11">
                  {selectedNodeData.hops} hops • {selectedNodeData.latency}ms latency
                </text>
                <text x={36} y={130} fill="#8c919d" fontSize="11">
                  {selectedNodeData.isLocal ? 'Local device' : 'Remote mesh peer'}
                </text>
              </g>
            )}

            {hoveredLinkData && (
              <g className="info-overlay">
                <rect
                  x={520}
                  y={20}
                  width={260}
                  height={100}
                  fill="#12131c"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                  rx="8"
                />
                <text x={536} y={42} fill={LINK_COLORS[hoveredLinkData.status]} fontSize="11" fontWeight="bold">
                  Link Status
                </text>
                <text x={536} y={60} fill="#ffffff" fontSize="13" fontWeight="semibold">
                  {hoveredLinkData.status.toUpperCase()}
                </text>
                <text x={536} y={78} fill="#8c919d" fontSize="11">
                  Latency: {hoveredLinkData.latency}ms
                </text>
                <text x={536} y={94} fill="#8c919d" fontSize="11">
                  Throughput: {Math.round(hoveredLinkData.bytesPerSecond / 1000)} KB/s
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Footer stats */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-6 py-3 bg-[#12131c]/80 backdrop-blur-md border-t border-white/10 flex items-center justify-between text-[11px] text-[#8c919d]">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          <span>{nodes.length} mesh nodes</span>
        </div>
        <div className="flex items-center gap-1">
          <span>{links.filter((l) => l.status === 'active').length} active routes</span>
          <span className="text-[#6b7280]">|</span>
          <span>{links.filter((l) => l.status === 'blocked').length} blocked</span>
        </div>
        <div className="flex items-center gap-1">
          <ShieldExclamation className="w-3 h-3" />
          <span>E2EE mesh routing</span>
        </div>
        <div className="flex items-center gap-1">
          <Link className="w-3 h-3" />
          <span>DHT discovery active</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[10px] text-[#10b981]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
        <span>MESH ONLINE</span>
      </div>
    </section>
  );
};

MeshRadar.displayName = 'MeshRadar';



















