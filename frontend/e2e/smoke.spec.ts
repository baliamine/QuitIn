import { test, expect } from '@playwright/test';

/**
 * These tests only exercise the frontend in isolation (no backend required).
 * They validate routing, rendering and client-side form validation.
 */

test.describe('Landing page', () => {
  test('shows QUITIN branding and auth entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('QUITIN', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
    // The CTA appears in both the navbar and the hero, so use the first match.
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Grow your tech career');
  });

  test('navigates to the register page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Get started' }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Join QUITIN' })).toBeVisible();
  });
});

test.describe('Login page', () => {
  test('renders the login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });
});

test.describe('Register page', () => {
  test('validates mismatched passwords', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Ada Lovelace');
    await page.getByLabel('Username').fill('ada');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});

test.describe('Protected routes', () => {
  test('redirects unauthenticated visitors to login', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/login/);
  });
});
