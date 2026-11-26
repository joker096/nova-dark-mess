import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('install echo bot, send /start, keyboard renders, callback round-trip, revoke', async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' }),
    );
    localStorage.setItem('nova_app_theme', 'dark');
    localStorage.setItem('nova_font_size', 'medium');
  });
  await app.open('/');

  // Wait for app to load
  await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 60000 });

  // Open Settings from sidebar
  await screen.getByRole('button', { name: 'Settings' }).first().click();
  await expect(screen.getByRole('dialog')).toBeVisible();
  
  // Navigate to Advanced tab (Bots is there now)
  await screen.getByRole('tab', { name: 'Advanced' }).first().click();
  
  // Wait for bots section
  await expect(screen.getByText('Bots')).toBeVisible({ timeout: 10000 });
  
  // Wait for bots to load
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Echo bot should be pre-installed (dev fixture).
  await expect(screen.getByText('Echo Bot')).toBeVisible({ timeout: 10000 });

  // Open the Echo bot chat from its registry row and send /start.
  // Use first() to avoid duplicate "Open chat" buttons
  await screen.getByTestId('bot-open-chat').first().click();

  const input = screen.getByRole('textbox', 'Type a message...');
  await input.fill('/start');
  await input.press('Enter');

  // Bot replies with keyboard.
  await expect(screen.getByText('Press a button — I will echo it back.').first()).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Ping' }).first()).toBeVisible();

  // Press Ping button → callback round-trip → toast.
  await screen.getByRole('button', { name: 'Ping' }).first().click();
  await expect(screen.getByText('Last pressed: echo:ping').first()).toBeVisible();

  // Revoke bot from Settings → Advanced → Bots
  await screen.getByRole('button', { name: 'Settings' }).first().click();
  await screen.getByRole('tab', { name: 'Advanced' }).first().click();
  await screen.getByRole('button', { name: 'Revoke' }).first().click();
  await expect(screen.getByText('@echo_bot · Granted')).not.toBeVisible();
});