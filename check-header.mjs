export default async function run(page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('http://localhost:3002/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: new Date().toISOString(), path: 'create' }),
    );
    localStorage.setItem('nova_app_theme', 'light');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('h1:visible', { hasText: '@nova_user' }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.locator('h2:visible', { hasText: 'Katie Rogers' }).first().click();
  await page.waitForTimeout(900);
  const avatars = await page.evaluate(() =>
    [...document.querySelectorAll('button[title="Profile"], button[title="Профиль"]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  await page.screenshot({ path: 'tmp-header-one-avatar.png' });
  return { avatars };
}
