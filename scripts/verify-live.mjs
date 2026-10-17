#!/usr/bin/env node
/**
 * Checks the security rules against your LIVE Supabase project (spec 01 task 1.14).
 *
 *   npm run db:verify
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.
 * Optional, for the owner checks (upload limits, owner access): set OWNER_EMAIL and
 * OWNER_PASSWORD in your shell for this one run — never put them in .env or commit them:
 *
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='…' npm run db:verify          (macOS/Linux)
 *   $env:OWNER_EMAIL='you@example.com'; $env:OWNER_PASSWORD='…'; npm run db:verify   (PowerShell)
 *
 * The script only reads data, plus uploads and immediately deletes three tiny test files
 * when owner credentials are given. It never changes your content.
 * If two-factor login is set up, the script asks for the current 6-digit code from your
 * authenticator app (or reads OWNER_TOTP_CODE).
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

function loadDotEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* no .env — rely on the environment */
  }
}
loadDotEnv();

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('✗ Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env first (see supabase/README.md).');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const ok = (cond, name, detail = '') => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const fresh = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const contentTables = [
  'hero_media',
  'projects',
  'achievements',
  'experience',
  'skills',
  'testimonials',
  'custom_sections',
  'custom_items',
];

console.log('\n▸ Anonymous visitor');
const anon = fresh();
{
  const { data, error } = await anon.from('site_settings').select('id, display_name');
  ok(!error && data?.length === 1, 'reads site_settings', error?.message);
}
for (const t of contentTables) {
  const { data, error } = await anon.from(t).select('id').eq('is_published', false);
  ok(
    !error && data.length === 0,
    `sees no unpublished ${t}`,
    error?.message ?? `${data?.length} rows visible`,
  );
}
for (const t of contentTables) {
  const { error } = await anon.from(t).insert({});
  ok(!!error, `cannot insert into ${t}`);
}
{
  const { error } = await anon.from('site_settings').update({ tagline: 'x' }).eq('id', 1);
  ok(!!error, 'cannot update site_settings');
}
{
  const { error } = await anon.from('messages').select('id').limit(1);
  ok(!!error, 'cannot read messages');
}
{
  // Part 7 (0009): the contact check is installed. A message with 6 links is refused before
  // anything is stored, so this leaves no trace in your inbox.
  const links = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join(' ');
  const { error } = await anon
    .from('messages')
    .insert({ name: 'Verify', email: 'verify@example.com', body: `Link check: ${links}` });
  ok(
    error?.message === 'too_many_links',
    'contact check is installed (0009)',
    error ? error.message : 'message was accepted — run 0009_contact.sql',
  );
}
{
  // Part 9 (0011): analytics are installed, and visitors can add but never read
  const { error: unknown } = await anon.rpc('track', { p_name: 'verify', p_path: '/' });
  ok(
    unknown?.message === 'bad_event',
    'analytics are installed and refuse unknown events (0011)',
    unknown ? unknown.message : 'accepted — run 0011_analytics.sql',
  );
  const { error: report } = await anon.rpc('traffic_report', {
    p_from: new Date(Date.now() - 86_400_000).toISOString(),
    p_to: new Date().toISOString(),
  });
  ok(!!report, 'cannot read traffic reports');
  const { data: alive, error: aliveError } = await anon.rpc('keep_alive');
  ok(alive === 'ok', 'keep_alive answers (0011)', aliveError?.message);
}
{
  const { error } = await anon.from('app_owner').select('*');
  ok(!!error, 'cannot read app_owner');
}
{
  const { error } = await anon.rpc('reorder', { p_table: 'projects', p_ids: [] });
  ok(!!error, 'cannot call reorder');
}
{
  const { data, error } = await anon.rpc('is_owner');
  ok(!error && data === false, 'is_owner() is false', error?.message);
}
{
  const { error } = await anon.storage
    .from('images')
    .upload(
      `verify/anon-${Date.now()}.png`,
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    );
  ok(!!error, 'cannot upload files');
}
{
  const { data, error } = await anon.storage.from('images').list();
  ok(!!error || (data?.length ?? 0) === 0, 'cannot list bucket contents', error?.message);
}

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;
if (!email || !password) {
  console.log('\n▸ Owner checks skipped (set OWNER_EMAIL and OWNER_PASSWORD for this run to include them)');
} else {
  console.log('\n▸ Owner');
  const owner = fresh();
  const { data: auth, error: authError } = await owner.auth.signInWithPassword({ email, password });
  if (authError) {
    ok(false, 'signs in', authError.message);
  } else {
    const aal = (await owner.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    const enforced = !(await owner.rpc('is_owner_account')).error;
    if (enforced) {
      const { data: before } = await owner.rpc('is_owner');
      ok(before === false, 'password alone gives no owner rights (two-factor enforced by 0008)');
    }
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      let code = process.env.OWNER_TOTP_CODE;
      if (!code && process.stdin.isTTY) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        code = await rl.question('  Enter the 6-digit code from your authenticator app: ');
        rl.close();
      }
      const { data: factors } = await owner.auth.mfa.listFactors();
      let verified = false;
      for (const f of factors?.totp ?? []) {
        const { error } = await owner.auth.mfa.challengeAndVerify({
          factorId: f.id,
          code: (code ?? '').trim(),
        });
        if (!error) {
          verified = true;
          break;
        }
      }
      ok(verified, 'accepts the authenticator code');
    }
    const { data: isOwner } = await owner.rpc('is_owner');
    ok(isOwner === true, 'is recognised as owner (setup step S6 done)');
    {
      const { error } = await owner.from('projects').select('id').eq('is_published', false);
      ok(!error, 'can read unpublished content', error?.message);
    }
    {
      const { error } = await owner.from('messages').select('id').limit(1);
      ok(!error, 'can read messages', error?.message);
    }
    const stamp = Date.now();
    const tiny = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    {
      const path = `verify/ok-${stamp}.png`;
      const { error } = await owner.storage.from('images').upload(path, tiny, { contentType: 'image/png' });
      ok(!error, 'can upload an image', error?.message);
      if (!error) await owner.storage.from('images').remove([path]);
    }
    {
      const path = `verify/wrong-type-${stamp}.txt`;
      const { error } = await owner.storage
        .from('documents')
        .upload(path, new Blob(['hello'], { type: 'text/plain' }), { contentType: 'text/plain' });
      ok(!!error, 'wrong file type is rejected (documents accepts PDF only)');
      if (!error) await owner.storage.from('documents').remove([path]);
    }
    {
      const path = `verify/too-big-${stamp}.png`;
      const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' });
      const { error } = await owner.storage.from('images').upload(path, big, { contentType: 'image/png' });
      ok(!!error, 'file over 5 MB is rejected');
      if (!error) await owner.storage.from('images').remove([path]);
    }
    await owner.auth.signOut();
  }
}

console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
