/**
 * Part 8 — Box Office (spec 08 §5), against the demo site. The demo provider applies the same
 * rules as the Edge Functions (shared helpers); its emails land in an outbox the tests read
 * through window.__demoRepo.shopDemo. Data lives until a reload, so tests navigate client-side
 * after the first load.
 */
import { expect, test, type Page } from '@playwright/test';
import { demo, expectToast, go, signIn, watchErrors } from './helpers';

test.describe.configure({ retries: 2 });

interface Mail {
  to: string;
  subject: string;
  link: string;
  reason: 'purchase' | 'free' | 'fresh';
}

const shop = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(
    async ({ fn, args }) => {
      const s = (window as unknown as { __demoRepo: { shopDemo: Record<string, unknown> } }).__demoRepo
        .shopDemo;
      const [a, b] = fn.split('.') as [string, string | undefined];
      const target = b ? (s[a] as Record<string, (...x: unknown[]) => unknown>)[b]! : s[a];
      return (
        typeof target === 'function' ? await (target as (...x: unknown[]) => unknown)(...args) : target
      ) as T;
    },
    { fn, args },
  );

const outbox = (page: Page) => shop<Mail[]>(page, 'outbox');

/** Client-side navigation (a reload would reset the demo backend). */
const nav = (page: Page, path: string) =>
  page.evaluate((u) => {
    history.pushState(null, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);

async function open(page: Page, path: string) {
  await page.addInitScript(() => sessionStorage.setItem('intro-played', '1'));
  await page.goto(path);
  await page.waitForFunction(() => '__demoRepo' in window);
}

/** Buys the drone LUTs through the demo checkout and waits for the Download button. */
async function buy(page: Page, email = 'buyer@example.com') {
  await nav(page, '/shop/cinematic-drone-luts');
  await page.locator('[data-buy]').click();
  await page.locator('[data-demo-checkout]').waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Pay (demo)' }).click();
  await expect(page.locator('[data-download]')).toBeVisible();
}

test('Box Office chapter: featured posters only, drafts hidden, links to /shop', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/?tier=low');
  const chapter = page.locator('#shop');
  await chapter.scrollIntoViewIfNeeded();
  await expect(chapter.locator('[data-product]')).toHaveCount(3);
  await expect(chapter.locator('[data-product="editing-bundle"]')).toHaveCount(0);
  await chapter.getByRole('link', { name: /Visit the shop|See all/ }).click();
  await expect(page).toHaveURL(/\/shop$/);
  const grid = page.locator('[data-shop-grid]');
  await expect(grid.locator('[data-product]')).toHaveCount(3);
  await page.locator('[data-kind="pdf"]').click();
  await expect(grid.locator('[data-product]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('buy → demo checkout → thanks → download, with the email link', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, '/shop');
  // long enough to see the waiting state even on a busy machine
  await shop(page, 'setWebhookDelay', 4000);
  await nav(page, '/shop/cinematic-drone-luts');
  const box = page.locator('[data-buy-box]');
  await expect(box.locator('[data-price]')).toHaveText('$19');
  await box.getByRole('button', { name: 'INR' }).click();
  await expect(box.locator('[data-price]')).toHaveText('₹1,499');
  await page.locator('[data-buy]').click();
  await expect(page.locator('[data-demo-amount]')).toHaveText('₹1,499');
  await page.getByLabel('Email').fill('Buyer@Example.com');
  await page.getByRole('button', { name: 'Pay (demo)' }).click();
  await expect(page.getByText('Confirming your payment…')).toBeVisible();
  await expect(page.locator('[data-download]')).toBeVisible();

  const mails = await outbox(page);
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ to: 'buyer@example.com', reason: 'purchase' });
  expect(mails[0]!.link).toMatch(/^\/d\/[A-Za-z0-9_-]{43}$/);

  const download = page.waitForEvent('download').catch(() => null);
  await page.locator('[data-download]').click();
  await download;
  await page.getByRole('link', { name: 'Open the download page' }).click();
  await expect(page).toHaveURL(mails[0]!.link);
  await expect(page.locator('[data-left]')).toContainText('4 of 5 downloads left');
  expect(errors).toEqual([]);
});

test('download limit, fresh link by email, old link stops working', async ({ page }) => {
  await open(page, '/shop');
  await shop(page, 'setWebhookDelay', 0);
  await buy(page);
  const [mail] = await outbox(page);
  const token = mail!.link.slice(3);
  for (let i = 0; i < 5; i++) await shop(page, 'publicApi.download', token);
  await nav(page, mail!.link);
  await expect(page.locator('[data-block="used_up"]')).toBeVisible();
  await page.locator('[data-refresh]').click();
  await expect(page.locator('[data-sent]')).toBeVisible();
  const mails = await outbox(page);
  expect(mails.at(-1)).toMatchObject({ reason: 'fresh', to: 'buyer@example.com' });
  expect(mails.at(-1)!.link).not.toBe(mail!.link);
  // the old link no longer works; the new one has 5 downloads again
  await nav(page, '/shop');
  await page.locator('[data-shop-grid]').waitFor();
  await nav(page, mail!.link);
  await expect(page.getByText('This link isn’t valid')).toBeVisible();
  await nav(page, mails.at(-1)!.link);
  await expect(page.locator('[data-left]')).toContainText('5 of 5 downloads left');
});

test('a refund stops the link', async ({ page }) => {
  await open(page, '/shop');
  await shop(page, 'setWebhookDelay', 0);
  await buy(page);
  const id = await shop<string>(page, 'latestOrderId');
  await shop(page, 'refund', id);
  const [mail] = await outbox(page);
  await nav(page, mail!.link);
  await expect(page.locator('[data-block="refunded"]')).toBeVisible();
  await expect(page.locator('[data-download]')).toHaveCount(0);
});

test('free product: link by email, no checkout', async ({ page }) => {
  await open(page, '/shop/golden-hour-lut');
  await expect(page.locator('[data-buy]')).toHaveCount(0);
  await page.locator('#claim-email').fill('not-an-email');
  await page.getByRole('button', { name: 'Send me the download' }).click();
  await expect(page.locator('#claim-error')).toBeVisible();
  await page.locator('#claim-email').fill('fan2@example.com');
  await page.getByRole('button', { name: 'Send me the download' }).click();
  await expect(page.locator('[data-claim-sent]')).toBeVisible();
  expect(await outbox(page)).toEqual([expect.objectContaining({ to: 'fan2@example.com', reason: 'free' })]);
});

test('thanks page without a valid reference, and policy pages', async ({ page }) => {
  await open(page, '/shop/thanks?ref=nope');
  await expect(page.getByText('Nothing to show here')).toBeVisible();
  await nav(page, '/terms');
  await expect(page.getByRole('heading', { name: 'Terms of sale' })).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'Refund policy' })).toBeVisible();
  // unpublished policy pages are not found and not linked
  await expect(page.locator('footer').getByRole('link', { name: 'Privacy' })).toHaveCount(0);
  await nav(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Terms of sale' })).toHaveCount(0);
});

test('admin: new product with price and file becomes buyable', async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page);
  await go(page, 'Products');
  await expect(page.locator('[data-shop-mode="demo"]')).toBeVisible();
  await page.getByRole('link', { name: 'New product' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Night Grade Pack');
  await page.getByLabel('Price (USD)').fill('12.5');
  await page.getByLabel('Price in India (INR)').fill('999');
  await expect(page.getByText('Save the product first')).toBeVisible();
  await page.getByRole('button', { name: 'Save & publish' }).click();
  await expectToast(page, 'Saved and published.');
  const p = (await demo<Record<string, unknown>[]>(page, 'data.list', 'products')).find(
    (r) => r.title === 'Night Grade Pack',
  )!;
  expect(p).toMatchObject({ price_usd: 1250, price_inr: 99900, is_published: true });
  expect(p.provider_product_id).toBeTruthy();
  expect(p.provider_product_id_inr).toBeTruthy();

  await page
    .locator('[data-product-file] input[type=file]')
    .setInputFiles({ name: 'night grade.zip', mimeType: 'application/zip', buffer: Buffer.alloc(2048, 1) });
  await expect(page.locator('[data-file-name]')).toHaveText('night grade.zip');
  await expect(page.getByLabel('Format shown')).toHaveValue('ZIP');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, /^Saved\.$/);
  const file = await demo<{ file_path: string }>(page, 'shop.getFile', p.id);
  expect(file.file_path).toMatch(/^products\//);

  // the price change goes to the provider too, and buying works end to end
  await page.getByLabel('Price (USD)').fill('15');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, /^Saved\.$/);
  await shop(page, 'setWebhookDelay', 0);
  await nav(page, '/shop/night-grade-pack');
  await expect(page.locator('[data-price]')).toHaveText('$15');
  await page.locator('[data-buy-box]').getByRole('button', { name: 'USD' }).click();
  await page.locator('[data-buy]').click();
  await page.getByRole('button', { name: 'Pay (demo)' }).click();
  await expect(page.locator('[data-download]')).toBeVisible();
  const ready = page.waitForEvent('download');
  await page.locator('[data-download]').click();
  expect((await ready).suggestedFilename()).toBeTruthy();
  expect(errors).toEqual([]);
});

test('admin: orders filters, search, re-send, reset, revoke; sales card', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('[data-sales]')).toContainText('3 orders');
  await go(page, 'Orders');
  const orders = page.locator('[data-order]');
  await expect(orders).toHaveCount(5);
  await page.getByRole('button', { name: 'Refunded', exact: true }).click();
  await expect(orders).toHaveCount(1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByPlaceholder('Search by email or name').fill('traveller');
  await expect(orders).toHaveCount(1);
  const row = orders.first();
  await expect(row.locator('[data-downloads]')).toContainText('5 of 5');

  await row.getByRole('button', { name: 'Reset downloads' }).click();
  await expectToast(page, 'Downloads reset');
  await expect(row.locator('[data-downloads]')).toContainText('0 of 5');

  await row.getByRole('button', { name: 'Re-send link' }).click();
  await expectToast(page, 'A fresh link is on its way to traveller@example.com.');
  expect((await outbox(page)).at(-1)).toMatchObject({ to: 'traveller@example.com', reason: 'fresh' });

  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expectToast(page, 'Link revoked.');
  await expect(orders.first()).toHaveAttribute('data-status', 'revoked');
  await expect(orders.first().getByRole('button', { name: 'Re-send link' })).toHaveCount(0);
});

test('admin: policy pages are editable and published at their address', async ({ page }) => {
  await signIn(page);
  await go(page, 'Shop policies');
  await page.getByRole('tab', { name: /Privacy/ }).click();
  const form = page.locator('[data-policy="privacy"]');
  await form.getByRole('textbox', { name: 'Title' }).fill('Privacy notice');
  await form.getByRole('textbox', { name: 'Text' }).fill('We keep your email to send your download.');
  await form.getByText('Published', { exact: true }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, "Saved. It's live at /privacy.");
  await nav(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
  await expect(page.getByText('We keep your email to send your download.')).toBeVisible();
});

for (const [width, theme] of [
  [390, 'dark'],
  [1440, 'light'],
] as const) {
  test(`shop pages at ${width}px, ${theme} theme: no sideways scroll, no errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await open(page, '/shop');
    await shop(page, 'setWebhookDelay', 0);
    for (const path of ['/shop', '/shop/cinematic-drone-luts', '/shop/golden-hour-lut', '/terms']) {
      await nav(page, path);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(
        width,
      );
    }
    await buy(page);
    await expect(page.locator('[data-download]')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}
