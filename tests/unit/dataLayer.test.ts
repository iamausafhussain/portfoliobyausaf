/** AC-1.21 (env errors), AC-1.22 (invalid rows dropped), media URLs. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseRow, parseRows, setInvalidRowReporter } from '../../src/data/parse';
import { mediaUrl } from '../../src/lib/media';
import { readSupabaseEnv, SupabaseConfigError } from '../../src/lib/supabase';

describe('Supabase env (AC-1.21)', () => {
  it('names every missing variable and how to fix it', () => {
    expect(() => readSupabaseEnv({})).toThrowError(SupabaseConfigError);
    expect(() => readSupabaseEnv({})).toThrowError(
      /VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing/,
    );
    expect(() => readSupabaseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrowError(
      /VITE_SUPABASE_ANON_KEY is missing.*\.env\.example/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() =>
      readSupabaseEnv({ VITE_SUPABASE_URL: 'abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }),
    ).toThrowError(/must look like https:\/\//);
  });

  it('accepts valid values and trims a trailing slash', () => {
    expect(
      readSupabaseEnv({ VITE_SUPABASE_URL: ' https://abc.supabase.co/ ', VITE_SUPABASE_ANON_KEY: 'key' }),
    ).toEqual({
      url: 'https://abc.supabase.co',
      anonKey: 'key',
    });
  });

  it('getSupabase() fails fast without env vars', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { getSupabase } = await import('../../src/lib/supabase');
    expect(() => getSupabase()).toThrowError(/Supabase is not configured/);
    vi.unstubAllEnvs();
  });
});

describe('parseRows (AC-1.22)', () => {
  afterEach(() => setInvalidRowReporter(null));
  const schema = z.object({ id: z.string(), title: z.string().min(1) });

  it('keeps valid rows, drops and reports invalid ones', () => {
    const reported: string[] = [];
    setInvalidRowReporter((table, row) => reported.push(`${table}:${(row as { id: string }).id}`));
    const rows = parseRows(
      schema,
      [{ id: 'a', title: 'Ok' }, { id: 'b', title: '' }, { id: 'c' }],
      'projects',
    );
    expect(rows).toEqual([{ id: 'a', title: 'Ok' }]);
    expect(reported).toEqual(['projects:b', 'projects:c']);
  });

  it('logs a warning by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseRows(schema, [{ id: 'x' }], 'skills');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped invalid row in "skills" (x)'),
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('parseRow returns null for missing or invalid rows', () => {
    setInvalidRowReporter(() => {});
    expect(parseRow(schema, null, 't')).toBeNull();
    expect(parseRow(schema, { id: 'x' }, 't')).toBeNull();
    expect(parseRow(schema, { id: 'x', title: 'T' }, 't')).toEqual({ id: 'x', title: 'T' });
  });
});

describe('mediaUrl', () => {
  const base = 'https://abc.supabase.co';
  it('builds public storage URLs from bucket paths', () => {
    expect(mediaUrl('images/projects/a b.webp', base)).toBe(
      'https://abc.supabase.co/storage/v1/object/public/images/projects/a%20b.webp',
    );
    expect(mediaUrl('documents/resume.pdf', `${base}/`)).toBe(
      'https://abc.supabase.co/storage/v1/object/public/documents/resume.pdf',
    );
  });
  it('passes external https URLs through', () => {
    expect(mediaUrl('https://cdn.example.com/reel.mp4', base)).toBe('https://cdn.example.com/reel.mp4');
  });
  it('rejects unknown buckets', () => {
    expect(() => mediaUrl('secrets/x.txt', base)).toThrow(/not a storage path/);
    expect(() => mediaUrl('images', base)).toThrow(/not a storage path/);
  });
});
