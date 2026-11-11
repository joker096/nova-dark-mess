import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('open Katie\'s chat and send a message', async ({ app, screen }) => {
  await app.open('/');

  // Open Katie Rogers' chat from the chats list.
  await screen.getByRole('heading', 'Katie Rogers').tap();

  // Type a message and send it with Enter.
  const message = 'Hello Katie! e2e test message.';
  const input = screen.getByRole('textbox', 'Type a message...');
  await input.fill(message);
  await input.press('Enter');

  // The sent message appears as a bubble in the conversation.
  await expect(screen.getByText(message).first()).toBeVisible();
});
