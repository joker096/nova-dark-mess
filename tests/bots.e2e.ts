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
  await screen.getByRole('button', { name: 'Settings' }).click();
  await screen.getByRole('button', { name: /^Bots/ }).click();

  // Echo bot should be pre-installed (dev fixture).
  await expect(screen.getByText('Echo Bot')).toBeVisible();

  // Open the Echo bot chat from its registry row and send /start.
  // NovaFather is listed first, so Echo's "Open chat" is the second one.
  await screen.getByRole('button', { name: 'Open chat' }).nth(1).click();

  const input = screen.getByRole('textbox', 'Type a message...');
  await input.fill('/start');
  await input.press('Enter');

  // Bot replies with keyboard.
  await expect(screen.getByText('Press a button — I will echo it back.').first()).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Ping' }).first()).toBeVisible();

  // Press Ping button → callback round-trip → toast.
  await screen.getByRole('button', { name: 'Ping' }).first().click();
  await expect(screen.getByText('Last pressed: echo:ping').first()).toBeVisible();

  // Revoke bot from Settings → Bots.
  await screen.getByRole('button', { name: 'Settings' }).click();
  await screen.getByRole('button', { name: /^Bots/ }).click();
  await screen.getByRole('button', { name: 'Revoke' }).nth(1).click();
  await expect(screen.getByText('@echo_bot · Granted')).not.toBeVisible();
});
