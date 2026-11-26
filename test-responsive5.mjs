export default async function(page, ui) {
  // Wait for onboarding screen
  await page.waitForSelector('button:has-text("Create my identity")', { timeout: 60000 });
  await page.click('button:has-text("Create my identity")');
  
  // Wait longer for onboarding to complete
  await page.waitForTimeout(10000);
  
  // Check what's on screen now
  const afterOnboarding = await page.evaluate(() => {
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
      allClasses: Array.from(new Set(allElements.flatMap(el => Array.from(el.classList)))).filter(c => c.includes('screen') || c.includes('layout') || c.includes('nav') || c.includes('chat') || c.includes('chats') || c.includes('desktop') || c.includes('mobile') || c.includes('aside') || c.includes('main') || c.includes('sidebar') || c.includes('chats-screen') || c.includes('chat-screen')),
      bodyClasses: Array.from(document.body.classList),
      htmlClasses: Array.from(document.documentElement.classList),
      rootInnerHTML: root ? root.innerHTML.substring(0, 5000) : 'no root'
    };
  });
  
  console.log('AFTER ONBOARDING:', JSON.stringify(afterOnboarding, null, 2));
  
  // Test desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'desktop-1440.png', fullPage: true });
  
  const desktopInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      rootInnerHTML: root ? root.innerHTML.substring(0, 3000) : 'no root'
    };
  });
  console.log('DESKTOP INFO:', JSON.stringify(desktopInfo, null, 2));
  
  // Test tablet viewport
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tablet-768.png', fullPage: true });
  
  // Test mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'mobile-375.png', fullPage: true });
  
  return { done: true };
}