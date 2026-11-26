/// <reference types="vitest/globals" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NovaButton } from '../NovaButton';
import { NovaCard } from '../NovaCard';
import { NovaAvatar } from '../NovaAvatar';
import { NovaToggle } from '../NovaToggle';
import { NovaInput } from '../NovaInput';
import { NovaColorChip } from '../NovaColorChip';
import { NovaSelectableButton } from '../NovaSelectableButton';
import { NovaNavButton } from '../NovaNavButton';
import { NovaModal } from '../NovaModal';
import { ScrollableRow } from '../ScrollableRow';

describe('UI visual snapshot - NovaButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches default ghost visual snapshot', () => {
    const { container } = render(<NovaButton onClick={vi.fn()}>Click</NovaButton>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" class="flex items-center justify-center cursor-pointer select-none transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-out active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color,#ff4e18)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-canvas,#0c0d11)] w-10 h-10 min-w-[44px] min-h-[44px] px-4 py-2 rounded-full bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]">Click</button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-10 h-10');
    expect(btn.className).toContain('bg-white/5');
    expect(btn.className).toContain('rounded-full');
  });

  it('matches accent variant visual snapshot', () => {
    const { container } = render(
      <NovaButton variant="accent" size="lg" onClick={vi.fn()}>
        Accent
      </NovaButton>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" class="flex items-center justify-center cursor-pointer select-none transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-out active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color,#ff4e18)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-canvas,#0c0d11)] w-12 h-12 min-w-[52px] min-h-[52px] px-5 py-2.5 rounded-full bg-[var(--nova-accent-color,#ff4e18)] text-[#ffffff] border border-[var(--nova-accent-color,#ff4e18)] shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30 hover:brightness-110 hover:shadow-lg active:brightness-95">Accent</button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]');
    expect(btn.className).toContain('w-12 h-12');
  });

  it('matches disabled visual snapshot', () => {
    const { container } = render(<NovaButton disabled onClick={vi.fn()}>Disabled</NovaButton>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" disabled="" aria-disabled="true" class="flex items-center justify-center cursor-pointer select-none transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-out active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nova-accent-color,#ff4e18)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nova-canvas,#0c0d11)] w-10 h-10 min-w-[44px] min-h-[44px] px-4 py-2 rounded-full bg-white/5 hover:bg-[var(--nova-accent-color,#ff4e18)]/20 border border-white/10 hover:border-[var(--nova-accent-color,#ff4e18)]/40 text-white/70 hover:text-[var(--nova-accent-color,#ff4e18)]">Disabled</button>"`);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button').className).toContain('disabled:opacity-50');
  });
});

describe('UI visual snapshot - NovaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches default card visual snapshot', () => {
    const { container } = render(<NovaCard>Content</NovaCard>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="rounded-2xl transition-colors duration-200 bg-[var(--bg-surface)] border border-[var(--border)] p-5">Content</div>"`);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('rounded-2xl');
    expect(card.className).toContain('bg-[var(--bg-surface)]');
    expect(card.className).toContain('border-[var(--border)]');
    expect(card.className).toContain('p-5');
  });

  it('matches accent variant visual snapshot', () => {
    const { container } = render(<NovaCard variant="accent" padding="lg">Accent</NovaCard>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="rounded-2xl transition-colors duration-200 bg-[var(--accent-soft)] border border-[var(--accent)] p-6">Accent</div>"`);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('bg-[var(--accent-soft)]');
    expect(card.className).toContain('p-6');
  });

  it('matches hover visual snapshot', () => {
    const { container } = render(<NovaCard hover>Hover</NovaCard>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="rounded-2xl transition-colors duration-200 bg-[var(--bg-surface)] border border-[var(--border)] p-5 hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)]">Hover</div>"`);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('hover:bg-[var(--bg-hover)]');
    expect(card.className).toContain('hover:border-[var(--border-strong)]');
  });
});

describe('UI visual snapshot - NovaAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches initials avatar visual snapshot', () => {
    const { container } = render(<NovaAvatar name="Katie Rogers" size="xl" />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-testid="avatar-wrapper" class="relative inline-flex shrink-0 " style="width: 120px; height: 120px;"><div class="w-full h-full rounded-full flex items-center justify-center font-semibold select-none" style="background-color: var(--c-name-3); color: var(--c-on-primary); font-size: 48px;">KR</div></div>"`);
    expect(screen.getByText('KR')).toBeInTheDocument();
    const avatar = screen.getByTestId('avatar-wrapper');
    expect(avatar).toHaveStyle({ width: '120px', height: '120px' });
  });

  it('matches image avatar visual snapshot', () => {
    const { container } = render(
      <NovaAvatar src="https://example.com/a.jpg" name="Katie" size="sm" status="online" showStatus />,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-testid="avatar-wrapper" class="relative inline-flex shrink-0 " style="width: 36px; height: 36px;"><img alt="Katie" class="w-full h-full rounded-full object-cover" loading="lazy" decoding="async" src="https://example.com/a.jpg"><span class="absolute bottom-0 right-0 rounded-full border-2 border-[var(--bg-surface)] flex items-center justify-center" style="width: 10px; height: 10px; background-color: var(--online);" aria-label="Status: online"></span></div>"`);
    expect(screen.getByAltText('Katie')).toHaveAttribute('src', 'https://example.com/a.jpg');
    expect(screen.getByLabelText('Status: online').className).toContain('border-[var(--bg-surface)]');
  });
});

describe('UI visual snapshot - NovaToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches off toggle visual snapshot', () => {
    const { container } = render(<NovaToggle checked={false} onChange={vi.fn()} />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" role="switch" aria-checked="false" class="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--bg-hover)] transition group cursor-pointer disabled:opacity-50 disabled:pointer-events-none"><span class="relative w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 bg-[var(--border-strong)]"><span class="w-4 h-4 rounded-full bg-[var(--text-on-accent)] shadow-md transition-transform duration-200 translate-x-0"></span></span></button>"`);
    const switchEl = screen.getByRole('switch');
    const track = switchEl.querySelector('span')!;
    expect(track.className).toContain('bg-[var(--border-strong)]');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
  });

  it('matches on toggle visual snapshot', () => {
    const { container } = render(<NovaToggle checked={true} onChange={vi.fn()} />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" role="switch" aria-checked="true" class="w-full flex items-center justify-between py-2 px-1 rounded-xl hover:bg-[var(--bg-hover)] transition group cursor-pointer disabled:opacity-50 disabled:pointer-events-none"><span class="relative w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 bg-[var(--accent)]"><span class="w-4 h-4 rounded-full bg-[var(--text-on-accent)] shadow-md transition-transform duration-200 translate-x-full"></span></span></button>"`);
    const switchEl = screen.getByRole('switch');
    const track = switchEl.querySelector('span')!;
    expect(track.className).toContain('bg-[var(--accent)]');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });
});

describe('UI visual snapshot - NovaInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches default input visual snapshot', () => {
    const { container } = render(<NovaInput id="nova-input-test" placeholder="Enter text" />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="flex flex-col gap-1.5"><div class="flex items-center gap-2 rounded-lg border px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-[var(--focus-ring)]/35 focus-within:border-[var(--focus-ring)]/60 focus-within:bg-[var(--accent-soft)]/20 border-[var(--border)]"><input id="nova-input-test" placeholder="Enter text" data-inline-focus="true" class="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none py-1 min-w-0" aria-invalid="false"></div></div>"`);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Enter text');
    expect(input.className).toContain('bg-transparent');
    expect(input.className).toContain('text-[var(--text-primary)]');
  });

  it('matches error input visual snapshot', () => {
    const { container } = render(<NovaInput id="nova-input-test" error="Error" placeholder="Error" />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="flex flex-col gap-1.5"><div class="flex items-center gap-2 rounded-lg border px-3 py-2 transition-[border-color,background-color] duration-150 hover:border-[var(--focus-ring)]/35 focus-within:border-[var(--focus-ring)]/60 focus-within:bg-[var(--accent-soft)]/20 border-[var(--danger)] focus-within:border-[var(--danger)]/70"><input id="nova-input-test" placeholder="Error" data-inline-focus="true" class="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none py-1 min-w-0" aria-invalid="true" aria-describedby="nova-input-test-error"></div><span id="nova-input-test-error" class="text-xs text-[var(--danger)]">Error</span></div>"`);
    const wrapper = screen.getByRole('textbox').closest('div')!;
    expect(wrapper.className).toContain('border-[var(--danger)]');
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('UI visual snapshot - NovaColorChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches selected color chip visual snapshot', () => {
    const { container } = render(<NovaColorChip selected onSelect={vi.fn()}>Blue</NovaColorChip>);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="true" class="flex flex-col items-center gap-1 py-2 px-2 rounded-xl border border-[var(--border-strong)] transition cursor-pointer relative overflow-hidden disabled:opacity-60 disabled:pointer-events-none bg-[var(--nova-accent-color,#ff4e18)]/10 border-[var(--nova-accent-color,#ff4e18)]/40 shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/25"><div class="relative w-6 h-6 rounded-full border border-[var(--border-strong)] shadow-sm overflow-hidden"><div class="absolute inset-1 rounded-full bg-[var(--bg-surface-2)]"></div></div><span class="text-[11px] font-medium "></span>Blue</button>"`);
    const chip = screen.getByRole('button');
    expect(chip.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]/10');
    expect(chip.className).toContain('border-[var(--nova-accent-color,#ff4e18)]/40');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('matches unselected color chip visual snapshot', () => {
    const { container } = render(
      <NovaColorChip selected={false} onSelect={vi.fn()}>Blue</NovaColorChip>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="false" class="flex flex-col items-center gap-1 py-2 px-2 rounded-xl border border-[var(--border-strong)] transition cursor-pointer relative overflow-hidden disabled:opacity-60 disabled:pointer-events-none bg-[var(--bg-surface-2)] border-transparent hover:bg-[var(--bg-hover)]"><div class="relative w-6 h-6 rounded-full border border-[var(--border-strong)] shadow-sm overflow-hidden"><div class="absolute inset-1 rounded-full bg-[var(--bg-surface-2)]"></div></div><span class="text-[11px] font-medium "></span>Blue</button>"`);
    const chip = screen.getByRole('button');
    expect(chip.className).toContain('bg-[var(--bg-surface-2)]');
    expect(chip.className).toContain('border-[var(--border-strong)]');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('UI visual snapshot - NovaSelectableButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches selected selectable button visual snapshot', () => {
    const { container } = render(
      <NovaSelectableButton selected onSelect={vi.fn()}>Selected</NovaSelectableButton>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="true" class="flex-1 flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition rounded-lg border px-2 py-1.5 text-xs bg-[var(--nova-accent-color,#ff4e18)]/10 border-[var(--nova-accent-color,#ff4e18)]/40 text-white shadow-sm shadow-[var(--nova-accent-color,#ff4e18)]/25">Selected</button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-[var(--nova-accent-color,#ff4e18)]/10');
    expect(btn.className).toContain('text-white');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('matches unselected selectable button visual snapshot', () => {
    const { container } = render(
      <NovaSelectableButton selected={false} onSelect={vi.fn()}>Unselected</NovaSelectableButton>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="false" class="flex-1 flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition rounded-lg border px-2 py-1.5 text-xs bg-white/[0.03] border-transparent text-white/60 hover:bg-white/[0.06]">Unselected</button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-white/[0.03]');
    expect(btn.className).toContain('text-white/60');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('UI visual snapshot - NovaNavButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches active nav button visual snapshot', () => {
    const { container } = render(<NovaNavButton active icon="msg" label="Chats" />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="true" class="flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition text-[var(--nova-accent-color,#ff4e18)] font-bold"><span class="w-5 h-5 fill-current">msg</span><span class="text-[9px] font-bold">Chats</span></button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-[var(--nova-accent-color,#ff4e18)]');
    expect(btn.className).toContain('font-bold');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('matches inactive nav button visual snapshot', () => {
    const { container } = render(<NovaNavButton active={false} icon="msg" label="Chats" />);
    expect(container.innerHTML).toMatchInlineSnapshot(`"<button type="button" aria-pressed="false" class="flex flex-col items-center gap-0.5 cursor-pointer active:scale-90 transition text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><span class="w-5 h-5 fill-[var(--text-secondary)]">msg</span><span class="text-[9px] font-normal">Chats</span></button>"`);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-[var(--text-secondary)]');
    expect(btn.className).toContain('hover:text-[var(--text-primary)]');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('UI visual snapshot - NovaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches open modal visual snapshot', () => {
    const { container } = render(
      <NovaModal isOpen onClose={vi.fn()}>
        <div data-testid="modal-content">Modal content</div>
      </NovaModal>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div tabindex="-1" class="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-200 " role="dialog" aria-modal="true" aria-label="Modal"><div class="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center p-4"><div class="bg-[var(--bg-surface)]/[0.95] backdrop-blur-xl border border-[var(--border)] rounded-2xl shadow-[var(--shadow-2)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 max-w-[700px] flex flex-col"><div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-strong)]"><span aria-hidden="true"></span><button type="button" class="w-8 h-8 rounded-full bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)]" aria-label="Close modal"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tabler-icon tabler-icon-x w-4 h-4"><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></svg></button></div><div class="flex-1 overflow-y-auto p-6"><div data-testid="modal-content">Modal content</div></div></div></div></div>"`);
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('matches closed modal visual snapshot', () => {
    const { container } = render(<NovaModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toMatchInlineSnapshot(`""`);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('UI visual snapshot - ScrollableRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches no-scrollbar visual snapshot', () => {
    const { container } = render(
      <ScrollableRow data-testid="row">
        <div>Item 1</div>
        <div>Item 2</div>
      </ScrollableRow>,
    );
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div class="flex items-center overflow-x-auto no-scrollbar gap-2" data-testid="row"><div>Item 1</div><div>Item 2</div></div>"`);
    const row = screen.getByTestId('row');
    expect(row.className).toContain('no-scrollbar');
  });
});
