import { test, expect } from '@playwright/test';

/**
 * Full-stack E2E test. Requires the backend (NestJS) and PostgreSQL to be running
 * and seeded, plus the frontend proxying to the backend.
 *
 * Enable with:
 *   $env:E2E_FULL_STACK="1"; npm run test:e2e
 */
test.describe('Authentication flow (full stack)', () => {
  test.skip(!process.env.E2E_FULL_STACK, 'Set E2E_FULL_STACK=1 with the backend running to execute.');

  test('a user can register, land on the feed and log out', async ({ page }) => {
    const unique = `e2e_${Date.now()}`;

    await page.goto('/register');
    await page.getByLabel('Full name').fill('E2E Tester');
    await page.getByLabel('Username').fill(unique);
    await page.getByLabel('Email').fill(`${unique}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('Password123!');
    await page.getByLabel('Confirm password').fill('Password123!');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });
    await expect(page.getByText('QUITIN', { exact: true }).first()).toBeVisible();

    // Log out via the user menu.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
