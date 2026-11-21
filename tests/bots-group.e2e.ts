import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Live group delivery: a real BotGateway runs in the page (same BroadcastChannel
 * signaling/relay as the app), is attached to the Echo bot via NovaFather, is
 * added to the Thailand group, and must receive the group message over the
 * encrypted 1:1 session the client opens for bot peers.
 */
test('gateway bot receives a group message through the encrypted peer session', async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' }),
    );
  });
  await app.open('/');
  await expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible();

  const fingerprint = await browser.evaluate(async () => {
    const w = window;
    const { createAnonymousIdentity } = await import('/src/lib/crypto/identity.ts');
    const { BotGateway } = await import('/packages/bot-gateway/src/index.ts');
    const identity = await createAnonymousIdentity();
    w.__novaBotReceived = [];
    w.__novaBotErrors = [];
    const gateway = new BotGateway({
      identity,
      onGroupMessage: (groupId, senderFingerprint, plaintext) => {
        w.__novaBotReceived.push({ groupId, senderFingerprint, plaintext });
      },
      onError: (error) => {
        w.__novaBotErrors.push(String(error));
      },
    });
    await gateway.initialize();
    await gateway.joinGroup('thailand', [], { distribute: false });
    w.__novaBotGateway = gateway;
    return gateway.fingerprint;
  });

  // Attach the live fingerprint to Echo through the product path NovaFather
  // uses, so the app's own bot session (not only this test's import) is updated.
  await screen.getByRole('button', { name: 'Settings' }).click();
  await screen.getByRole('button', { name: /^Bots/ }).click();
  await expect(screen.getByText('Echo Bot')).toBeVisible();
  await screen.getByRole('button', { name: 'Open chat' }).first().click();
  const botInput = screen.getByRole('textbox', 'Type a message...');
  await botInput.fill('/setpeer');
  await botInput.press('Enter');
  await screen.getByRole('button', { name: /Echo Bot/ }).first().click();
  await botInput.fill(fingerprint);
  await botInput.press('Enter');
  await expect(screen.getByText(`✅ Peer fingerprint set: ${fingerprint}`).first()).toBeVisible();

  // Open Thailand and add the gateway; the app registers it as a bot peer.
  await browser.evaluate(() => {
    window.location.hash = '#nova://chat/thailand';
  });
  await expect(screen.getByText('Thailand Trip').first()).toBeVisible();
  await screen.getByRole('button', { name: 'Chat actions' }).first().click();
  await screen.getByRole('button', { name: 'Group members' }).click();
  await screen.getByLabel('Member fingerprint').fill(fingerprint);
  await screen.getByRole('button', { name: 'Add member' }).click();
  await screen.getByRole('button', { name: 'Close' }).first().click();

  // The first frame asks the gateway for its prekey bundle; once that lands the
  // next group frame must go through the encrypted 1:1 session.
  const groupInput = screen.getByRole('textbox', 'Type a message...');
  await groupInput.fill('warm up the session');
  await groupInput.press('Enter');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await groupInput.fill('hello from the group');
  await groupInput.press('Enter');

  const received = await browser.evaluate(async () => {
    const w = window;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (w.__novaBotReceived.some((frame) => frame.plaintext === 'hello from the group')) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return w.__novaBotReceived;
  });
  const hello = received.find((frame) => frame.plaintext === 'hello from the group');
  expect(Boolean(hello)).toBe(true);
  expect(hello.senderFingerprint).toBeTruthy();
});
