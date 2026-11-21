/**
 * Tests for src/components/MiniAppIframe.tsx (Phase B7 — Mini Apps).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MiniAppIframe } from './MiniAppIframe';

const baseProps = {
  botId: 'echo_bot',
  webAppUrl: 'https://example.com/miniapp',
  userId: 'user_1',
  secret: 'bot-secret',
  onClose: vi.fn(),
  onInlineQuery: vi.fn(),
  onMainButtonClick: vi.fn(),
};

const getIframe = (container: HTMLElement) =>
  container.querySelector('iframe') as HTMLIFrameElement | null;

describe('MiniAppIframe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders iframe with sandbox without allow-same-origin', () => {
    const { container } = render(<MiniAppIframe {...baseProps} />);
    const iframe = getIframe(container);
    expect(iframe).not.toBeNull();
    const sandbox = iframe!.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-forms');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('includes bot id and mini app title in header', () => {
    const { container } = render(<MiniAppIframe {...baseProps} />);
    expect(screen.getByText('Mini App · echo_bot')).toBeInTheDocument();
    expect(getIframe(container)).not.toBeNull();
  });

  it('calls onClose when close button is clicked', () => {
    render(<MiniAppIframe {...baseProps} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('passes initData in iframe src fragment', () => {
    const { container } = render(<MiniAppIframe {...baseProps} />);
    const iframe = getIframe(container)!;
    expect(iframe.src).toContain('bot_id=echo_bot');
    expect(iframe.src).toContain('user_id=user_1');
    expect(iframe.src).toContain('hash=');
  });

  it('does not render an iframe for a non-HTTPS URL', () => {
    const { container } = render(
      <MiniAppIframe {...baseProps} webAppUrl="javascript:alert(1)" />,
    );
    expect(getIframe(container)).toBeNull();
    expect(screen.getByText('Mini App URL must be HTTPS')).toBeInTheDocument();
  });

  it('refuses a remote URL whose origin is not allowlisted', () => {
    const { container } = render(
      <MiniAppIframe {...baseProps} webAppUrl="https://evil.example/miniapp" />,
    );
    expect(getIframe(container)).toBeNull();
    expect(screen.getByText('Mini App origin is not allowed')).toBeInTheDocument();
  });

  it('renders without onInlineQuery / onMainButtonClick handlers', () => {
    const { botId, webAppUrl, userId, secret, onClose } = baseProps;
    const { container } = render(
      <MiniAppIframe botId={botId} webAppUrl={webAppUrl} userId={userId} secret={secret} onClose={onClose} />,
    );
    expect(getIframe(container)).not.toBeNull();
  });
});
