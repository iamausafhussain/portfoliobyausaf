/**
 * Loads the production build with its Content-Security-Policy and fails on any violation
 * (spec 09 OP-2). Run after `npm run build`:  node scripts/check-csp.mjs
 * Pages are opened with a dummy Supabase address, so data requests fail (that's fine: the
 * point is that nothing the site itself loads or runs is blocked).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const csp = /Content-Security-Policy: (.*)/.exec(readFileSync(`${root}dist/_headers`, 'utf8'))[1];
const port = 5190;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
const base = `http://localhost:${port}`;
for (let i = 0; i < 60; i++) {
  try {
    await fetch(base);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=swiftshader'],
});
const violations = [];
for (const path of [
  '/?tier=high',
  '/?tier=low',
  '/shop',
  '/projects/x',
  '/terms',
  '/admin',
  '/no-such-page',
]) {
  const page = await browser.newPage();
  // upgrade-insecure-requests would break plain-http localhost; everything else as on Netlify
  const policy = csp.replace('; upgrade-insecure-requests', '');
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = policy;
    await route.fulfill({ response: res, headers });
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(
        `CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`,
      ),
    );
  });
  page.on('console', (m) => {
    if (/CSP-VIOLATION|Content Security Policy/.test(m.text())) violations.push(`${path}: ${m.text()}`);
  });
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.close();
}
await browser.close();
server.kill();
if (violations.length) {
  console.error(`CSP violations:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log('CSP: no violations on 7 pages');
