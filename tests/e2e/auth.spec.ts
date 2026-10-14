/** Sign-in and security in the admin (spec 02 §5.1). */
import { expect, test } from '@playwright/test';
import { DEMO, expectToast, go, signIn, watchErrors } from './helpers';

test('AC-2.1 signed-out visitors are sent to login and returned to the page they asked for', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/admin/skills');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/admin\/skills$/);
  await expect(page.getByRole('heading', { name: 'Skills', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('AC-2.2 / AC-2.3 first sign-in sets up the authenticator; later sign-ins need a correct code', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Hello, Ausaf/);

  await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/login\/verify$/);

  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Email, password or code is incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/login\/verify$/);

  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test('AD-7 wrong password gives the generic message', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('someone@else.com');
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Email, password or code is incorrect.')).toBeVisible();
});

test("AC-2.5 a non-owner account can't get in", async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(DEMO.stranger);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("This account can't access the admin.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('AC-2.6 password rules: under 12 characters and mismatches are refused', async ({ page }) => {
  await signIn(page);
  await go(page, 'Account');
  const form = page
    .getByRole('group', { name: 'Change password' })
    .or(page.locator('section', { hasText: 'Change password' }));
  await form.getByLabel('New password', { exact: false }).first().fill('short');
  await form.getByLabel('Repeat new password').fill('short');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();

  await form.getByLabel('New password', { exact: false }).first().fill('a-long-enough-password');
  await form.getByLabel('Repeat new password').fill('a-different-password');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();

  await form.getByLabel('Repeat new password').fill('a-long-enough-password');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expectToast(page, 'Password changed.');
});

test('AC-2.6 forgot-password never reveals whether the email exists', async ({ page }) => {
  await page.goto('/admin/forgot-password');
  await page.getByLabel('Email').fill('anyone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If that address belongs to the admin account/)).toBeVisible();
});

test("AC-2.7 the only authenticator can't be removed; a backup can be added and removed", async ({
  page,
}) => {
  await signIn(page);
  await go(page, 'Account');
  const remove = page.getByRole('button', { name: 'Remove', exact: true });
  await expect(remove).toHaveCount(1);
  await expect(remove).toBeDisabled();

  await page.getByRole('button', { name: 'Add a backup authenticator' }).click();
  await page.getByLabel('6-digit code from the backup app').fill(DEMO.code);
  await page.getByRole('button', { name: 'Add backup' }).click();
  await expectToast(page, 'Backup authenticator added.');
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add a backup authenticator' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expectToast(page, 'Authenticator removed.');
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
});

test('AD-8 sign out of all devices', async ({ page }) => {
  await signIn(page);
  await go(page, 'Account');
  await page.getByRole('button', { name: 'Sign out of all devices' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});
