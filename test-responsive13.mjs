export default async function(page, ui) {
  // Wait for onboarding screen
  await page.waitForSelector('button:has-text("Create my identity")', { timeout: 60000 });
  await page.click('button:has-text("Create my identity")');
  await page.waitForTimeout(2000);
  
  // Step 1: Fill nickname and continue
  await page.fill('input[placeholder="e.g. Mira"]', 'TestUser');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(2000);
  
  // Step 2: Read seed phrase from DOM - get textContent of the grid
  const seedData = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="onboarding-seed"] .grid');
    if (!grid) return { words: [], joined: '' };
    const text = grid.textContent || '';
    // Text is like "1 normal 2 avoid 3 debris 4 yellow..." or "1normal2avoid3debris..."
    // Extract words by finding sequences of lowercase letters
    const words = text.match(/[a-z]+/gi) || [];
    return { words, joined: words.join(' ') };
  });
  console.log('SEED WORDS:', seedData.words);
  console.log('SEED PHRASE:', seedData.joined);
  console.log('WORD COUNT:', seedData.words.length);
  
  await page.click('button:has-text("I saved my phrase")');
  await page.waitForTimeout(3000);
  
  // Steps 3-5: Phrase check - answer correctly using seed phrase
  const seedWords = seedData.words;
  
  for (let round = 0; round < 3; round++) {
    await page.waitForTimeout(2000);
    
    // Get the question prompt to find which word index is asked
    const questionInfo = await page.evaluate(() => {
      const prompt = document.querySelector('[data-testid="onboarding-phrase-check"] p');
      const options = Array.from(document.querySelectorAll('[data-testid="phrase-check-option"]')).map(el => el.textContent?.trim() || '');
      return { prompt: prompt?.textContent?.trim() || '', options };
    });
    
    console.log(`ROUND ${round + 1}:`, questionInfo);
    
    // Extract word number from prompt like "Choose word #10"
    const match = questionInfo.prompt.match(/Choose word #(\d+)/i);
    if (match) {
      const wordIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based
      const correctWord = seedWords[wordIndex];
      console.log(`  Word index: ${wordIndex}, Correct word: "${correctWord}"`);
      
      // Find and click the correct option
      const optionIndex = questionInfo.options.findIndex(opt => opt === correctWord);
      if (optionIndex >= 0) {
        await page.click(`[data-testid="phrase-check-option"]:nth-child(${optionIndex + 1})`);
        console.log(`  Clicked option ${optionIndex + 1}: ${correctWord}`);
      } else {
        console.log(`  Correct word "${correctWord}" not found in options! Options:`, questionInfo.options);
        // Try case-insensitive
        const optionIndexCI = questionInfo.options.findIndex(opt => opt.toLowerCase() === correctWord.toLowerCase());
        if (optionIndexCI >= 0) {
          await page.click(`[data-testid="phrase-check-option"]:nth-child(${optionIndexCI + 1})`);
          console.log(`  Clicked option ${optionIndexCI + 1} (case-insensitive): ${questionInfo.options[optionIndexCI]}`);
        } else {
          console.log(`  Clicking first option as fallback`);
          await page.click('[data-testid="phrase-check-option"]');
        }
      }
    } else {
      console.log('  Could not parse prompt, clicking first option');
      await page.click('[data-testid="phrase-check-option"]');
    }
    
    await page.waitForTimeout(1000);
  }
  
  // Step 6: Security - skip PIN
  await page.waitForTimeout(2000);
  const skipBtn = await page.$('button:has-text("Skip")');
  if (skipBtn) {
    await skipBtn.click();
    console.log('Clicked Skip on security');
  } else {
    console.log('No Skip button on security');
  }
  await page.waitForTimeout(2000);
  
  // Step 7: Backup - skip
  const skipBtn2 = await page.$('button:has-text("Skip")');
  if (skipBtn2) {
    await skipBtn2.click();
    console.log('Clicked Skip on backup');
  } else {
    console.log('No Skip button on backup');
  }
  await page.waitForTimeout(2000);
  
  // Step 8: Done - click "Start messaging"
  const startBtn = await page.$('button:has-text("Start messaging")');
  if (startBtn) {
    await startBtn.click();
    console.log('Clicked Start messaging');
  } else {
    console.log('No Start messaging button');
  }
  await page.waitForTimeout(5000);
  
  // Check final state
  const final = await page.evaluate(() => {
    const root = document.getElementById('root');
    const allElements = Array.from(document.querySelectorAll('*'));
    return {
      rootChildren: root ? Array.from(root.children).map(el => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection,
        childrenCount: el.children.length
      })) : [],
      allClasses: Array.from(new Set(allElements.flatMap(el => Array.from(el.classList)))).filter(c => c.includes('screen') || c.includes('layout') || c.includes('nav') || c.includes('chat') || c.includes('chats') || c.includes('desktop') || c.includes('mobile') || c.includes('aside') || c.includes('main') || c.includes('sidebar') || c.includes('bottom') || c.includes('nav')),
      bodyClasses: Array.from(document.body.classList),
      htmlClasses: Array.from(document.documentElement.classList),
      rootInnerHTML: root ? root.innerHTML.substring(0, 5000) : 'no root'
    };
  });
  
  console.log('FINAL:', JSON.stringify(final, null, 2));
  
  // Test desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'desktop-1440.png', fullPage: true });
  
  const desktopInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"], [class*="chats-screen"], [class*="chat-screen"]')).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  console.log('DESKTOP INFO:', JSON.stringify(desktopInfo, null, 2));
  
  // Test tablet viewport
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tablet-768.png', fullPage: true });
  
  const tabletInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"], [class*="chats-screen"], [class*="chat-screen"])).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  console.log('TABLET INFO:', JSON.stringify(tabletInfo, null, 2));
  
  // Test mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'mobile-375.png', fullPage: true });
  
  const mobileInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"], [class*="chats-screen"], [class*="chat-screen"], [class*="BottomNav"], [class*="bottom-nav"]')).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  console.log('MOBILE INFO:', JSON.stringify(mobileInfo, null, 2));
  
  return { done: true };
}