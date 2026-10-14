import { expect, type Page } from '@playwright/test';

export const DEMO = { email: 'demo@example.com', code: '000000', stranger: 'stranger@example.com' };

/** Collects console errors and uncaught exceptions for the page. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Signs in to the demo admin (first time: authenticator setup) and lands on `path`. */
export async function signIn(page: Page, path = '/admin') {
  await page.goto(path);
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill('any-password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/setup-2fa/);
  await page.getByLabel('6-digit code').fill(DEMO.code);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
}

/** Client-side navigation through the sidebar (a full reload would reset the demo backend). */
export async function go(page: Page, label: string) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: label, exact: true }).click();
  } else {
    await page.getByRole('complementary').getByRole('link', { name: label, exact: true }).click();
  }
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
}

/** Calls the in-memory demo backend from the test. */
export async function demo<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ({ fn, args }) => {
      const repo = (
        window as unknown as { __demoRepo: Record<string, Record<string, (...a: unknown[]) => unknown>> }
      ).__demoRepo;
      const [area, method] = fn.split('.') as [string, string];
      return (await repo[area]![method]!(...args)) as T;
    },
    { fn, args },
  );
}

/** Rows of a table, in display order. */
export const rows = (page: Page, table: string) =>
  demo<{ id: string; [k: string]: unknown }[]>(page, 'data.list', table);

/** Makes an image file in the browser (canvas → JPEG/PNG) and returns it for setInputFiles. */
export async function makeImage(page: Page, width: number, height: number, type = 'image/jpeg') {
  const base64 = await page.evaluate(
    async ({ width, height, type }) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, 'rgb(245,115,39)');
      g.addColorStop(1, 'rgb(73,171,232)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.7));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { width, height, type },
  );
  return {
    name: `test.${type === 'image/png' ? 'png' : 'jpg'}`,
    mimeType: type,
    buffer: Buffer.from(base64, 'base64'),
  };
}

/** A short real WebM clip recorded from a canvas (for poster capture). */
export async function makeVideo(page: Page) {
  const base64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext('2d')!;
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgb(${i * 12},80,160)`;
      ctx.fillRect(0, 0, 320, 180);
      await new Promise((r) => setTimeout(r, 40));
    }
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  return Buffer.from(base64, 'base64');
}

/** Keyboard drag with dnd-kit: pick up, move, drop — waiting for each step to register. */
export async function keyboardMove(page: Page, handleName: RegExp, key: 'ArrowUp' | 'ArrowDown', steps = 1) {
  const handle = page.getByRole('button', { name: handleName });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(150);
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(250);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: handleName })).not.toHaveAttribute('aria-pressed', 'true');
}
