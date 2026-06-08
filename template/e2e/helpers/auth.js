/**
 * Log in via the UI and wait for redirect to /dashboard.
 */
export async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}

/**
 * Register via the UI and wait for redirect to /dashboard.
 */
export async function registerAs(page, { firstName, lastName, email, password }) {
  await page.goto('/register');
  await page.locator('#firstName').fill(firstName);
  await page.locator('#lastName').fill(lastName);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard');
}
