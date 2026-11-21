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
    // The group fixture starts without a stored membership; accept it so the
    // test exercises sending, not the join-request flow.
    localStorage.setItem('nova_group_membership_thailand', 'member');
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

  // Attach the live gateway's fingerprint to the Echo bot through the same
  // session API NovaFather's /setpeer command calls.
  await browser.evaluate(async (peer) => {
    const { botSession } = await import('/src/lib/bots/session.ts');
    await botSession.setPeerFingerprint('echo', peer);
  }, fingerprint);

  // Open Thailand and add the gateway to the group.
  await browser.evaluate(() => {
    window.location.hash = '#nova://chat/thailand';
  });
  await expect(screen.getByText('Thailand Trip').first()).toBeVisible();
  await screen.getByRole('button', { name: 'Chat actions' }).first().click();
  await screen.getByRole('button', { name: 'Group members' }).click();
  await screen.getByLabelText('Member fingerprint').fill(fingerprint);
  await screen.getByRole('button', { name: 'Add member' }).click();
  await screen.getByRole('button', { name: 'Close' }).first().click();

  // Send a group message; ChatScreen must route it to the bot's peer session.
  const groupInput = screen.getByRole('textbox', 'Type a message...');
  await groupInput.fill('hello from the group');
  await groupInput.press('Enter');

  const received = await browser.evaluate(async () => {
    const w = window;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (w.__novaBotReceived.length > 0) return w.__novaBotReceived;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { received: w.__novaBotReceived, errors: w.__novaBotErrors };
  });

  expect(Array.isArray(received)).toBe(true);
  expect(received[0].plaintext).toBe('hello from the group');
  expect(received[0].senderFingerprint).toBeTruthy();
});
