import { render, screen } from '@testing-library/react';
import React from 'react';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';
import { LanguageProvider } from '../context/LanguageContext';

const renderWithLanguage = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe('simple test', () => {
  it('renders', () => {
    renderWithLanguage(
      <WallpaperSettingsModal
        isOpen={true}
        currentWallpaper="neon-nebula"
        onSelect={() => {}}
        onCycle={() => {}}
        onClose={() => {}}
      />
    );
    console.log(screen.getByRole('dialog'));
  });
});