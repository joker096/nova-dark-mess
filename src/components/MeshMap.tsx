import React, { useMemo } from 'react';

interface MeshNode {
  id: string;
  x: number;
  y: number;
  label: string;
  status: 'online' | 'relaying' | 'connecting' | 'offline';
}

interface MeshLink {
  id: string;
  from: string;
  to: string;
  type: 'direct' | 'relay' | 'blocked';
}

const NODES: MeshNode[] = [
  { id: 'khabarovsk', x: 440, y: 420, label: 'Khabarovsk', status: 'online' },
  { id: 'vladivostok', x: 410, y: 350, label: 'Vladivostok', status: 'online' },
  { id: 'volgochevsk', x: 330, y: 340, label: 'Volgochevsk-2', status: 'relaying' },
  { id: 'dokuchaevsk', x: 280, y: 320, label: 'Dokuchaevsk', status: 'offline' },
  { id: 'blagoveshensk', x: 520, y: 290, label: 'Blagoveshensk', status: 'connecting' },
  { id: 'salgan', x: 470, y: 260, label: 'Salgan', status: 'online' },
  { id: 'elan', x: 550, y: 240, label: 'Elan', status: 'offline' },
  { id: 'khomutov', x: 620, y: 200, label: 'Khomutov', status: 'connecting' },
  { id: 'sakhalin', x: 760, y: 210, label: 'Sakhalin', status: 'offline' },
];

const LINKS: MeshLink[] = [
  { id: 'l1', from: 'khabarovsk', to: 'vladivostok', type: 'direct' },
  { id: 'l2', from: 'khabarovsk', to: 'volgochevsk', type: 'direct' },
  { id: 'l3', from: 'volgochevsk', to: 'dokuchaevsk', type: 'relay' },
  { id: 'l4', from: 'vladivostok', to: 'salgan', type: 'direct' },
  { id: 'l5', from: 'salgan', to: 'blagoveshensk', type: 'direct' },
  { id: 'l6', from: 'salgan', to: 'elan', type: 'relay' },
  { id: 'l7', from: 'blagoveshensk', to: 'khomutov', type: 'direct' },
  { id: 'l8', from: 'khomutov', to: 'sakhalin', type: 'blocked' },
];

const STATUS_COLORS: Record<string, string> = {
  online: '#10b981',
  relaying: '#f59e0b',
  connecting: '#3b82f6',
  offline: '#6b7280',
};

const LINK_COLORS: Record<string, string> = {
  direct: '#10b981',
  relay: '#f59e0b',
  blocked: '#ef4444',
};

export const MeshMap: React.FC<{ width?: number; height?: number }> = ({ width = 800, height = 600 }) => {
  const defs = useMemo(() => (
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
        <path d="M0 0 L8 3 L0 6 Z" fill="currentColor" />
      </marker>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
      </radialGradient>
    </defs>
  ), []);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      style={{ background: '#0b0c10', overflow: 'visible' }}
    >
      {defs}

      {/* Grid background */}
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Links layer */}
      <g className="links-layer">
        {LINKS.map((link) => {
          const from = NODES.find((n) => n.id === link.from);
          const to = NODES.find((n) => n.id === link.to);
          if (!from || !to) return null;
          const color = LINK_COLORS[link.type];
          const strokeDash = link.type === 'blocked' ? '6,4' : link.type === 'relay' ? '4,4' : '0';
          const opacity = link.type === 'blocked' ? '0.35' : '0.5';
          const strokeWidth = link.type === 'direct' ? '2' : '1.5';

          return (
            <line
              key={link.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={color}
              strokeOpacity={Number(opacity)}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDash}
              markerEnd={link.type !== 'blocked' ? 'url(#arrow)' : undefined}
              className="transition-all duration-200 cursor-pointer"
              style={{ filter: link.type === 'direct' ? 'url(#glow)' : 'none' }}
            />
          );
        })}
      </g>

      {/* Nodes layer */}
      <g className="nodes-layer">
        {NODES.map((node) => {
          const color = STATUS_COLORS[node.status];
          const isPulse = node.status === 'online' || node.status === 'relaying';
          return (
            <g key={node.id} className="cursor-pointer transition-all duration-200" style={{ filter: 'url(#glow)' }}>
              <circle
                cx={node.x}
                cy={node.y}
                r="10"
                fill={color}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="2"
                className="transition-all duration-200"
              />
              {isPulse && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="6"
                  fill="transparent"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  className="animate-pulse transition-all duration-200"
                />
              )}
              <foreignObject x={node.x - 60} y={node.y + 18} width="120" height="24">
                <div
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: node.status === 'offline' ? '#6b7280' : '#ffffff' }}
                >
                  {node.label}
                </div>
              </foreignObject>
              <foreignObject x={node.x - 40} y={node.y + 40} width="80" height="16">
                <div className="text-[9px] text-[#8c919d] whitespace-nowrap">
                  {node.status === 'online' ? '0 hops • 5ms' : node.status === 'relaying' ? '1 hops • 27ms' : node.status === 'connecting' ? '2 hops • 121ms' : '3 hops • 999ms'}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
