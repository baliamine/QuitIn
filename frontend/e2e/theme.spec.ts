import { test, expect } from '@playwright/test';

/**
 * Theme switching (dark <-> light).
 *
 * The public pages (landing / login / register) always run; the rest
 * requires the backend running. Enable those with:
 *   $env:E2E_FULL_STACK="1"; npx playwright test theme
 */
test.describe('Theme on public pages', () => {
  test('landing page has a toggle and applies the theme', async ({ page }) => {
    await page.goto('/');

    // The toggle is in the landing header (no login required).
    const toggle = page.getByRole('button', { name: /switch to (light|dark) mode/i });
    await expect(toggle).toBeVisible();

    // Starts dark by default, toggle switches to light.
    await expect(page.locator('html')).not.toHaveClass(/light/);
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).toBe('rgb(250, 250, 250)');

    // Choice survives a reload (inline script applies it before paint).
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light/);

    // Toggle back to dark.
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/light/);
    expect(await page.evaluate(() => localStorage.getItem('quitin-theme'))).toBe('dark');
  });

  test('login and register pages have the toggle too', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeVisible();

    await page.goto('/register');
    await expect(
      page.getByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeVisible();
  });
});

test.describe('Dark / light theme (full stack)', () => {
  test.skip(!process.env.E2E_FULL_STACK, 'Set E2E_FULL_STACK=1 with the backend running to execute.');

  test('navbar toggle switches theme and persists across reloads', async ({ page }) => {
    // Log in as the seeded demo user.
    await page.goto('/login');
    await page.getByLabel('Email').fill('ada@quitin.dev');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });

    // Starts in dark mode (default).
    await expect(page.locator('html')).not.toHaveClass(/light/);
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(9, 9, 11)');

    // Toggle to light via the header button.
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).toBe('rgb(250, 250, 250)');

    // Persisted in localStorage.
    const stored = await page.evaluate(() => localStorage.getItem('quitin-theme'));
    expect(stored).toBe('light');

    // Survives a full reload (the inline script must apply it before paint).
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light/);
    const bgAfterReload = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgAfterReload).toBe('rgb(250, 250, 250)');

    // Toggle back to dark.
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/light/);
    expect(await page.evaluate(() => localStorage.getItem('quitin-theme'))).toBe('dark');
  });

  test('settings page offers the same theme choice', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('ada@quitin.dev');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });

    await page.goto('/settings');
    await expect(page.getByText('Appearance')).toBeVisible();

    // The theme now lives in the Appearance tab.
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();

    // Switch to light from Settings.
    await page.getByRole('button', { name: 'light', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/light/);
    expect(await page.evaluate(() => localStorage.getItem('quitin-theme'))).toBe('light');

    // And back to dark so the next test starts from the default.
    await page.getByRole('button', { name: 'dark', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/light/);
  });
});
