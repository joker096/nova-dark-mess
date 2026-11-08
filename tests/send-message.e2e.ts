import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test("open Katie's chat and send a message", async ({ app, screen }) => {
  await app.open('/');

  // The chat list is a heading; tap the first (and only) Katie Rogers entry.
  await screen.getByRole('heading', 'Katie Rogers').tap();

  // Chat screen opens with Katie's name + status in the header button.
  await expect(screen.getByRole('button', 'Katie Rogers Last seen 2 minutes ago Chat Gallery (11)')).toBeVisible();

  const message = 'Hello Katie! e2e test message.';
  const input = screen.getByRole('textbox', 'Type a message...');

  // Type and send the message with Enter.
  await input.fill(message);
  await input.press('Enter');

  // The message appears as a bubble in the conversation.
  await expect(screen.getByText(message)).toBeVisible();
});
