/** The two-factor QR code must be scannable in both themes (fix for unreadable QR on dark mode). */
import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { DEMO, signIn } from './helpers';

for (const scheme of ['dark', 'light'] as const) {
  test(`QR code decodes to the otpauth link (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(DEMO.email);
    await page.getByLabel('Password').fill('x');
    await page.getByRole('button', { name: 'Continue' }).click();
    const img = page.locator('img[alt^="QR code"]');
    await expect(img).toBeVisible();
    const png = PNG.sync.read(await page.screenshot());
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code?.data).toMatch(/^otpauth:\/\/totp\/.+\?secret=[A-Z2-7]+&issuer=/);

    await page.getByRole('button', { name: /Show the setup key/ }).click();
    await expect(page.getByLabel('Setup key')).toHaveText(/^([A-Z2-7]{4} )*[A-Z2-7]{1,4}$/);
  });
}

test('phones get an "Open in authenticator app" link with the same otpauth URI', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('x');
  await page.getByRole('button', { name: 'Continue' }).click();
  const link = page.getByRole('link', { name: 'Open in authenticator app' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^otpauth:\/\/totp\//);
  await context.close();
});

test('the backup authenticator on the Account page shows a scannable QR code too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, '/admin/account');
  await page.getByRole('button', { name: 'Add a backup authenticator' }).click();
  await expect(page.locator('img[alt^="QR code"]')).toBeVisible();
  const png = PNG.sync.read(await page.screenshot({ fullPage: true }));
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toMatch(/^otpauth:\/\//);
});
