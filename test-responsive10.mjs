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
  
  // Step 2: Click "I saved my phrase"
  await page.click('button:has-text("I saved my phrase")');
  await page.waitForTimeout(3000);
  
  // Steps 3-6: Phrase verification - click first option each time
  for (let step = 3; step <= 6; step++) {
    await page.waitForTimeout(2000);
    // Click the first phrase check option
    await page.click('[data-testid="phrase-check-option"]');
    await page.waitForTimeout(1000);
    console.log(`Clicked phrase option for step ${step}`);
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
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"], [class*="chats-screen"], [class*="chat-screen"]')).map(el => ({
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