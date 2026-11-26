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
  
  // Explore each step
  for (let step = 2; step <= 6; step++) {
    await page.waitForTimeout(2000);
    
    // Get all buttons on the page
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim() || '',
        class: b.className,
        disabled: b.disabled,
        ariaLabel: b.getAttribute('aria-label') || ''
      })).filter(b => b.text || b.ariaLabel);
    });
    
    console.log(`STEP ${step} BUTTONS:`, JSON.stringify(buttons, null, 2));
    
    // Try to find a continue/next button
    const continueBtn = buttons.find(b => 
      b.text.toLowerCase().includes('continue') || 
      b.text.toLowerCase().includes('next') ||
      b.text.toLowerCase().includes('done') ||
      b.text.toLowerCase().includes('finish') ||
      b.text.toLowerCase().includes('verify') ||
      b.ariaLabel.toLowerCase().includes('continue') ||
      b.ariaLabel.toLowerCase().includes('next')
    );
    
    if (continueBtn && !continueBtn.disabled) {
      await page.click(`button:has-text("${continueBtn.text}")`);
      console.log(`Clicked: ${continueBtn.text}`);
    } else if (continueBtn && continueBtn.disabled) {
      console.log(`Continue button disabled: ${continueBtn.text}`);
      // Check for other interactive elements
      const inputs = await page.$$('input, [role="checkbox"], [role="radio"]');
      console.log(`Found ${inputs.length} inputs/checkboxes/radios`);
      // Try clicking the first checkbox if any
      for (const input of inputs) {
        await input.click();
        await page.waitForTimeout(500);
      }
      // Try continue again
      const retryBtn = await page.$('button:has-text("Continue"), button:has-text("Next"), button:has-text("Done"), button:has-text("Finish"), button:has-text("Verify")');
      if (retryBtn) {
        await retryBtn.click();
        console.log('Clicked after interaction');
      }
    } else {
      console.log('No continue button found');
      // Click copy button if exists
      const copyBtn = await page.$('button:has(svg.lucide-copy)');
      if (copyBtn) {
        await copyBtn.click();
        console.log('Clicked copy button');
        await page.waitForTimeout(1000);
        step--; // Retry this step
      }
    }
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
      allClasses: Array.from(new Set(allElements.flatMap(el => Array.from(el.classList)))).filter(c => c.includes('screen') || c.includes('layout') || c.includes('nav') || c.includes('chat') || c.includes('chats') || c.includes('desktop') || c.includes('mobile') || c.includes('aside') || c.includes('main') || c.includes('sidebar')),
      bodyClasses: Array.from(document.body.classList),
      htmlClasses: Array.from(document.documentElement.classList),
      rootInnerHTML: root ? root.innerHTML.substring(0, 5000) : 'no root'
    };
  });
  
  console.log('FINAL:', JSON.stringify(final, null, 2));
  
  return { done: true };
}