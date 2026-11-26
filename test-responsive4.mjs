export default async function(page, ui) {
  // Wait for onboarding screen
  await page.waitForSelector('button:has-text("Create my identity")', { timeout: 60000 });
  await page.click('button:has-text("Create my identity")');
  await page.waitForTimeout(5000);
  
  // Get full DOM structure
  const fullInfo = await page.evaluate(() => {
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
      allClasses: Array.from(new Set(allElements.flatMap(el => Array.from(el.classList)))).filter(c => c.includes('screen') || c.includes('layout') || c.includes('nav') || c.includes('chat') || c.includes('chats') || c.includes('desktop') || c.includes('mobile') || c.includes('aside') || c.includes('main') || c.includes('sidebar')),
      bodyClasses: Array.from(document.body.classList),
      htmlClasses: Array.from(document.documentElement.classList)
    };
  });
  
  console.log('FULL INFO:', JSON.stringify(fullInfo, null, 2));
  
  // Test desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'desktop-1440.png', fullPage: true });
  
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