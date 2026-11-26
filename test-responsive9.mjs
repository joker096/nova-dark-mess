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
  
  // Step 3: Check what buttons are available
  const step3Buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim() || '',
      class: b.className,
      disabled: b.disabled,
      ariaLabel: b.getAttribute('aria-label') || ''
    })).filter(b => b.text || b.ariaLabel);
  });
  console.log('STEP 3 BUTTONS:', JSON.stringify(step3Buttons, null, 2));
  
  // Click continue/next button on step 3
  const step3Continue = step3Buttons.find(b => 
    b.text.toLowerCase().includes('continue') || 
    b.text.toLowerCase().includes('next') ||
    b.text.toLowerCase().includes('done') ||
    b.text.toLowerCase().includes('finish') ||
    b.text.toLowerCase().includes('verify') ||
    b.text.toLowerCase().includes('confirm')
  );
  if (step3Continue) {
    await page.click(`button:has-text("${step3Continue.text}")`);
    console.log(`Clicked step 3: ${step3Continue.text}`);
  }
  await page.waitForTimeout(3000);
  
  // Step 4
  const step4Buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim() || '',
      class: b.className,
      disabled: b.disabled,
      ariaLabel: b.getAttribute('aria-label') || ''
    })).filter(b => b.text || b.ariaLabel);
  });
  console.log('STEP 4 BUTTONS:', JSON.stringify(step4Buttons, null, 2));
  
  const step4Continue = step4Buttons.find(b => 
    b.text.toLowerCase().includes('continue') || 
    b.text.toLowerCase().includes('next') ||
    b.text.toLowerCase().includes('done') ||
    b.text.toLowerCase().includes('finish') ||
    b.text.toLowerCase().includes('verify') ||
    b.text.toLowerCase().includes('confirm')
  );
  if (step4Continue) {
    await page.click(`button:has-text("${step4Continue.text}")`);
    console.log(`Clicked step 4: ${step4Continue.text}`);
  }
  await page.waitForTimeout(3000);
  
  // Step 5
  const step5Buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim() || '',
      class: b.className,
      disabled: b.disabled,
      ariaLabel: b.getAttribute('aria-label') || ''
    })).filter(b => b.text || b.ariaLabel);
  });
  console.log('STEP 5 BUTTONS:', JSON.stringify(step5Buttons, null, 2));
  
  const step5Continue = step5Buttons.find(b => 
    b.text.toLowerCase().includes('continue') || 
    b.text.toLowerCase().includes('next') ||
    b.text.toLowerCase().includes('done') ||
    b.text.toLowerCase().includes('finish') ||
    b.text.toLowerCase().includes('verify') ||
    b.text.toLowerCase().includes('confirm')
  );
  if (step5Continue) {
    await page.click(`button:has-text("${step5Continue.text}")`);
    console.log(`Clicked step 5: ${step5Continue.text}`);
  }
  await page.waitForTimeout(3000);
  
  // Step 6
  const step6Buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim() || '',
      class: b.className,
      disabled: b.disabled,
      ariaLabel: b.getAttribute('aria-label') || ''
    })).filter(b => b.text || b.ariaLabel);
  });
  console.log('STEP 6 BUTTONS:', JSON.stringify(step6Buttons, null, 2));
  
  const step6Continue = step6Buttons.find(b => 
    b.text.toLowerCase().includes('continue') || 
    b.text.toLowerCase().includes('next') ||
    b.text.toLowerCase().includes('done') ||
    b.text.toLowerCase().includes('finish') ||
    b.text.toLowerCase().includes('verify') ||
    b.text.toLowerCase().includes('confirm') ||
    b.text.toLowerCase().includes('start') ||
    b.text.toLowerCase().includes('enter') ||
    b.text.toLowerCase().includes('get started')
  );
  if (step6Continue) {
    await page.click(`button:has-text("${step6Continue.text}")`);
    console.log(`Clicked step 6: ${step6Continue.text}`);
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
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"]')).map(el => ({
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
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"]')).map(el => ({
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
      layoutElements: Array.from(document.querySelectorAll('[class*="aside"], [class*="main"], [class*="sidebar"], [class*="chats"], [class*="chat-screen"], [class*="layout"], [class*="bottom"], [class*="nav"], [class*="BottomNav"]')).map(el => ({
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