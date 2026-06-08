import { test, expect } from '@playwright/test';
import { loginAs, registerAs } from './helpers/auth.js';
import { checkAccessibility } from './helpers/a11y.js';

const SEEDED_USER = { email: 'user@forge.local', password: 'changeme123' };
const uniqueEmail = `e2e-${Date.now()}@e2etest.local`;

test.describe('Registration', () => {
  test('registers a new user and lands on dashboard', async ({ page }) => {
    await registerAs(page, {
      firstName: 'Test',
      lastName: 'E2E',
      email: uniqueEmail,
      password: 'Str0ng!Pass',
    });

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Welcome back, Test')).toBeVisible();
  });

  test('register page passes accessibility checks', async ({ page }) => {
    await page.goto('/register');
    const results = await checkAccessibility(page);
    expect(results.violations).toEqual([]);
  });

  test('shows validation error for duplicate email', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#firstName').fill('Dup');
    await page.locator('#lastName').fill('User');
    await page.locator('#email').fill(SEEDED_USER.email);
    await page.locator('#password').fill('Str0ng!Pass');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should show an error message and stay on /register
    await expect(page.locator('.bg-red-50, .text-red-600, .text-red-700').first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Login', () => {
  test('logs in with seeded user and lands on dashboard', async ({ page }) => {
    await loginAs(page, SEEDED_USER.email, SEEDED_USER.password);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Welcome back,')).toBeVisible();
  });

  test('login page passes accessibility checks', async ({ page }) => {
    await page.goto('/login');
    const results = await checkAccessibility(page);
    expect(results.violations).toEqual([]);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('navigates to register page via link', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Create one' }).click();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Logout', () => {
  test('logs out and redirects to login', async ({ page }) => {
    await loginAs(page, SEEDED_USER.email, SEEDED_USER.password);
    await expect(page).toHaveURL(/\/dashboard/);

    // Open user menu dropdown and click Log out
    await page.locator('header button:has(svg)').last().click();
    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Protected routes', () => {
  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirects / to /dashboard then to /login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Auth persistence', () => {
  test('stays authenticated after page refresh', async ({ page }) => {
    await loginAs(page, SEEDED_USER.email, SEEDED_USER.password);
    await expect(page).toHaveURL(/\/dashboard/);

    // Wait for initAuth to complete (refresh token rotation) before reloading
    await expect(page.getByText('Welcome back,')).toBeVisible({ timeout: 10000 });

    await page.reload();

    // Should still be on dashboard after refresh
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('Welcome back,')).toBeVisible({ timeout: 10000 });
  });

  test('dashboard passes accessibility checks', async ({ page }) => {
    await loginAs(page, SEEDED_USER.email, SEEDED_USER.password);
    await expect(page).toHaveURL(/\/dashboard/);

    const results = await checkAccessibility(page);
    expect(results.violations).toEqual([]);
  });
});
