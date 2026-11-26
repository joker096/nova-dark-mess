/// <reference types="e2e" />

import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Helper to set up onboarding-completed state
async function setupOnboardedApp({ app, browser }) {
  await browser.addInitScript(() => {
    localStorage.setItem(
      'nova_onboarding_v1',
      JSON.stringify({ version: 1, completedAt: new Date().toISOString(), path: 'create' })
    );
    localStorage.setItem('nova_app_theme', 'dark');
    localStorage.setItem('nova_font_size', 'medium');
  });
  await app.open('/');
  await browser.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));
}

test.describe('Nova Dark Messenger - Main App Features (onboarding pre-completed)', () => {
  test.beforeEach(async ({ app, browser }) => {
    await setupOnboardedApp({ app, browser });
  });

  test('Main app loads and chat screen is accessible', async ({ app, screen, browser }) => {
    // Verify app loads - check for desktop sidebar (nav element)
    await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 30000 });
    
    // Verify chat area is accessible (main element)
    await expect(screen.getByRole('main')).toBeVisible({ timeout: 10000 });
    
    // Open Katie Rogers' chat from the sidebar
    await screen.getByRole('button', { name: 'Katie Rogers' }).click();
    
    // Wait for chat to open
    await expect(screen.getByRole('main')).toBeVisible({ timeout: 5000 });
    
    // Send a message using textbox role
    const input = screen.getByRole('textbox', 'Type a message...');
    await input.fill('Hello from e2e test!');
    await input.press('Enter');
    
    // Verify message appears
    await expect(screen.getByText('Hello from e2e test!').first()).toBeVisible({ timeout: 5000 });
  });

  test('Navigation: all main screens accessible', async ({ app, screen, browser }) => {
    // Check desktop sidebar navigation
    await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 10000 });
    
    // Test sidebar navigation - Chats (button with title "Chats")
    await expect(screen.getByRole('button', { name: 'Chats' })).toBeVisible();
    await screen.getByRole('button', { name: 'Katie Rogers' }).click();
    await expect(screen.getByRole('main')).toBeVisible();
    
    // Channel tab - click on Channels in sidebar
    await screen.getByRole('button', { name: 'Channels' }).click();
    await expect(screen.getByText('Real Kyiv Life').first()).toBeVisible({ timeout: 5000 });
    
    // Folders button - click the folder button in sidebar
    await screen.getByRole('button', { name: 'Folders' }).click();
    // Folder modal opens - check for folder text
    await expect(screen.getByText('All')).toBeVisible({ timeout: 2000 });
    // Close folder modal
    await browser.keyboard.press('Escape');
    
    // Settings button - in desktop sidebar
    await screen.getByRole('button', { name: 'Settings' }).click();
    await expect(screen.getByRole('dialog')).toBeVisible();
    await browser.keyboard.press('Escape');
  });

  test('Chat interactions work correctly', async ({ app, screen, browser }) => {
    await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 10000 });
    await expect(screen.getByRole('main')).toBeVisible();
    
    // Open Katie's chat
    await screen.getByRole('button', { name: 'Katie Rogers' }).click();
    
    // Composer interactions
    const input = screen.getByRole('textbox', 'Type a message...');
    await expect(input).toBeVisible();
    await input.focus();
    await input.fill('UI test message');
    await expect(input).toHaveValue('UI test message');
    
    // Send message
    await input.press('Enter');
    await expect(screen.getByText('UI test message').first()).toBeVisible({ timeout: 5000 });
    
    // Right-click on message for reaction picker (desktop)
    const message = screen.getByText('UI test message').first();
    await message.click({ button: 'right' });
    await expect(screen.getByRole('dialog', { name: /reaction/i })).toBeVisible({ timeout: 3000 });
    await browser.keyboard.press('Escape');
  });

  test('Search works across chats and messages', async ({ app, screen, browser }) => {
    await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 10000 });
    
    // Open search - on desktop it's in the sidebar header
    const searchBtn = screen.getByRole('button', { name: 'Search' });
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
    }
    
    // Search input should appear
    const searchInput = screen.getByRole('textbox', { name: /search/i });
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Katie');
    
    // Results should filter
    await expect(screen.getByText('Katie Rogers').first()).toBeVisible({ timeout: 3000 });
  });

  test('Theme switching works', async ({ app, screen, browser }) => {
    await expect(screen.getByRole('navigation')).toBeVisible({ timeout: 10000 });
    
    // Open settings from sidebar
    await screen.getByRole('button', { name: 'Settings' }).click();
    await expect(screen.getByRole('dialog')).toBeVisible();
    
    // Navigate to General tab
    await screen.getByRole('tab', { name: 'General' }).click();
    
    // Switch theme
    await screen.getByRole('radio', { name: 'Light' }).click();
    await expect(screen.locator('html')).toHaveAttribute('data-theme', 'light');
    
    await screen.getByRole('radio', { name: 'Dark' }).click();
    await expect(screen.locator('html')).toHaveAttribute('data-theme', 'dark');
    
    await screen.getByRole('radio', { name: 'System' }).click();
    
    // Close settings
    await browser.keyboard.press('Escape');
  });
});

test.describe('Nova Dark Messenger - Onboarding Flow', () => {
  test('Onboarding wizard appears on fresh install', async ({ app, screen, browser }) => {
    await browser.addInitScript(() => {
      localStorage.clear();
    });
    await app.open('/');
    
    // Should see welcome screen
    await expect(screen.getByText('Welcome to Nova Dark Messenger')).toBeVisible({ timeout: 10000 });
  });

  test('Can navigate past welcome screen', async ({ app, screen, browser }) => {
    await browser.addInitScript(() => {
      localStorage.clear();
    });
    await app.open('/');
    
    await expect(screen.getByText('Welcome to Nova Dark Messenger')).toBeVisible();
    await screen.getByRole('button', { name: 'Get Started' }).click();
    await expect(screen.getByText('Create Account')).toBeVisible({ timeout: 5000 });
  });

  test('Nickname screen validates input', async ({ app, screen, browser }) => {
    await browser.addInitScript(() => {
      localStorage.clear();
    });
    await app.open('/');
    
    await screen.getByRole('button', { name: 'Get Started' }).click();
    await expect(screen.getByText('Create Account')).toBeVisible();
    
    // Try to submit empty nickname
    const nicknameInput = screen.getByRole('textbox', { name: /nickname/i });
    await nicknameInput.fill('');
    await screen.getByRole('button', { name: 'Continue' }).click();
    
    // Should show validation error
    await expect(screen.getByText(/nickname is required/i)).toBeVisible({ timeout: 3000 });
  });
});