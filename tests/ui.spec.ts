import { test, expect } from '@playwright/test';

test.describe('BentoNote UI and Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should toggle dark mode', async ({ page }) => {
    const html = page.locator('html');
    
    // Check initial state (should be dark by default based on App.tsx)
    await expect(html).toHaveClass(/dark/);
    
    // Find the dark mode toggle button (it's the last button in the header)
    // In App.tsx, it's a Button with variant="outline" and size="icon"
    const toggleBtn = page.locator('button:has(svg.lucide-sun), button:has(svg.lucide-moon)');
    await toggleBtn.click();
    
    // Check if dark class is removed
    await expect(html).not.toHaveClass(/dark/);
    
    // Toggle back
    await toggleBtn.click();
    await expect(html).toHaveClass(/dark/);
  });

  test('should interact with Neural Notes', async ({ page }) => {
    // Verify Neural Notes widget is present
    await expect(page.locator('text=Neural Notes')).toBeVisible();
    
    // Find the textarea in Neural Notes (SmartNote component)
    const textarea = page.locator('textarea[placeholder*="Type or record to"]');
    await expect(textarea).toBeVisible();
    
    // Type a prompt
    await textarea.fill('Write a short poem about coding.');
    
    // Verify the input value was set
    await expect(textarea).toHaveValue('Write a short poem about coding.');
    
    // Find and click the process button in the Neural Notes section
    const processBtn = page.locator('textarea[placeholder*="Type or record to"]').locator('..').locator('button:has(svg.lucide-sparkles)');
    await expect(processBtn).toBeEnabled();
  });
});
