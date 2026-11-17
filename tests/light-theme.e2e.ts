import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) {
      throw new Error(`Expected an RGB color, received "${color}"`);
    }

    const [red, green, blue] = channels.map((channel) => {
      const srgb = channel / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('light theme applies an accessible palette across chats and wallpapers', async ({
  app,
  browser,
}) => {
  await browser.addInitScript(() => {
    localStorage.setItem('nova_app_theme', 'light');
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' }),
    );
  });
  await app.open('/');

  await expect(browser.locator('html')).toHaveAttribute('data-theme', 'light');

  const colors = await browser.evaluate(() => {
    const main = document.querySelector('main');
    const heading = document.querySelector('h1');
    const wallpaper = document.querySelector('[data-theme-wallpaper]');
    const accent = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'All',
    );
    const composerControls = ['Send options', 'Attach', 'Tap to record'].map((label) => {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"], button[title="${label}"]`,
      );
      const icon = button?.querySelector('svg');
      if (!button || !icon) {
        throw new Error(`Expected the "${label}" composer control`);
      }

      return {
        background: getComputedStyle(button).backgroundColor,
        icon: getComputedStyle(icon).color,
      };
    });
    if (!main || !heading || !wallpaper || !accent) {
      throw new Error('Expected the chat shell, heading, wallpaper, and active folder button');
    }

    const probe = document.createElement('div');
    probe.dataset.themePreserve = 'dark';
    probe.className = 'bg-[#08090d] text-white';
    document.body.append(probe);

    const result = {
      surface: getComputedStyle(main).backgroundColor,
      heading: getComputedStyle(heading).color,
      wallpaper: getComputedStyle(wallpaper).backgroundImage,
      accent: {
        background: getComputedStyle(accent).backgroundColor,
        color: getComputedStyle(accent).color,
      },
      composerControls,
      preservedCallSurface: {
        background: getComputedStyle(probe).backgroundColor,
        color: getComputedStyle(probe).color,
      },
    };

    probe.remove();
    return result;
  });

  expect(colors.surface).toBe('rgb(243, 245, 248)');
  expect(colors.heading).toBe('rgb(69, 77, 90)');
  expect(colors.wallpaper).toContain('rgb(255, 255, 255)');
  expect(colors.accent.background).toBe('rgb(194, 65, 12)');
  expect(colors.accent.color).toBe('rgb(255, 255, 255)');
  expect(colors.composerControls).toHaveLength(3);
  for (const control of colors.composerControls) {
    expect(control.background).toBe('rgb(255, 255, 255)');
    expect(control.icon).toBe('rgb(69, 77, 90)');
  }
  expect(contrastRatio(colors.heading, colors.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colors.accent.color, colors.accent.background)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(colors.preservedCallSurface.background).toBe('rgb(8, 9, 13)');
  expect(colors.preservedCallSurface.color).toBe('rgb(255, 255, 255)');
});
