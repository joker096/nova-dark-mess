import { test, expect } from '@playwright/test';

test.describe('Widget chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat.html');
    // Wait for widget to initialize (even if backend unavailable, DOM renders)
    await page.waitForSelector('#wvc-root', { timeout: 10000 });
  });

  test('renders widget shell with all key elements', async ({ page }) => {
    await expect(page.locator('#wvc-root')).toBeVisible();
    await expect(page.locator('#wvc-title')).toContainText('Чат');
    await expect(page.locator('#wvc-status')).toBeVisible();
    await expect(page.locator('#wvc-messages')).toBeAttached();
    await expect(page.locator('#wvc-composer')).toBeVisible();
    await expect(page.locator('#wvc-input')).toBeVisible();
    await expect(page.locator('#wvc-send')).toBeVisible();
    await expect(page.locator('#wvc-close')).toBeVisible();
    await expect(page.locator('#wvc-delete-data')).toBeVisible();
  });

  test('input has placeholder text', async ({ page }) => {
    const input = page.locator('#wvc-input');
    await expect(input).toHaveAttribute('placeholder', /сообщение/i);
  });

  test('send button is initially disabled', async ({ page }) => {
    await expect(page.locator('#wvc-send')).toBeDisabled();
  });

  test('close button hides the chat', async ({ page }) => {
    await page.locator('#wvc-close').click();
    await expect(page.locator('#wvc-chat')).toBeHidden();
  });

  test('handoff section is hidden initially', async ({ page }) => {
    const handoff = page.locator('#wvc-handoff');
    await expect(handoff).toHaveCSS('display', 'none');
  });

  test('delete data button triggers confirm dialog', async ({ page }) => {
    // Accept the confirm dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.locator('#wvc-delete-data').click();
    // Chat should be hidden after deletion
    await expect(page.locator('#wvc-chat')).toBeHidden();
  });

  test('branding link points to Mess&Anger', async ({ page }) => {
    const link = page.locator('#wvc-branding-link');
    await expect(link).toContainText('Mess&Anger');
  });
});
