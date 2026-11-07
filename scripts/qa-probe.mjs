export default async function run(page, ui) {
  const out = {};
  // Simplified repro: straight to chat from chats list via switcher
  await page.waitForSelector('text=Hello,', { timeout: 15000 });
  await page.locator('button[aria-label="Переключить экран демо"]').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Диалог")').first().click();
  await page.waitForSelector('input[placeholder*="message"]', { timeout: 10000 });
  await page.locator('input[placeholder*="message"]').fill('Schedule me');
  await page.waitForTimeout(600);
  out.sendBtnCount = await page.locator('button[title="Send message (hold to schedule)"]').count();
  // count ALL buttons with Send title variants
  out.allSendTitles = await page.evaluate(() =>
    [...document.querySelectorAll('button[title]')].map((b) => b.getAttribute('title')).filter((t) => t && t.includes('Send'))
  );
  return out;
}
