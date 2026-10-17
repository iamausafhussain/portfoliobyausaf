/**
 * Repository guardrails — grep-style checks from the acceptance criteria.
 *  AC-0.4  no hard-coded colours outside src/theme/tokens.ts
 *  AC-0.5  folder structure matches master spec §10
 *  AC-0.7  no font family names outside src/theme/fonts.ts
 *  AC-1.24 no secrets or personal email committed
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontRoles, fonts } from '../../src/theme/fonts';

const root = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.pgtest', 'public']);

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');
const srcFiles = walk(path.join(root, 'src'), ['.ts', '.tsx', '.css']);

/** Strip comments so documentation can mention values. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('AC-0.4 colours only in tokens.ts', () => {
  const colourLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
  for (const file of srcFiles.filter((f) => rel(f) !== 'src/theme/tokens.ts')) {
    it(rel(file), () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const hit = code.split('\n').find((line) => colourLiteral.test(line));
      expect(hit, `colour literal found in ${rel(file)}`).toBeUndefined();
    });
  }
});

describe('AC-0.7 font names only in fonts.ts', () => {
  const families = fontRoles.map((r) => fonts[r].family);
  // css.ts is the generator that turns fonts.ts into @font-face rules
  const exempt = new Set(['src/theme/fonts.ts', 'src/theme/css.ts']);
  for (const file of srcFiles.filter((f) => !exempt.has(rel(f)))) {
    it(rel(file), () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const family of families) {
        expect(
          code.includes(`'${family}'`) || code.includes(`"${family}"`),
          `"${family}" in ${rel(file)}`,
        ).toBe(false);
      }
      // every font-family declaration must use a role variable
      for (const m of code.matchAll(/font-family:\s*([^;]+);/g)) {
        expect(m[1]?.trim(), `font-family in ${rel(file)}`).toMatch(/^var\(--font-(italic|body)\)$/);
      }
    });
  }
});

describe('AC-0.5 folder structure (master spec §10)', () => {
  const required = [
    'specs',
    'blender',
    'public/models',
    'public/fonts',
    'supabase/migrations',
    'supabase/seed.sql',
    'src/app',
    'src/theme',
    'src/theme/tokens.ts',
    'src/theme/fonts.ts',
    'src/lib',
    'src/data',
    'src/scene/shaders',
    'src/chapters',
    'src/components',
    'src/admin',
    'src/styles',
    'tests',
    'netlify.toml',
    '.env.example',
  ];
  for (const p of required) {
    it(p, () => expect(existsSync(path.join(root, p))).toBe(true));
  }
});

describe('AC-1.24 no secrets committed', () => {
  const files = walk(root, [
    '.ts',
    '.tsx',
    '.js',
    '.json',
    '.sql',
    '.md',
    '.toml',
    '.sh',
    '.example',
    '.css',
    '.html',
  ]);
  const forbidden: [string, RegExp][] = [
    ['JWT / Supabase key', /eyJhbGciOi[A-Za-z0-9_-]{10,}/],
    ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
    ['service role env var with value', /SERVICE_ROLE[A-Z_]*\s*=\s*\S+/],
    [
      'postgres connection string with password',
      /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@(?!localhost|127\.0\.0\.1)/,
    ],
    // built from parts so this file doesn't match itself
    ['personal email', new RegExp(['ausafhussain010', '@'].join(''), 'i')],
  ];
  for (const file of files) {
    it(rel(file), () => {
      const text = readFileSync(file, 'utf8');
      for (const [what, re] of forbidden) expect(re.test(text), `${what} in ${rel(file)}`).toBe(false);
    });
  }
});

describe('file names work on case-insensitive disks (Windows, macOS)', () => {
  // `import './ContactForm'` must not be able to pick `contactForm.ts` on Windows/macOS:
  // two code files in one folder may not share a name that differs only in capitals.
  const code = [
    ...walk(path.join(root, 'src'), ['.ts', '.tsx', '.js', '.jsx']),
    ...walk(path.join(root, 'tests'), ['.ts', '.tsx']),
    ...walk(path.join(root, 'supabase'), ['.ts']),
  ].filter((f) => !f.includes(`${path.sep}.results${path.sep}`));
  it('no two code files in a folder differ only by capital letters', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of code) {
      const stem = path.basename(f).replace(/\.(d\.)?[jt]sx?$/, '');
      const key = `${path.dirname(f)}/${stem}`.toLowerCase();
      const prev = seen.get(key);
      if (prev && path.basename(prev).replace(/\.(d\.)?[jt]sx?$/, '') !== stem)
        clashes.push(`${rel(prev)} ↔ ${rel(f)}`);
      seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });
});
