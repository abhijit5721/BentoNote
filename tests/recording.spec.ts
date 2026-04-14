import { test, expect } from '@playwright/test';

test.describe('BentoNote Recording Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should start and stop recording in Neural Notes', async ({ page }) => {
    // Find the recording button in Neural Notes
    const textarea = page.locator('textarea[placeholder*="Type or record to"]');
    const container = textarea.locator('..');
    const recordingBtn = container.locator('button:has(svg.lucide-mic)');
    
    await expect(recordingBtn).toBeVisible();
    
    // Start recording
    await recordingBtn.click();
    
    // Verify recording state
    await expect(page.locator('text=Recording...')).toBeVisible();
    
    // Wait for a few seconds of "recording"
    await page.waitForTimeout(2000);
    
    // Stop recording - click the stop button in the overlay
    const stopBtn = page.locator('div:has-text("Recording...")').locator('div.w-16');
    await stopBtn.click({ force: true });
    
    // Verify overlay is gone
    await expect(page.locator('text=Recording...')).not.toBeVisible();
  });
});
