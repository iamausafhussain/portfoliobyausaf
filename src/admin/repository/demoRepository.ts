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
  messageInsert,
  productInsert,
  projectInsert,
  siteSettingsUpdate,
  skillInsert,
  testimonialInsert,
} from '../../data/schemas';
import { conflictError, entityNames, labelFor, RepoError } from './errors';
import {
  demoHeroFiles,
  demoImages,
  demoMessages,
  demoOrders,
  demoProductFiles,
  demoProductId,
  demoRows,
  demoSettings,
} from './demoSeed';
import { createDemoShop } from './demoShop';
import { countTabs, filterMessages } from './messages';
import { countLinks, MAX_LINKS, SendError, type SendErrorCode } from '../../data/contact';
import { checkFileForBucket } from './limits';
import { verifyTotp } from './totp';
import type { PublicSource } from '../../data/source';
import { themes } from '../../theme/tokens';
import type {
  AdminRepository,
  AdminTable,
  AuthApi,
  AuthState,
  Authenticator,
  DataApi,
  FilesApi,
  MessageRow,
  MessagesApi,
  Row,
  StoredFile,
  Values,
} from './types';

const DEMO_EMAIL = 'demo@example.com';
const STRANGER_EMAIL = 'stranger@example.com';
const DEMO_CODE = '000000';
/** Real secret behind the demo QR code, so a scanned authenticator app works too. */
const DEMO_SECRET = 'JBSWY3DPEHPK3PXP';
const codeOk = async (code: string) => code.trim() === DEMO_CODE || (await verifyTotp(DEMO_SECRET, code));

const schemas: Record<AdminTable, z.ZodType> = {
  hero_media: heroMediaInsert,
  projects: projectInsert,
  achievements: achievementInsert,
  experience: experienceInsert,
  skills: skillInsert,
  testimonials: testimonialInsert,
  custom_sections: customSectionInsert,
  custom_items: customItemInsert,
  products: productInsert,
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
  products: {
    kind: 'pdf',
    tagline: '',
    description: '',
    included: [],
    requirements: '',
    version: '',
    file_format: '',
    file_size: null,
    is_free: false,
    price_usd: null,
    price_inr: null,
    cover: null,
    gallery: [],
    is_featured: false,
    provider_product_id: null,
    provider_product_id_inr: null,
  },
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

export function createDemoRepository(): AdminRepository & {
  publicSource: PublicSource;
  failSends(code: SendErrorCode | null): void;
  addMessages(count: number): void;
  shopDemo: ReturnType<typeof createDemoShop>;
} {
  let tables = demoRows();
  let settings = demoSettings();
  let inbox: MessageRow[] = demoMessages();
  /** Sends counted for the limits (spec 07 SP-3); in demo mode this browser is one visitor. */
  const sends: { email: string; at: number }[] = [];
  let sendFailure: SendErrorCode | null = null;
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
  for (const f of demoHeroFiles) {
    files.set(f.path, {
      path: f.path,
      size: f.size,
      contentType: f.contentType,
      updatedAt: '2026-10-01T09:00:00Z',
      url: `${import.meta.env.BASE_URL}hero-sample/${f.file}`,
    });
  }

  for (const f of demoProductFiles) {
    if (!f.file_path) continue;
    const body = `Demo product file: ${f.file_name}\n`;
    files.set(f.file_path, {
      path: f.file_path,
      size: 18_000_000,
      contentType: f.file_path.endsWith('.pdf') ? 'application/pdf' : 'application/zip',
      updatedAt: '2026-10-01T09:00:00Z',
      url: blobUrl(new Blob([body], { type: 'application/octet-stream' })),
    });
  }

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
      return {
        factorId: pendingFactor,
        uri: `otpauth://totp/Demo%20Portfolio:${encodeURIComponent(DEMO_EMAIL)}?secret=${DEMO_SECRET}&issuer=Demo%20Portfolio`,
        secret: DEMO_SECRET,
      };
    },
    async finishTotpSetup(factorId, code) {
      await delay();
      if (factorId !== pendingFactor || !(await codeOk(code))) {
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
      if (!(await codeOk(code))) throw new RepoError('credentials', 'Email, password or code is incorrect.');
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
    if ('slug' in row && (table === 'projects' || table === 'custom_sections' || table === 'products')) {
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
      // a product's private file goes with it (spec 08)
      if (table === 'products') shop.removeProduct(id);
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
      await delay(30);
      return inbox.filter((m) => m.status === 'new').length;
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

  /* ---------------- messages ---------------- */
  const messages: MessagesApi = {
    async list(query) {
      await delay(40);
      await requireOwner();
      const { rows, total } = filterMessages(inbox, query);
      return { rows: structuredClone(rows), total };
    },
    async counts() {
      await delay(30);
      await requireOwner();
      return countTabs(inbox);
    },
    async get(id) {
      await delay(30);
      await requireOwner();
      const m = inbox.find((x) => x.id === id);
      return m ? structuredClone(m) : null;
    },
    async setStatus(id, status) {
      await delay();
      await requireOwner();
      if (!inbox.some((m) => m.id === id)) throw new RepoError('not_found', 'This message no longer exists.');
      inbox = inbox.map((m) => (m.id === id ? { ...m, status } : m));
    },
    async remove(id) {
      await delay();
      await requireOwner();
      inbox = inbox.filter((m) => m.id !== id);
    },
  };

  /** The same rules as 0009_contact.sql, so the e2e tests can check them in demo mode. */
  function acceptMessage(input: unknown): MessageRow {
    const parsed = messageInsert.safeParse(input);
    if (!parsed.success) throw new SendError('invalid');
    const v = parsed.data;
    const body = v.body.trim();
    if (countLinks(body) > MAX_LINKS) throw new SendError('too_many_links');
    const email = v.email.trim().toLowerCase();
    const t = Date.now();
    const within = (ms: number) => sends.filter((s) => t - s.at < ms);
    const DAY = 86_400_000;
    if (
      within(10 * 60_000).length >= 3 ||
      within(DAY).length >= 10 ||
      within(DAY).filter((s) => s.email === email).length >= 5
    ) {
      throw new SendError('rate_limited');
    }
    sends.push({ email, at: t });
    return {
      id: crypto.randomUUID(),
      name: v.name.trim(),
      email,
      kind: v.kind ?? 'general',
      subject: (v.subject ?? '').trim(),
      body,
      budget: v.budget?.trim() || null,
      status: 'new',
      created_at: new Date(t).toISOString(),
    };
  }

  /* ---------------- shop (spec 08) ---------------- */
  const shop = createDemoShop(
    {
      products: () => tables.products,
      updateProduct(id, values) {
        const next = { ...tables.products.find((r) => r.id === id)!, ...values, updated_at: now() } as Row;
        tables = { ...tables, products: tables.products.map((r) => (r.id === id ? next : r)) };
        return next;
      },
      files,
      requireOwner,
      delay,
      now,
    },
    {
      files: demoProductFiles.map(({ product, ...f }) => ({ productId: demoProductId(product), ...f })),
      orders: demoOrders(),
    },
  );

  /** Read-only public view: published rows only, like RLS (spec 03 PD-1). */
  const publicSource: PublicSource = {
    kind: 'demo',
    async settings() {
      await delay(30);
      return structuredClone(settings);
    },
    async published(table) {
      await delay(30);
      return structuredClone(sorted(tables[table].filter((r) => r.is_published)));
    },
    async projectBySlug(slug) {
      await delay(30);
      const row = tables.projects.find((r) => r.slug === slug && r.is_published);
      return row ? structuredClone(row) : null;
    },
    async itemsFor(sectionIds) {
      await delay(30);
      const live = new Set(tables.custom_sections.filter((s) => s.is_published).map((s) => s.id));
      return structuredClone(
        sorted(
          tables.custom_items.filter(
            (i) =>
              i.is_published && sectionIds.includes(String(i.section_id)) && live.has(String(i.section_id)),
          ),
        ),
      );
    },
    mediaUrl: (path) => filesApi.url(path),
    async sendMessage(message) {
      await delay(300);
      if (sendFailure) throw new SendError(sendFailure);
      inbox = [acceptMessage(message), ...inbox];
    },
    async productBySlug(slug) {
      await delay(30);
      const row = tables.products.find((r) => r.slug === slug && r.is_published);
      return row ? structuredClone(row) : null;
    },
    shop: shop.publicApi,
  };

  return {
    publicSource,
    kind: 'demo',
    loginHint: `Demo mode: ${DEMO_EMAIL}, any password, code ${DEMO_CODE} (or scan the QR with a real authenticator app).`,
    auth,
    data,
    files: filesApi,
    messages,
    shop: shop.adminApi,
    /** Test hooks for the shop: sent emails, webhook timing, refunds. */
    shopDemo: shop,
    /** Test hook: make the next sends fail with this code (null to stop). */
    failSends(code: SendErrorCode | null) {
      sendFailure = code;
    },
    /** Test hook: older read messages, to fill the inbox past one page. */
    addMessages(count: number) {
      const start = Date.parse('2026-08-01T12:00:00Z');
      const extra: MessageRow[] = Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Demo Sender ${i + 1}`,
        email: `sender${i + 1}@example.com`,
        kind: 'general',
        subject: `Older message ${i + 1}`,
        body: 'Demo — an older message to fill the inbox.',
        budget: null,
        status: 'read',
        created_at: new Date(start - i * 3_600_000).toISOString(),
      }));
      inbox = [...inbox, ...extra];
    },
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
