import { test, expect } from '@playwright/test';

/**
 * Full-stack E2E test for the AI assistant page.
 *
 * Requires the backend + PostgreSQL running. Enable with:
 *   $env:E2E_FULL_STACK="1"; npx playwright test assistant
 *
 * Behaviour depends on configuration:
 *  - No AI_API_KEY  -> the backend stores/returns a documented fallback message.
 *  - With AI_API_KEY -> a real (or mock) provider answer.
 * Either way the page must render, send, and show a reply WITHOUT crashing.
 */
test.describe('AI assistant (full stack)', () => {
  test.skip(!process.env.E2E_FULL_STACK, 'Set E2E_FULL_STACK=1 with the backend running to execute.');

  test('sends a message and shows an assistant reply without crashing', async ({ page }) => {
    // Log in as the seeded demo user.
    await page.goto('/login');
    await page.getByLabel('Email').fill('ada@quitin.dev');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/feed$/, { timeout: 15_000 });

    await page.goto('/assistant');
    // Wait for the chat thread to finish loading before counting bubbles.
    await expect(page.getByPlaceholder(/Ask the assistant/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('The assistant can make mistakes. Verify important information.')).toBeVisible();

    // Start a fresh conversation so the bubble count is deterministic.
    const bubbles = page.locator('div.inline-block.rounded-2xl');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(bubbles).toHaveCount(0, { timeout: 20_000 });

    // Each message bubble (user or assistant) renders as a div with
    // `inline-block rounded-2xl` classes; assistant markdown may split into
    // multiple paragraphs, so we count bubbles, not raw <p> tags.
    const before = await bubbles.count();

    const question = `Explain what a REST API is ${Date.now()}`;
    const composer = page.getByPlaceholder(/Ask the assistant/i);
    await composer.fill(question);
    await expect(composer).toHaveValue(question);
    const sendButton = page.getByRole('button', { name: 'Send', exact: true });
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // The user's own message is echoed back into the thread (+1 bubble).
    await expect(bubbles.filter({ hasText: question })).toBeVisible({ timeout: 30_000 });

    // An assistant reply must arrive (+2 bubbles total: user + assistant).
    // This works for both configurations: with no provider key the reply is the
    // documented fallback; with a key (Gemini/OpenAI/etc.) it is a real answer.
    await expect(bubbles).toHaveCount(before + 2, { timeout: 60_000 });

    // The page must still be functional (no crash / no error boundary).
    await expect(page).toHaveURL(/\/assistant/);
    await expect(page.getByPlaceholder(/Ask the assistant/i)).toBeVisible();
  });
});
