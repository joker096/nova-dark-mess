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
    // Also set other required localStorage items for the app to work
    localStorage.setItem('nova_app_theme', 'dark');
    localStorage.setItem('nova_font_size', 'medium');
  });
  await app.open('/');
  
  // Wait for the app to fully load - check for folder-tabs which indicates the main app is loaded
  // The app might show onboarding first if localStorage isn't read yet
}

test.describe('Nova Dark Messenger - Main App Features (onboarding pre-completed)', () => {
  test.beforeEach(async ({ app, browser }) => {
    await setupOnboardedApp({ app, browser });
  });

  test('Main app loads and chat screen is accessible', async ({ app, screen, browser }) => {
    // Verify app loads - check for folder tabs which are on the chats screen
    // The app might need time to initialize after onboarding check
    await expect(screen.getByTestId('folder-tabs').first()).toBeVisible({ timeout: 30000 });
    
    // Verify chat area is accessible (main element)
    await expect(screen.getByRole('main')).toBeVisible({ timeout: 10000 });
    
    // Send a message using textbox role
    const input = screen.getByRole('textbox', 'Type a message...');
    await input.fill('Hello from e2e test!');
    await input.press('Enter');
    
    // Verify message appears
    await expect(screen.getByText('Hello from e2e test!').first()).toBeVisible({ timeout: 5000 });
  });

  test('Navigation: all main screens accessible', async ({ app, screen, browser }) => {
    await expect(screen.getByTestId('folder-tabs').first()).toBeVisible({ timeout: 10000 });
    
    // Test desktop navigation rail (if desktop)
    // Click on a chat heading to open chat
    await screen.getByRole('heading', { name: 'Katie Rogers' }).tap();
    await expect(screen.getByRole('main')).toBeVisible();
    
    // Channel tab
    await screen.getByRole('button', { name: 'Channels' }).tap();
    await expect(screen.getByText('Real Kyiv Life').first()).toBeVisible();
    
    // Folders button - click the folder button in nav rail
    await screen.getByRole('button', { name: 'Folders' }).tap();
    // Folder modal opens - check for folder text
    await expect(screen.getByText('All')).toBeVisible({ timeout: 2000 });
    // Close folder modal
    await browser.keyboard.press('Escape');
    
    // Settings button
    await screen.getByRole('button', { name: 'Settings' }).tap();
    // Settings modal might not have testid, check for dialog
    await expect(screen.getByRole('dialog')).toBeVisible();
    await browser.keyboard.press('Escape');
  });

  test('Chat interactions work correctly', async ({ app, screen, browser }) => {
    await expect(screen.getByTestId('folder-tabs').first()).toBeVisible({ timeout: 10000 });
    await expect(screen.getByRole('main')).toBeVisible();
    
    // Composer interactions
    const input = screen.getByRole('textbox', 'Type a message...');
    await expect(input).toBeVisible();
    await input.focus();
    await input.fill('UI test message');
    await expect(input).toHaveValue('UI test message');
    
    // Send message
    await input.press('Enter');
    await expect(screen.getByText('UI test message').first()).toBeVisible({ timeout: 5000 });
    
    // Profile navigation
    await screen.getByRole('button', { name: 'Profile' }).tap();
    await expect(screen.getByTestId('profile-header').first()).toBeVisible({ timeout: 5000 });
    
    // Back to chats
    await screen.getByRole('button', { name: 'Back' }).tap();
    await expect(screen.getByTestId('folder-tabs').first()).toBeVisible();
  });

  test('Settings modal: theme switching and search', async ({ app, screen, browser }) => {
    await expect(screen.getByTestId('folder-tabs').first()).toBeVisible({ timeout: 10000 });
    
    // Open settings
    await screen.getByRole('button', { name: 'Settings' }).tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
    
    // Theme switching
    await screen.getByRole('button', { name: 'Light' }).tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
    
    await screen.getByRole('button', { name: 'Dark' }).tap();
    await expect(screen.getByRole('dialog')).toBeVisible();
    
    // Close settings
    await browser.keyboard.press('Escape');
    await expect(screen.getByRole('dialog')).not.toBeVisible();
    
    // Search in chats
    const searchInput = screen.getByRole('textbox', 'Search conversations by contact name...');
    await searchInput.fill('test');
    await expect(screen.getByText('test').first()).toBeVisible();
    await searchInput.clear();
  });
});

// Separate test suite for onboarding flow
test.describe('Nova Dark Messenger - Onboarding Flow', () => {
  test.beforeEach(async ({ app, browser }) => {
    // Clear localStorage for fresh onboarding
    await browser.addInitScript(() => {
      localStorage.clear();
    });
    await app.open('/');
  });

  test('Onboarding wizard appears on fresh install', async ({ app, screen, browser }) => {
    await expect(screen.getByTestId('onboarding-wizard')).toBeVisible();
    await expect(screen.getByTestId('onboarding-welcome')).toBeVisible();
    await expect(screen.getByText('Welcome to Nova')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Create my identity' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Restore from before' })).toBeVisible();
  });

  test('Can navigate past welcome screen', async ({ app, screen, browser }) => {
    // On welcome screen, click the language button first (in progress bar)
    await screen.getByRole('button', { name: 'English' }).tap();
    
    // Language screen should appear
    await expect(screen.getByTestId('onboarding-language')).toBeVisible({ timeout: 5000 });
    
    // Click Continue to go back to welcome
    await screen.getByRole('button', { name: 'Continue' }).tap();
    
    // Back on welcome screen, now create identity
    await expect(screen.getByTestId('onboarding-welcome')).toBeVisible();
    await screen.getByRole('button', { name: 'Create my identity' }).tap();
    
    // Should be on nickname screen now
    await expect(screen.getByTestId('onboarding-nickname')).toBeVisible();
  });

  test('Nickname screen validates input', async ({ app, screen, browser }) => {
    await screen.getByRole('button', { name: 'Create my identity' }).tap();
    
    // Skip language if it appears
    const languageBtn = screen.getByRole('button', { name: /English/ });
    if (await languageBtn.isVisible({ timeout: 1000 })) {
      await languageBtn.tap();
      await screen.getByRole('button', { name: 'Continue' }).tap();
    }
    
    await expect(screen.getByTestId('onboarding-nickname')).toBeVisible();
    
    // Continue button should be disabled initially
    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeDisabled();
    
    // Fill nickname
    const nicknameInput = screen.getByRole('textbox', 'Choose a nickname');
    await nicknameInput.fill('TestUser');
    await expect(continueBtn).toBeEnabled();
  });
});