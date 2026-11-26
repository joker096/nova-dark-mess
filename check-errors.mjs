export default async function(page, ui) {
  // Complete onboarding if needed
  try {
    await page.waitForSelector('button:has-text("Create my identity")', { timeout: 5000 });
    await page.click('button:has-text("Create my identity")');
    await page.waitForTimeout(1000);
    
    await page.fill('input[placeholder="e.g. Mira"]', 'TestUser');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(2000);
    
    // Get seed phrase
    const seedData = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="onboarding-seed"] .grid');
      if (!grid) return { words: [] };
      const text = grid.textContent || '';
      const words = text.match(/[a-z]+/gi) || [];
      return { words };
    });
    
    await page.click('button:has-text("I saved my phrase")');
    await page.waitForTimeout(2000);
    
    // Complete phrase checks
    const seedWords = seedData.words;
    for (let round = 0; round < 3; round++) {
      await page.waitForTimeout(1500);
      const questionInfo = await page.evaluate(() => {
        const prompt = document.querySelector('[data-testid="onboarding-phrase-check"] p');
        const options = Array.from(document.querySelectorAll('[data-testid="phrase-check-option"]')).map(el => el.textContent?.trim() || '');
        return { prompt: prompt?.textContent?.trim() || '', options };
      });
      const match = questionInfo.prompt.match(/Choose word #(\d+)/i);
      if (match) {
        const wordIndex = parseInt(match[1], 10) - 1;
        const correctWord = seedWords[wordIndex];
        const optionIndex = questionInfo.options.findIndex(opt => opt === correctWord);
        if (optionIndex >= 0) {
          await page.click(`[data-testid="phrase-check-option"]:nth-child(${optionIndex + 1})`);
        }
      }
    }
    
    // Skip PIN
    await page.waitForTimeout(1500);
    const skipBtn = await page.$('button:has-text("Skip")');
    if (skipBtn) await skipBtn.click();
    await page.waitForTimeout(1500);
    
    // Skip backup
    const skipBtn2 = await page.$('button:has-text("Skip")');
    if (skipBtn2) await skipBtn2.click();
    await page.waitForTimeout(1500);
    
    // Start messaging
    const startBtn = await page.$('button:has-text("Start messaging")');
    if (startBtn) await startBtn.click();
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('Onboarding already complete or error:', e.message);
  }
  
  // Now check for console errors in the main app
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  // Wait for app to fully load
  await page.waitForTimeout(3000);
  
  // Get console errors
  const consoleErrors = await page.evaluate(() => {
    return window.__novaErrs || [];
  });
  
  console.log('CONSOLE ERRORS:', consoleErrors);
  
  // Also check network failures
  const failedRequests = [];
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });
  
  // Navigate through main screens to trigger loads
  await page.waitForTimeout(2000);
  
  // Test desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'app-desktop.png', fullPage: true });
  
  // Test mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'app-mobile.png', fullPage: true });
  
  // Test tablet
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'app-tablet.png', fullPage: true });
  
  // Final error check
  const finalErrors = await page.evaluate(() => window.__novaErrs || []);
  console.log('FINAL ERRORS:', finalErrors);
  
  return { done: true, errors: finalErrors };
}