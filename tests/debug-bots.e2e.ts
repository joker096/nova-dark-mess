import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('debug: check bot names in list', async ({ app, screen, browser }) => {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: 'e2e', path: 'create' })
    );
    localStorage.setItem('nova_app_theme', 'dark');
    localStorage.setItem('nova_font_size', 'medium');
  });
  await app.open('/');

  // Wait for app to load
  await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 30000 });

  // Open Settings from sidebar
  await screen.getByRole('button', { name: 'Settings' }).first().click();
  await expect(screen.getByRole('dialog')).toBeVisible();
  
  // Navigate to Advanced tab (Bots is there now)
  await screen.getByRole('tab', { name: 'Advanced' }).first().click();
  
  // Wait for tab content to load
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check bot names in list
  const debug = await browser.evaluate(() => {
    const allText = document.body.innerText;
    const hasEchoBot = allText.includes('Echo Bot');
    const hasNovaFather = allText.includes('NovaFather');
    const hasEchoUsername = allText.includes('@echo_bot');
    const hasNovaFatherUsername = allText.includes('@novafather_bot');
    
    // Check for bot list items
    const botItems = document.querySelectorAll('[role="button"]');
    const botItemsWithEcho = Array.from(botItems).filter(b => b.textContent?.includes('Echo'));
    const botItemsWithNova = Array.from(botItems).filter(b => b.textContent?.includes('NovaFather'));
    
    return {
      hasEchoBot,
      hasNovaFather,
      hasEchoUsername,
      hasNovaFatherUsername,
      botItemsCount: document.querySelectorAll('[role="button"]').length,
      echoBotItems: botItemsWithEcho.map(b => b.textContent?.substring(0, 100)),
      novaBotItems: botItemsWithNova.map(b => b.textContent?.substring(0, 100))
    };
  });
  
  console.log('DEBUG:', JSON.stringify(debug, null, 2));
  
  expect(true).toBe(true);
});