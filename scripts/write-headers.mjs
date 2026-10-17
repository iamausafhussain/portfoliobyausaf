/**
 * Writes dist/_headers with the Content-Security-Policy (spec 09 OP-2). Netlify merges it with
 * the headers in netlify.toml. The inline theme script (set before first paint, so the page
 * never flashes the wrong theme) is allowed by its hash, computed from the built page.
 *
 *   script-src  only this site (+ the theme script's hash): no third-party scripts at all
 *   connect-src this site and your Supabase project (data, sign-in, uploads, analytics)
 *   img / media https: anywhere, because the admin can point images and videos at any https URL
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(`${dist}index.html`, 'utf8');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
);

let supabase = 'https://*.supabase.co wss://*.supabase.co';
try {
  const host = new URL(process.env.VITE_SUPABASE_URL ?? '').host;
  if (host) supabase = `https://${host} wss://${host}`;
} catch {
  /* not set at build time: allow any Supabase project */
}

export const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')}`.trim(),
  // React's style attributes and the build's token stylesheet are inline
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

writeFileSync(`${dist}_headers`, `/*\n  Content-Security-Policy: ${csp}\n`);
console.log(
  `Wrote dist/_headers (CSP with ${hashes.length} inline script hash${hashes.length === 1 ? '' : 'es'})`,
);
