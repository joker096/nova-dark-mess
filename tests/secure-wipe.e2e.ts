import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('expired encrypted messages are purged from IndexedDB', async ({ app, browser }) => {
  await app.open('/');

  const remainingMessages = await browser.evaluate(async () => {
    const { EncryptedDatabase } = await import('/src/lib/storage/db.ts');
    const database = new EncryptedDatabase();
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const chatId = `secure-wipe-${crypto.randomUUID()}`;
    const expiredId = `${chatId}-expired`;
    const activeId = `${chatId}-active`;
    const now = Date.now();

    await database.initializeWithKey(key);
    await database.saveEncryptedMessage(chatId, expiredId, '{"state":"expired"}', now - 1);
    await database.saveEncryptedMessage(chatId, activeId, '{"state":"active"}', now + 60_000);
    await database.purgeExpiredMessages(now);
    const messages = await database.getEncryptedMessages(chatId, now);
    await database.deleteEncryptedMessage(activeId);
    return messages;
  });

  expect(remainingMessages).toEqual(['{"state":"active"}']);
});
