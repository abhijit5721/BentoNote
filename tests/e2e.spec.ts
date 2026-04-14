import { test, expect } from '@playwright/test';

test.describe('Meeting Assistant E2E', () => {
  test('should load the main page and display tabs', async ({ page }) => {
    await page.goto('/');
    
    // Verify the header is present
    await expect(page.locator('text=Meeting Intelligence')).toBeVisible();
    
    // Verify the main tabs are present
    await expect(page.locator('button:has-text("Record")')).toBeVisible();
    await expect(page.locator('button:has-text("Transcript")')).toBeVisible();
  });

  test('should switch to Transcript mode and disable Generate button when empty', async ({ page }) => {
    await page.goto('/');
    
    // Click the Transcript tab
    await page.click('button:has-text("Transcript")');
    
    // Verify the textarea is visible
    const textarea = page.locator('textarea[placeholder*="Paste your Zoom"]');
    await expect(textarea).toBeVisible();
    
    // Verify the Generate MOM button is disabled initially
    const generateBtn = page.locator('button:has-text("Generate MOM")');
    await expect(generateBtn).toBeDisabled();
    
    // Type something into the textarea
    await textarea.fill('This is a test meeting transcript.');
    
    // Verify the Generate MOM button becomes enabled
    await expect(generateBtn).toBeEnabled();
  });
});
