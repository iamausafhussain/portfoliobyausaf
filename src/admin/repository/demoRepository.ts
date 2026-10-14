/**
 * In-memory repository for development and tests (spec 02 §3.3). Loaded only when
 * VITE_DEMO=1 in dev; never part of a production build (test-enforced).
 *
 * Applies the same rules the database does: Zod insert schemas, unique slugs and skill
 * names, cascades, the edit-conflict check and bucket limits.
 *
 * Demo login: demo@example.com with any password; authenticator code 000000.
 * stranger@example.com signs in as a non-owner.
 */
import type { z } from 'zod';
import {
  achievementInsert,
  customItemInsert,
  customSectionInsert,
  experienceInsert,
  heroMediaInsert,
  projectInsert,
  siteSettingsUpdate,
  skillInsert,
  testimonialInsert,
} from '../../data/schemas';
import { conflictError, entityNames, labelFor, RepoError } from './errors';
import { demoImages, demoNewMessages, demoRows, demoSettings } from './demoSeed';
import { checkFileForBucket } from './limits';
import { themes } from '../../theme/tokens';
import type {
  AdminRepository,
  AdminTable,
  AuthApi,
  AuthState,
  Authenticator,
  DataApi,
  FilesApi,
  Row,
  StoredFile,
  Values,
} from './types';

const DEMO_EMAIL = 'demo@example.com';
const STRANGER_EMAIL = 'stranger@example.com';
const DEMO_CODE = '000000';

const schemas: Record<AdminTable, z.ZodType> = {
  hero_media: heroMediaInsert,
  projects: projectInsert,
  achievements: achievementInsert,
  experience: experienceInsert,
  skills: skillInsert,
  testimonials: testimonialInsert,
  custom_sections: customSectionInsert,
  custom_items: customItemInsert,
};

/** Database column defaults (supabase/migrations/0003_tables.sql). */
const defaults: Record<AdminTable, Values> = {
  hero_media: { video_webm: null, video_mobile: null, theme: 'both' },
  projects: {
    body: '',
    category: 'work',
    role: '',
    client: null,
    year: null,
    cover: null,
    gallery: [],
    tech: [],
    links: {},
    is_featured: false,
    globe: null,
  },
  achievements: {
    kind: 'other',
    issuer: null,
    awarded_on: null,
    description: '',
    image: null,
    link: null,
    is_highlighted: false,
  },
  experience: {
    employment_type: 'full_time',
    location: '',
    end_date: null,
    description: '',
    highlights: [],
    tech: [],
    logo: null,
  },
  skills: { level: null, icon: null, is_featured: false },
  testimonials: {
    author_role: '',
    author_company: '',
    avatar: null,
    rating: null,
    source_url: null,
    project_id: null,
  },
  custom_sections: {
    intro: '',
    layout: 'grid',
    insert_after: 'reviews',
    show_on_home: true,
    has_page: false,
    show_in_nav: false,
  },
  custom_items: { data: {} },
};

const serverFields = ['id', 'created_at', 'updated_at'];
const strip = (v: Values) => Object.fromEntries(Object.entries(v).filter(([k]) => !serverFields.includes(k)));
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Each write gets a strictly later timestamp, so conflict checks behave like the database. */
let clock = Date.parse('2026-10-14T00:00:00Z');
const now = () => new Date((clock += 1000)).toISOString();

function validate(table: AdminTable, values: Values): void {
  const result = schemas[table].safeParse(strip(values));
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path[0] !== undefined ? String(issue.path[0]) : undefined;
    throw new RepoError('invalid', `${field ? labelFor(field) : 'One of the values'} isn't valid.`, field);
  }
}

/** Placeholder artwork for demo images, drawn in the design-token colours. */
function placeholderSvg(label: string, w: number, h: number, variant: number): string {
  const { accent, accent2, globeBase, fg } = themes.dark.color;
  const pairs = [
    [accent, globeBase],
    [accent2, globeBase],
    [accent, accent2],
  ] as const;
  const [from, to] = pairs[variant % pairs.length]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" text-anchor="middle" font-family="serif" font-style="italic" font-size="${Math.round(h / 9)}" fill="${fg}" opacity="0.9">${label}</text></svg>`;
}

function blobUrl(blob: Blob, fallbackText?: string): string {
  try {
    if (typeof URL.createObjectURL === 'function') return URL.createObjectURL(blob);
  } catch {
    /* jsdom */
  }
  return fallbackText ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackText)}` : '';
}

export function createDemoRepository(): AdminRepository {
  let tables = demoRows();
  let settings = demoSettings();
  const files = new Map<string, StoredFile & { url: string }>();
  demoImages.forEach((img, i) => {
    const svg = placeholderSvg(img.label, img.w, img.h, i);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    files.set(img.path, {
      path: img.path,
      size: 180_000 + i * 23_000,
      contentType: 'image/webp',
      updatedAt: '2026-10-01T09:00:00Z',
      url: blobUrl(blob, svg),
    });
  });

  /* ---------------- auth ---------------- */
  let session: { email: string; aal: 'aal1' | 'aal2' } | null = null;
  let authenticators: Authenticator[] = [];
  let pendingFactor: string | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const auth: AuthApi = {
    async getState(): Promise<AuthState> {
      if (!session) return { status: 'signed_out' };
      const email = session.email;
      if (email !== DEMO_EMAIL) return { status: 'not_owner', email };
      if (authenticators.length === 0) return { status: 'needs_setup', email };
      if (session.aal !== 'aal2') return { status: 'needs_code', email };
      return { status: 'signed_in', email };
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, password) {
      await delay();
      const e = email.trim().toLowerCase();
      if (!password || (e !== DEMO_EMAIL && e !== STRANGER_EMAIL)) {
        throw new RepoError('credentials', 'Email, password or code is incorrect.');
      }
      session = { email: e, aal: 'aal1' };
      const state = await auth.getState();
      if (state.status === 'not_owner') session = null;
      emit();
      return state;
    },
    async startTotpSetup() {
      await delay();
      pendingFactor = `factor-${authenticators.length + 1}`;
      // A QR-looking placeholder (not scannable): three finder squares and a pseudo-random grid.
      const ink = themes.light.color.fg;
      const paper = themes.light.color.bgElevated;
      const finder = (x: number, y: number) =>
        `<rect x="${x}" y="${y}" width="7" height="7" fill="${ink}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="${paper}"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="${ink}"/>`;
      const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      const modules: string[] = [];
      for (let y = 0; y < 21; y++)
        for (let x = 0; x < 21; x++)
          if (!inFinder(x, y) && (x * 7 + y * 13 + x * y) % 3 === 0)
            modules.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${ink}"/>`);
      const qr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 25 25" shape-rendering="crispEdges"><rect x="-2" y="-2" width="25" height="25" fill="${paper}"/>${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}${modules.join('')}</svg>`;
      return {
        factorId: pendingFactor,
        qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`,
        secret: 'DEMO DEMO DEMO DEMO',
      };
    },
    async finishTotpSetup(factorId, code) {
      await delay();
      if (factorId !== pendingFactor || code.trim() !== DEMO_CODE) {
        throw new RepoError(
          'credentials',
          "That code didn't match. Check the time on your phone and try again.",
        );
      }
      authenticators = [
        ...authenticators,
        {
          id: factorId,
          name: authenticators.length === 0 ? 'Main phone' : 'Backup',
          createdAt: new Date().toISOString(),
        },
      ];
      pendingFactor = null;
      if (session) session.aal = 'aal2';
      emit();
    },
    async verifyCode(code) {
      await delay();
      if (code.trim() !== DEMO_CODE)
        throw new RepoError('credentials', 'Email, password or code is incorrect.');
      if (session) session.aal = 'aal2';
      emit();
    },
    async listAuthenticators() {
      return [...authenticators];
    },
    async removeAuthenticator(id) {
      if (authenticators.length <= 1)
        throw new RepoError('invalid', "You can't remove your only authenticator.");
      authenticators = authenticators.filter((a) => a.id !== id);
    },
    async changePassword(newPassword) {
      await delay();
      if (newPassword.length < 12) throw new RepoError('invalid', 'Use at least 12 characters.', 'password');
    },
    async passwordChangeNeedsCode() {
      return !!session && authenticators.length > 0 && session.aal !== 'aal2';
    },
    async requestPasswordReset() {
      await delay();
    },
    async signOut() {
      session = null;
      emit();
    },
    async mfaEnforced() {
      return true;
    },
  };

  /* ---------------- data ---------------- */
  const requireOwner = async () => {
    if ((await auth.getState()).status !== 'signed_in') {
      throw new RepoError('auth', 'Your session has expired — sign in again.');
    }
  };

  const checkUnique = (table: AdminTable, row: Values, selfId?: string) => {
    if ('slug' in row && (table === 'projects' || table === 'custom_sections')) {
      if (tables[table].some((r) => r.id !== selfId && r.slug === row.slug)) {
        throw new RepoError(
          'unique',
          `That web address is already used by another ${entityNames[table]}.`,
          'slug',
        );
      }
    }
    if (table === 'skills') {
      const name = String(row.name ?? '').toLowerCase();
      if (tables.skills.some((r) => r.id !== selfId && String(r.name).toLowerCase() === name)) {
        throw new RepoError('unique', 'You already have a skill with that name.', 'name');
      }
    }
    if (table === 'custom_items' && JSON.stringify(row.data ?? {}).length > 51200) {
      throw new RepoError('invalid', 'This item is too large (50 KB max).');
    }
  };

  const sorted = (rows: Row[]) =>
    [...rows].sort(
      (a, b) =>
        Number(a.sort_order) - Number(b.sort_order) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    );

  const data: DataApi = {
    async list(table, options) {
      await delay(40);
      await requireOwner();
      let rows = tables[table];
      if (options?.where) rows = rows.filter((r) => r[options.where!.column] === options.where!.value);
      return structuredClone(sorted(rows));
    },
    async get(table, id) {
      await delay(30);
      await requireOwner();
      const row = tables[table].find((r) => r.id === id);
      return row ? structuredClone(row) : null;
    },
    async create(table, values) {
      await delay();
      await requireOwner();
      const t = now();
      const row: Row = {
        ...defaults[table],
        sort_order: 0,
        is_published: false,
        ...strip(values),
        id: crypto.randomUUID(),
        created_at: t,
        updated_at: t,
      };
      validate(table, row);
      checkUnique(table, row);
      if (table === 'custom_items' && !tables.custom_sections.some((s) => s.id === row.section_id)) {
        throw new RepoError('invalid', 'That section no longer exists.');
      }
      tables = { ...tables, [table]: [...tables[table], row] };
      return structuredClone(row);
    },
    async update(table, id, values, expectedUpdatedAt) {
      await delay();
      await requireOwner();
      const current = tables[table].find((r) => r.id === id);
      if (!current) throw new RepoError('not_found', `This ${entityNames[table]} no longer exists.`);
      if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) throw conflictError();
      const next: Row = { ...current, ...strip(values), updated_at: now() };
      validate(table, next);
      checkUnique(table, next, id);
      tables = { ...tables, [table]: tables[table].map((r) => (r.id === id ? next : r)) };
      return structuredClone(next);
    },
    async remove(table, id) {
      await delay();
      await requireOwner();
      tables = { ...tables, [table]: tables[table].filter((r) => r.id !== id) };
      if (table === 'custom_sections') {
        tables = { ...tables, custom_items: tables.custom_items.filter((i) => i.section_id !== id) };
      }
      if (table === 'projects') {
        tables = {
          ...tables,
          testimonials: tables.testimonials.map((t) =>
            t.project_id === id ? { ...t, project_id: null } : t,
          ),
        };
      }
    },
    async reorder(table, ids) {
      await delay(40);
      await requireOwner();
      if (new Set(ids).size !== ids.length) throw new RepoError('invalid', 'Duplicate ids in reorder list.');
      tables = {
        ...tables,
        [table]: tables[table].map((r) => (ids.includes(r.id) ? { ...r, sort_order: ids.indexOf(r.id) } : r)),
      };
    },
    async getSettings() {
      await delay(30);
      await requireOwner();
      return structuredClone(settings);
    },
    async updateSettings(values, expectedUpdatedAt) {
      await delay();
      await requireOwner();
      if (expectedUpdatedAt && settings.updated_at !== expectedUpdatedAt) throw conflictError();
      const next = { ...settings, ...strip(values), id: 1 as const, updated_at: now() };
      const result = siteSettingsUpdate.safeParse(strip(next));
      if (!result.success) {
        const field = String(result.error.issues[0]?.path[0] ?? '');
        throw new RepoError(
          'invalid',
          `${field ? labelFor(field) : 'One of the values'} isn't valid.`,
          field || undefined,
        );
      }
      settings = next;
      return structuredClone(settings);
    },
    async countNewMessages() {
      return demoNewMessages;
    },
  };

  /* ---------------- files ---------------- */
  const filesApi: FilesApi = {
    async upload(bucket, objectPath, file, { contentType, onProgress, signal }) {
      checkFileForBucket(bucket, file.size, contentType);
      for (const step of [0.25, 0.5, 0.75]) {
        if (signal?.aborted) throw new RepoError('file', 'Upload cancelled.');
        await delay(50);
        onProgress?.(step);
      }
      if (signal?.aborted) throw new RepoError('file', 'Upload cancelled.');
      const path = `${bucket}/${objectPath}`;
      if (files.has(path)) throw new RepoError('file', 'A file with that name already exists.');
      files.set(path, {
        path,
        size: file.size,
        contentType,
        updatedAt: new Date().toISOString(),
        url: blobUrl(file),
      });
      onProgress?.(1);
      return path;
    },
    async remove(paths) {
      for (const p of paths) files.delete(p);
    },
    async listAll(bucket) {
      return [...files.values()]
        .filter((f) => f.path.startsWith(`${bucket}/`))
        .map(({ path, size, contentType, updatedAt }) => ({ path, size, contentType, updatedAt }));
    },
    url(path) {
      if (/^https:\/\//.test(path)) return path;
      return files.get(path)?.url ?? '';
    },
  };

  return {
    kind: 'demo',
    loginHint: `Demo mode: ${DEMO_EMAIL}, any password, code ${DEMO_CODE}.`,
    auth,
    data,
    files: filesApi,
  };
}

/** For tests: a fresh repository with the owner already signed in. */
export async function createSignedInDemoRepository(): Promise<AdminRepository> {
  const repo = createDemoRepository();
  await repo.auth.signIn(DEMO_EMAIL, 'demo');
  const setup = await repo.auth.startTotpSetup();
  await repo.auth.finishTotpSetup(setup.factorId, DEMO_CODE);
  return repo;
}

export const demoCredentials = { email: DEMO_EMAIL, code: DEMO_CODE, stranger: STRANGER_EMAIL };
