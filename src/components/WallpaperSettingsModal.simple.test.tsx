import { render, screen } from '@testing-library/react';
import { WallpaperSettingsModal } from './WallpaperSettingsModal';

describe('simple test', () => {
  it('renders', () => {
    render(
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