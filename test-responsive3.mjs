export default async function(page, ui) {
  // Wait for onboarding screen
  await page.waitForSelector('button:has-text("Create my identity")', { timeout: 60000 });
  await page.click('button:has-text("Create my identity")');
  await page.waitForTimeout(3000);
  
  // Test desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'desktop-1440.png', fullPage: true });
  
  const desktopInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      htmlWidth: html.clientWidth,
      htmlHeight: html.clientHeight,
      bodyWidth: document.body.clientWidth,
      bodyHeight: document.body.clientHeight,
      screens: Array.from(document.querySelectorAll('[class*="screen"], [class*="layout"], [class*="nav"], [class*="chats"], [class*="chat"]')).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  
  console.log('DESKTOP:', JSON.stringify(desktopInfo, null, 2));
  
  // Test tablet viewport
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tablet-768.png', fullPage: true });
  
  const tabletInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      htmlWidth: html.clientWidth,
      htmlHeight: html.clientHeight,
      bodyWidth: document.body.clientWidth,
      bodyHeight: document.body.clientHeight,
      screens: Array.from(document.querySelectorAll('[class*="screen"], [class*="layout"], [class*="nav"], [class*="chats"], [class*="chat"]')).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  
  console.log('TABLET:', JSON.stringify(tabletInfo, null, 2));
  
  // Test mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'mobile-375.png', fullPage: true });
  
  const mobileInfo = await page.evaluate(() => {
    const root = document.getElementById('root');
    const html = document.documentElement;
    return {
      rootWidth: root ? root.clientWidth : 0,
      rootHeight: root ? root.clientHeight : 0,
      htmlWidth: html.clientWidth,
      htmlHeight: html.clientHeight,
      bodyWidth: document.body.clientWidth,
      bodyHeight: document.body.clientHeight,
      screens: Array.from(document.querySelectorAll('[class*="screen"], [class*="layout"], [class*="nav"], [class*="chats"], [class*="chat"]')).map(el => ({
        class: el.className,
        width: el.clientWidth,
        height: el.clientHeight,
        display: window.getComputedStyle(el).display,
        flexDirection: window.getComputedStyle(el).flexDirection
      }))
    };
  });
  
  console.log('MOBILE:', JSON.stringify(mobileInfo, null, 2));
  
  return { done: true };
}