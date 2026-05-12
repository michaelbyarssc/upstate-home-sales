import { test, expect } from '@playwright/test';

/**
 * Phase I follow-up — smoke tests for the public-facing surface.
 *
 * Each test asserts a page renders with the expected anchor content + no
 * console errors (filtering Chrome-extension noise). These run against
 * production (or a preview URL via PLAYWRIGHT_BASE_URL).
 */

const IGNORED_CONSOLE_PATTERNS = [
  /A listener indicated an asynchronous response/, // Chrome extension noise
  /Failed to load resource.*favicon/,             // Browser favicon 404s
  /Mixed Content/,                                // Some 3rd-party widgets do this
];

function attachConsoleAssertions(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(err.message))) return;
    errors.push(err.message);
  });
  return errors;
}

test.describe('public site smoke', () => {
  test('home page renders with hero', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Upstate Home Sales/);
    await expect(page.getByRole('heading', { name: /Manufactured homes/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('inventory list renders + has at least one home card', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/inventory');
    // Inventory page uses breadcrumb + h2 sections (no h1).
    await expect(page.getByRole('heading', { name: /Our homes/i })).toBeVisible();
    // SmartSearchBar (PR #22 — replaces the old separate "Smart search" button)
    // renders the input + a submit button that flips between "Filter" and
    // "✨ Smart filter" depending on whether the query looks like natural
    // language. Default state with empty input → "Filter".
    await expect(page.getByPlaceholder(/Search — try/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Filter/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('marketplace renders (empty state OK)', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { name: /Manufactured homes across SC dealers/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('default location sub-site /main renders with brand', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/main');
    // Should show the location's eyebrow label OR fall back to org name.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('design studio loads with placeholder geometry', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    // Pick a stock number known to exist in seed data.
    await page.goto('/inventory/UH-1434-AS/design');
    // Wait for canvas to mount (Three.js takes a moment).
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    // Side panel total should render.
    await expect(page.getByText('Total')).toBeVisible();
    // Don't assert empty errors — Three.js sometimes warns about WebGL extensions.
  });

  test('financing calculator loads', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/financing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('contact form renders', async ({ page }) => {
    const errors = attachConsoleAssertions(page);
    await page.goto('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('public API smoke', () => {
  test('/api/v1/inventory rejects without auth', async ({ request }) => {
    const res = await request.get('/api/v1/inventory');
    expect(res.status()).toBe(401);
  });

  test('/api/v1/inventory rejects bogus bearer', async ({ request }) => {
    const res = await request.get('/api/v1/inventory', {
      headers: { Authorization: 'Bearer not-a-real-key' },
    });
    expect(res.status()).toBe(401);
  });

  test('/api/feeds/facebook-shop.xml requires org param', async ({ request }) => {
    const res = await request.get('/api/feeds/facebook-shop.xml');
    expect(res.status()).toBe(400);
  });

  test('/api/track accepts a beacon', async ({ request }) => {
    const res = await request.post('/api/track', {
      data: {
        session_id: 'pw-test-' + Date.now(),
        event_type: 'page_view',
        path: '/__pw_test',
      },
    });
    expect([200, 204]).toContain(res.status());
  });

  test('/place/<bogus> renders branded not-found', async ({ page }) => {
    await page.goto('/place/this-token-does-not-exist');
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
  });

  test('/d/<bogus> renders branded not-found', async ({ page }) => {
    await page.goto('/d/this-token-does-not-exist');
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
  });
});
