import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('install echo bot, send /start, keyboard renders, callback round-trip, revoke', async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' }),
    );
  });
  await app.open('/');

  // Open Settings → Bots.
  await screen.getByRole('button', { name: 'settings' }).click();
  await screen.getByRole('button', { name: 'Bots' }).click();

  // Echo bot should be pre-installed (dev fixture).
  await expect(screen.getByText('Echo Bot')).toBeVisible();

  // Open Katie's chat and send /start.
  await screen.getByRole('button', { name: 'Close' }).click();
  await screen.getByRole('heading', 'Katie Rogers').click();

  const input = screen.getByRole('textbox', 'Type a message...');
  await input.fill('/start');
  await input.press('Enter');

  // Bot replies with keyboard.
  await expect(screen.getByText('Press a button — I will echo it back.')).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Ping' })).toBeVisible();

  // Press Ping button → callback round-trip → toast.
  await screen.getByRole('button', { name: 'Ping' }).click();
  await expect(screen.getByText(/You pressed: echo:ping/)).toBeVisible();

  // Revoke bot from Settings → Bots.
  await screen.getByRole('button', { name: 'settings' }).click();
  await screen.getByRole('button', { name: 'Bots' }).click();
  await screen.getByRole('button', { name: 'Revoke' }).click();
  await expect(screen.queryByText('Echo Bot')).not.toBeVisible();
});
