/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatScreen } from './ChatScreen';

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
    changeLanguage: vi.fn(),
    languages: [],
  }),
}));
vi.mock('../hooks/useSecurity', () => ({
  useSecurity: () => ({
    encryptAndSendMessage: vi.fn(async () => ({ encryptedPayload: {}, plaintext: '' })),
    checkPeerKey: vi.fn(async () => ({
      peerFingerprint: 'nova_pk_peer12345678',
      history: [],
    })),
    identity: { fingerprint: 'nova_pk_test1234567890' },
  }),
}));
vi.mock('../hooks/usePremium', () => ({
  usePremium: () => ({ premium: false, loading: false, checkout: vi.fn(), canUse: () => false }),
}));
vi.mock('./AudioWaveformPlayer', () => ({ AudioWaveformPlayer: vi.fn(() => null) }));
vi.mock('./VoiceMemoInput', () => ({
  VoiceMemoInput: vi.fn(() => null),
  VoiceMemoInputHandle: Symbol('VoiceMemoInputHandle'),
}));
vi.mock('./WallpaperSettingsModal', () => ({ WallpaperSettingsModal: vi.fn(() => null) }));
vi.mock('./ScheduleMessageModal', () => ({ ScheduleMessageModal: vi.fn(() => null) }));
vi.mock('./VideoCallOverlay', () => ({ VideoCallOverlay: vi.fn(() => null) }));
vi.mock('./SharedMediaSection', () => ({ SharedMediaSection: vi.fn(() => null) }));
vi.mock('./DoodleBackground', () => ({ DoodleBackground: vi.fn(() => null) }));

// Render a trigger instead of the simulated picker so the attachment path runs.
vi.mock('./FileSelectionModal', () => ({
  FileSelectionModal: ({
    onSendAttachment,
  }: {
    onSendAttachment: (payload: {
      document?: { name: string; size: string; type: 'pdf' };
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="send-document"
      onClick={() =>
        onSendAttachment({ document: { name: 'plan.pdf', size: '1 MB', type: 'pdf' } })
      }
    >
      send-document
    </button>
  ),
}));

describe('ChatScreen file transfer wiring', () => {
  it('runs attachments through the transfer pipeline and reports SHA-256 verification', async () => {
    render(<ChatScreen chatId="katie" onBack={vi.fn()} onOpenProfile={vi.fn()} />);

    fireEvent.click(screen.getByTestId('send-document'));

    expect(await screen.findByText(/chat\.fileVerified/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByTestId('file-transfer-progress')).toBeNull();
    expect(screen.getByText('plan.pdf')).toBeTruthy();
  });
});
