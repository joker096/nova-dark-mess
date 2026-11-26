import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('open Katie\'s chat and send a message', async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' }),
    );
    localStorage.setItem('nova_app_theme', 'dark');
    localStorage.setItem('nova_font_size', 'medium');
  });
  await app.open('/');

  // Wait for app to load - sidebar indicates desktop layout is ready
  await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 30000 });

  // Wait for chat list to load in the middle panel
  // Use first() since there are two buttons with Katie Rogers (sidebar + chat list)
  await expect(screen.getByRole('button', { name: /Katie Rogers/ }).first()).toBeVisible({ timeout: 10000 });

  // Open Katie Rogers' chat from the chat list
  await screen.getByRole('button', { name: /Katie Rogers/ }).first().click();

  // Type a message and send it with Enter.
  const message = 'Hello Katie! e2e test message.';
  const input = screen.getByRole('textbox', 'Type a message...');
  await input.fill(message);
  await input.press('Enter');

  // The sent message appears as a bubble in the conversation.
  await expect(screen.getByText(message).first()).toBeVisible();
});