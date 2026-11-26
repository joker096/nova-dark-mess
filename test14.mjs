export default async function(page, ui) {
  await page.waitForSelector('button:has-text("Create my identity")', { timeout: 60000 });
  await page.click('button:has-text("Create my identity")');
  await page.waitForTimeout(2000);
  
  await page.fill('input[placeholder="e.g. Mira"]', 'TestUser');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(2000);
  
  const seedData = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="onboarding-seed"] .grid');
    if (!grid) return { words: [], joined: '' };
    const text = grid.textContent || '';
    const words = text.match(/[a-z]+/gi) || [];
    return { words, joined: words.join(' ') };
  });
  console.log('SEED WORDS:', seedData.words);
  console.log('SEED PHRASE:', seedData.joined);
  console.log('WORD COUNT:', seedData.words.length);
  
  return { done: true };
}