import { test, expect } from '@playwright/test';

test('Homepage should load successfully', async ({ page }) => {
  await page.goto('http://localhost:3000/');

  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveTitle(/QUITIN/i);
});