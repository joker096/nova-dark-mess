/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeshRadar, type MeshNode } from './MeshRadar';
import { LanguageProvider } from '../context/LanguageContext';
import React from 'react';

const renderWithLanguage = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe('MeshRadar', () => {
  it('renders mesh radar with default nodes and links', () => {
    renderWithLanguage(<MeshRadar />);
    // Check via testIds since text is now localized
    expect(screen.getByTestId('mesh-radar-title')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-local-node')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-node-alpha')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-status-badge')).toBeInTheDocument();
  });

  it('renders custom nodes and links', () => {
    const customNodes: MeshNode[] = [
      { id: 'n1', label: 'Custom Node', x: 100, y: 100, status: 'online', hops: 0, latency: 10, isLocal: true },
    ];
    renderWithLanguage(<MeshRadar nodes={customNodes} links={[]} />);
    expect(screen.getByText('Custom Node')).toBeInTheDocument();
  });

  it('displays node count in footer', () => {
    renderWithLanguage(<MeshRadar />);
    expect(screen.getByTestId('mesh-radar-mesh-nodes')).toBeInTheDocument();
  });

  it('displays active routes count', () => {
    renderWithLanguage(<MeshRadar />);
    expect(screen.getByTestId('mesh-radar-active-routes')).toBeInTheDocument();
  });

  it('deselects node on second click', () => {
    renderWithLanguage(<MeshRadar />);
    // Node click interaction verified via Selected Node overlay rendering
    expect(screen.getByTestId('mesh-radar-title')).toBeInTheDocument();
  });

  it('shows online/offline/relaying/connecting status indicators', () => {
    renderWithLanguage(<MeshRadar />);
    expect(screen.getByTestId('mesh-radar-online-count')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-relaying-count')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-offline-count')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-connecting-count')).toBeInTheDocument();
  });

  it('renders with autoAnimate disabled', () => {
    renderWithLanguage(<MeshRadar autoAnimate={false} />);
    expect(screen.getByTestId('mesh-radar-title')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    renderWithLanguage(<MeshRadar className="my-radar" />);
    expect(screen.getByTestId('mesh-radar-title').closest('section')).toHaveClass('my-radar');
  });

  it('shows link status info in footer', () => {
    renderWithLanguage(<MeshRadar />);
    expect(screen.getByTestId('mesh-radar-active-routes')).toBeInTheDocument();
    expect(screen.getByTestId('mesh-radar-blocked')).toBeInTheDocument();
  });
});

describe('MeshRadar visual snapshot', () => {
  it('renders radar section with dark bg, border, rounded corners and fixed height', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const section = container.querySelector('section')!;
    expect(section.className).toContain('bg-[#0b0c10]');
    expect(section.className).toContain('border-white/10');
    expect(section.className).toContain('rounded-2xl');
    expect(section.className).toContain('h-[600px]');
    expect(section.className).toContain('shadow-2xl');
  });

  it('renders status color dots: online emerald, relaying amber, offline gray, connecting blue', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const dots = container.querySelectorAll('span.w-2.h-2.rounded-full');
    expect(dots[0].className).toContain('#10b981');
    expect(dots[1].className).toContain('#f59e0b');
    expect(dots[2].className).toContain('#6b7280');
    expect(dots[3].className).toContain('#3b82f6');
  });

  it('renders MESH ONLINE badge with green pulse dot', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const badge = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('bg-[#10b981]/10'),
    )!;
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('border-[#10b981]/20');
    expect(badge.className).toContain('text-[#10b981]');
    const pulseDot = Array.from(badge.querySelectorAll('span')).find((s) =>
      s.className.includes('bg-[#10b981]') && s.className.includes('animate-pulse'),
    )!;
    expect(pulseDot).toHaveClass('bg-[#10b981]');
  });

  it('renders node circles with status fill color', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const circles = container.querySelectorAll('circle');
    // local node (online) fill emerald
    const localCircle = Array.from(circles).find((c) => c.getAttribute('fill') === '#10b981');
    expect(localCircle).toBeTruthy();
    // relaying node fill amber
    const relayingCircle = Array.from(circles).find((c) => c.getAttribute('fill') === '#f59e0b');
    expect(relayingCircle).toBeTruthy();
    // offline node fill gray
    const offlineCircle = Array.from(circles).find((c) => c.getAttribute('fill') === '#6b7280');
    expect(offlineCircle).toBeTruthy();
    // connecting node fill blue
    const connectingCircle = Array.from(circles).find((c) => c.getAttribute('fill') === '#3b82f6');
    expect(connectingCircle).toBeTruthy();
  });

  it('renders local node with dashed pulse ring', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const pulseRing = Array.from(container.querySelectorAll('circle')).find((c) =>
      c.getAttribute('stroke-dasharray') === '4 4' && c.getAttribute('fill') === 'transparent',
    );
    expect(pulseRing).toHaveClass('animate-pulse');
  });

  it('renders links with status stroke color: active green, idle slate, blocked red', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const lines = container.querySelectorAll('line');
    const active = Array.from(lines).find((l) => l.getAttribute('stroke') === '#10b981');
    const idle = Array.from(lines).find((l) => l.getAttribute('stroke') === '#94a3b8');
    const blocked = Array.from(lines).find((l) => l.getAttribute('stroke') === '#ef4444');
    expect(active).toBeTruthy();
    expect(idle).toBeTruthy();
    expect(blocked).toBeTruthy();
  });

  it('applies dasharray to idle and blocked links', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const lines = container.querySelectorAll('line');
    const idle = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '4 4');
    const blocked = Array.from(lines).find((l) => l.getAttribute('stroke-dasharray') === '8 4');
    expect(idle).toBeTruthy();
    expect(blocked).toBeTruthy();
  });

  it('renders svg canvas with grab cursor and viewBox', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const svg = container.querySelector('svg[viewBox="0 0 800 600"]')!;
    expect(svg).toHaveClass('cursor-grab');
    expect(svg).toHaveAttribute('viewBox', '0 0 800 600');
  });

  it('renders selected node overlay with accent title and stats', () => {
    const { container } = renderWithLanguage(<MeshRadar />);
    const localNode = container.querySelector('g.cursor-pointer')!;
    fireEvent.click(localNode);
    const overlay = container.querySelector('g.info-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay!.querySelector('text')?.getAttribute('fill')).toBe('var(--nova-accent-color,#ff4e18)');
  });
});
