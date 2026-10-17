/**
 * Draws public/og-default.png, the 1200×630 share card used when a page has no image of its
 * own (spec 09 SEO-3). Run again after changing your name or role:
 *   node scripts/make-og-image.mjs "Ausaf Hussain" "Full-stack developer & filmmaker"
 * Colours come from the dark theme tokens.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const name = process.argv[2] ?? 'Ausaf Hussain';
const role = process.argv[3] ?? 'Full-stack developer & filmmaker';
const tokens = readFileSync(`${root}src/theme/tokens.ts`, 'utf8');
const dark = tokens.slice(tokens.indexOf('dark: {'));
const color = (k) => new RegExp(`${k}: '(#[0-9A-Fa-f]{6})'`).exec(dark)[1];
const font = (f) => `data:font/woff2;base64,${readFileSync(`${root}public/fonts/${f}`).toString('base64')}`;
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const html = `<!doctype html><html><head><style>
@font-face { font-family: G; src: url(${font('eb-garamond-latin-italic-variable.woff2')}); font-style: italic; }
@font-face { font-family: I; src: url(${font('inter-latin-variable.woff2')}); }
html, body { margin: 0; width: 1200px; height: 630px; }
body { background: ${color('bg')}; color: ${color('fg')}; font-family: I; position: relative; overflow: hidden; }
.bar { position: absolute; left: 0; right: 0; height: 56px; background: #000; }
.top { top: 0; } .bottom { bottom: 0; }
.glow { position: absolute; right: -180px; top: 60px; width: 640px; height: 640px; border-radius: 50%;
  background: radial-gradient(circle, ${color('accent')}55, transparent 62%); }
.dots { position: absolute; right: 60px; top: 110px; width: 410px; height: 410px; border-radius: 50%;
  background: radial-gradient(${color('accent2')}AA 1.4px, transparent 1.6px) 0 0 / 14px 14px;
  -webkit-mask: radial-gradient(circle, #000 64%, transparent 66%); opacity: .7; }
.label { position: absolute; left: 88px; top: 150px; letter-spacing: .18em; font-size: 20px; color: ${color('accent')}; font-weight: 600; }
h1 { position: absolute; left: 80px; top: 180px; margin: 0; font-family: G; font-style: italic; font-weight: 400; font-size: 128px; line-height: 1.02; max-width: 760px; }
p { position: absolute; left: 88px; top: 470px; margin: 0; font-size: 30px; color: ${color('fgMuted')}; max-width: 700px; }
</style></head><body>
<div class="glow"></div><div class="dots"></div>
<div class="bar top"></div><div class="bar bottom"></div>
<div class="label">PORTFOLIO</div><h1>${esc(name)}</h1><p>${esc(role)}</p>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${root}public/og-default.png` });
await browser.close();
console.log('Wrote public/og-default.png');
