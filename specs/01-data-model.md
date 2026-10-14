# Part 1 — Data Model, Security (RLS) and Auth

**Status:** Approved · Built and verified (2026-10-14) · live project set up
**Version:** 0.2 · 2026-10-14
**Depends on:** Part 0 (master spec v0.3)
**Feeds:** Part 2 (admin), Parts 4–7 (public chapters)

---

## 1. Scope

### In scope
- Postgres schema for every content entity in master spec §11, including hero media and admin-defined custom sections.
- Row Level Security (RLS) policies: who can read and write each table.
- Single-owner admin authentication.
- Storage buckets for images, video and documents, with type/size limits and access policies.
- Helper functions: `updated_at` trigger, owner check, reorder.
- Generated TypeScript types, Zod schemas and the Supabase client in the app.
- Automated tests that prove the security rules.
- Setup guide for creating the Supabase project.

### Out of scope (later parts)
- Admin UI screens → Part 2.
- Contact-form rate limiting and spam handling logic → Part 7 (this part only creates the table and its insert rule).
- Keeping the free Supabase project awake → Part 8.

## 2. Requirements

### 2.1 User stories

| ID | As… | I want… | So that… |
|---|---|---|---|
| US-1.1 | the owner | to sign in to `/admin` with my email and password | only I can change content |
| US-1.2 | the owner | nobody else to be able to create an account | the admin can't be taken over by a sign-up |
| US-1.3 | the owner | to create, edit, hide, reorder and delete every content type | I never need to touch code to update the site |
| US-1.4 | the owner | to define new sections with my own fields | I can add things like "Talks" or "Certifications" later |
| US-1.5 | a visitor | to see only published content | drafts stay private |
| US-1.6 | a visitor | to send a message through the contact form | I can reach Ausaf |
| US-1.7 | the owner | to be the only one who can read messages | enquiries stay private |
| US-1.8 | the owner | to upload images, videos and my resume | media is managed in one place |

### 2.2 Functional requirements

| ID | Requirement |
|---|---|
| DM-1 | Every content table has `id uuid`, `sort_order int`, `is_published bool`, `created_at`, `updated_at`. |
| DM-2 | `updated_at` is set automatically on every update. |
| DM-3 | `site_settings` can hold exactly one row. |
| DM-4 | Slugs are unique, lowercase, URL-safe (`^[a-z0-9]+(-[a-z0-9]+)*$`). |
| DM-5 | Text fields have length limits enforced in the database, not just the UI. |
| DM-6 | Every image reference includes alt text (master spec A-5). |
| DM-7 | Custom sections store their field definitions; their items store values as JSON. Deleting a section deletes its items. |
| DM-8 | Reordering a list is one call that rewrites `sort_order` for all given ids. |
| AU-1 | Exactly one owner account. Public sign-ups are disabled. |
| AU-2 | Owner identity is stored in the database (`app_owner`), not in frontend code. |
| AU-3 | Optional two-factor login (TOTP authenticator app) is supported; see Q1. |
| SEC-1.1 | Anonymous visitors can read published rows only. |
| SEC-1.2 | Anonymous visitors can insert into `messages` only, and cannot read it back. |
| SEC-1.3 | A signed-in user who is not the owner has the same rights as an anonymous visitor. |
| SEC-1.4 | Only the owner can write to any content table or storage bucket. |
| SEC-1.5 | The service-role key is never used by the app or committed to the repo. |

## 3. Design

### 3.1 Shared conventions

- Primary keys: `uuid default gen_random_uuid()`.
- Timestamps: `timestamptz not null default now()`.
- Every content table:
  ```sql
  sort_order   int     not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
  ```
- New rows default to **unpublished**; the owner publishes explicitly.
- **ImageRef** (stored as `jsonb`), validated by a database check function `is_image_ref()`:
  ```json
  { "path": "images/projects/abc.webp", "alt": "Dashboard screenshot", "width": 1600, "height": 900 }
  ```
  `path` (storage path or `https://` URL) and `alt` (1–200 chars) required; `width`/`height` optional but recommended (prevents layout shift, master spec P-5).

### 3.2 Enums

| Enum | Values |
|---|---|
| `project_category` | `work`, `freelance`, `personal` |
| `achievement_kind` | `award`, `certification`, `title`, `recognition`, `publication`, `other` |
| `employment_type` | `full_time`, `part_time`, `contract`, `freelance`, `internship` |
| `hero_source` | `upload`, `url` |
| `theme_scope` | `dark`, `light`, `both` |
| `hero_playback` | `single`, `sequence`, `random` |
| `message_kind` | `hire`, `freelance`, `collab`, `general` |
| `message_status` | `new`, `read`, `replied`, `archived` |
| `section_layout` | `grid`, `list`, `timeline`, `carousel`, `gallery` |
| `chapter_key` | `hero`, `about`, `projects`, `credits`, `timeline`, `reviews`, `contact` |

### 3.3 Tables

#### `app_owner`
| Column | Type | Rules |
|---|---|---|
| `user_id` | uuid PK | references `auth.users(id)` on delete cascade |
| `singleton` | boolean | `default true`, unique, `check (singleton)` → max one row |

No public access at all. Read only through `is_owner()`.

#### `site_settings` (single row)
| Column | Type | Rules |
|---|---|---|
| `id` | smallint PK | `default 1`, `check (id = 1)` |
| `display_name` | text | 1–80, default `'Ausaf Hussain'` |
| `tagline` | text | ≤ 160 |
| `bio_short` | text | ≤ 300 (hero/about intro) |
| `bio_long` | text | ≤ 5000, Markdown |
| `portrait` | jsonb | ImageRef, nullable |
| `location` | text | ≤ 80 |
| `public_email` | text | nullable, email format |
| `resume_path` | text | storage path to PDF, nullable |
| `socials` | jsonb | `{ github, linkedin, youtube, instagram, x }` — each optional `https://` URL |
| `available_for_work` | boolean | default `true` (shows a badge) |
| `hero_playback` | `hero_playback` | default `single` |
| `seo` | jsonb | `{ title, description, og_image }` |
| `updated_at` | timestamptz | |

Always public (it holds no secrets). No `is_published`.

#### `hero_media`
| Column | Type | Rules |
|---|---|---|
| `title` | text | 1–100 (also used as accessible label) |
| `source_type` | `hero_source` | |
| `video_mp4` | text | required; storage path if `upload`, `https://` URL if `url` |
| `video_webm` | text | optional |
| `video_mobile` | text | optional, smaller version for phones |
| `poster` | jsonb | ImageRef, **required** |
| `theme` | `theme_scope` | default `both` |
| + shared columns | | |

#### `projects`
| Column | Type | Rules |
|---|---|---|
| `slug` | text | unique, slug format |
| `title` | text | 1–100 |
| `summary` | text | 1–280 (card text) |
| `body` | text | ≤ 20000, Markdown (detail page) |
| `category` | `project_category` | |
| `role` | text | ≤ 100, e.g. "Backend lead" |
| `client` | text | ≤ 100, nullable |
| `year` | smallint | 2000–2100, nullable |
| `cover` | jsonb | ImageRef, nullable |
| `gallery` | jsonb | array of ImageRef, default `[]`, max 20 |
| `tech` | text[] | default `{}`, max 20 tags |
| `links` | jsonb | `{ live, repo, case_study, video }` — optional URLs |
| `is_featured` | boolean | default `false` (featured nodes are larger on the globe) |
| `globe` | jsonb | `{ lat, lng }`, nullable — null means auto-placed (Part 5) |
| + shared columns | | |

#### `achievements`
| Column | Type | Rules |
|---|---|---|
| `title` | text | 1–150 |
| `kind` | `achievement_kind` | |
| `issuer` | text | ≤ 120, nullable |
| `awarded_on` | date | nullable |
| `description` | text | ≤ 1000 |
| `image` | jsonb | ImageRef, nullable (badge, certificate) |
| `link` | text | URL, nullable (credential/verification) |
| `is_highlighted` | boolean | default `false` (shown larger in Credits Roll) |
| + shared columns | | |

#### `experience`
| Column | Type | Rules |
|---|---|---|
| `company` | text | 1–120 |
| `role` | text | 1–120 |
| `employment_type` | `employment_type` | |
| `location` | text | ≤ 80 |
| `start_date` | date | required |
| `end_date` | date | nullable = current; `check (end_date is null or end_date >= start_date)` |
| `description` | text | ≤ 2000, Markdown |
| `highlights` | text[] | max 10, each ≤ 200 |
| `tech` | text[] | max 20 |
| `logo` | jsonb | ImageRef, nullable |
| + shared columns | | |

#### `skills`
| Column | Type | Rules |
|---|---|---|
| `name` | text | 1–60, unique (case-insensitive) |
| `category` | text | 1–40 (free text; admin suggests: Frontend, Backend, Cloud, Data, DevOps, Tools, Creative) |
| `level` | smallint | 1–5, nullable |
| `icon` | text | nullable (icon key or image path) |
| `is_featured` | boolean | default `false` |
| + shared columns | | |

#### `testimonials`
| Column | Type | Rules |
|---|---|---|
| `quote` | text | 1–600 |
| `author_name` | text | 1–80 |
| `author_role` | text | ≤ 80 |
| `author_company` | text | ≤ 80 |
| `avatar` | jsonb | ImageRef, nullable |
| `rating` | smallint | 1–5, nullable |
| `source_url` | text | URL, nullable (e.g. LinkedIn recommendation) |
| `project_id` | uuid | FK → `projects(id)` on delete set null |
| + shared columns | | |

#### `custom_sections`
| Column | Type | Rules |
|---|---|---|
| `name` | text | 1–60, e.g. "Talks" |
| `slug` | text | unique, slug format; reserved words blocked (`admin`, `projects`, `resume`, `s`) |
| `intro` | text | ≤ 500 |
| `layout` | `section_layout` | default `grid` |
| `fields` | jsonb | array of field definitions (below), 1–15 fields |
| `insert_after` | `chapter_key` | default `reviews` — where it appears on the home page |
| `show_on_home` | boolean | default `true` |
| `has_page` | boolean | default `false` — also gets its own page at `/s/:slug` |
| `show_in_nav` | boolean | default `false` |
| + shared columns | | |

**Field definition** (each element of `fields`):
```json
{ "key": "venue", "label": "Venue", "type": "text", "required": true, "options": null, "help": "Where the talk happened" }
```
| Property | Rules |
|---|---|
| `key` | `^[a-z][a-z0-9_]{0,29}$`, unique within the section |
| `label` | 1–40 chars |
| `type` | `text`, `long_text`, `markdown`, `number`, `date`, `url`, `image`, `tags`, `boolean`, `select` |
| `required` | boolean |
| `options` | string array, required only for `select` |
| `help` | optional, ≤ 120 chars |

The first `text` field is used as the item's title in lists and the admin.

#### `custom_items`
| Column | Type | Rules |
|---|---|---|
| `section_id` | uuid | FK → `custom_sections(id)` **on delete cascade** |
| `data` | jsonb | must be a JSON object, ≤ 50 KB |
| + shared columns | | |

**Validation split:**
- Database: `data` is an object, size limit, section exists.
- App (Part 2): a Zod schema is built at runtime from the section's `fields`, so required fields, types and select options are enforced in the form.
- Renaming or removing a field never deletes stored data; values for unknown keys are simply ignored when rendering.

#### `messages`
| Column | Type | Rules |
|---|---|---|
| `name` | text | 1–80 |
| `email` | text | 3–254, email format |
| `kind` | `message_kind` | default `general` |
| `subject` | text | ≤ 150 |
| `body` | text | 10–5000 |
| `budget` | text | ≤ 60, nullable (freelance enquiries) |
| `status` | `message_status` | default `new` |
| `created_at` | timestamptz | |

No `sort_order` / `is_published`.

### 3.4 Indexes

- `(is_published, sort_order)` on every content table — the public site's main query.
- Unique on `projects.slug`, `custom_sections.slug`, `lower(skills.name)`.
- `custom_items (section_id, is_published, sort_order)`.
- `messages (status, created_at desc)`.

### 3.5 Functions and triggers

| Name | Purpose |
|---|---|
| `set_updated_at()` | Trigger on every table with `updated_at`. |
| `is_owner()` | `security definer`, returns `true` when `auth.uid()` is the row in `app_owner`. Used by every policy. `search_path` pinned. |
| `is_image_ref(jsonb)` / `is_image_ref_array(jsonb)` | Immutable check helpers used in table `check` constraints. |
| `reorder(p_table text, p_ids uuid[])` | Owner-only. Sets `sort_order` = position in array. `p_table` must be in a fixed whitelist (no dynamic SQL from user input beyond the whitelist). |

### 3.6 Row Level Security

RLS is **enabled** on every table (not *forced*: forcing would also apply RLS to the table owner `postgres`, which breaks the security-definer `is_owner()` check and setup step S6; API roles never own tables, so they are always subject to RLS). Policies:

| Table | Anonymous / non-owner | Owner |
|---|---|---|
| `app_owner` | none | none (read via `is_owner()` only; set once in SQL during setup) |
| `site_settings` | `select` | `select`, `update` |
| `hero_media`, `projects`, `achievements`, `experience`, `skills`, `testimonials`, `custom_sections` | `select` where `is_published` | all |
| `custom_items` | `select` where `is_published` **and** parent section is published | all |
| `messages` | `insert` only, with check `status = 'new'` | `select`, `update` (status column only), `delete` |

Notes:
- Anonymous inserts into `messages` cannot set `status` or `created_at` to anything other than defaults (column-level grants limit insertable columns to `name, email, kind, subject, body, budget`).
- `delete` is owner-only everywhere.
- `app_owner` has no grants at all: not even the owner can read it through the API (only `is_owner()` can).
- `site_settings` can only be updated through the API, never inserted or deleted; its single row is created by migration `0003`.
- Table-level `grant`s are kept minimal so a missing policy fails closed.

### 3.7 Storage buckets

| Bucket | Public read | Allowed types | Max size | Used for |
|---|---|---|---|---|
| `images` | yes | `image/webp`, `image/avif`, `image/jpeg`, `image/png`, `image/svg+xml` | 5 MB | portraits, covers, galleries, logos, posters |
| `videos` | yes | `video/mp4`, `video/webm` | 15 MB | hero clips (master spec HM-3) |
| `documents` | yes | `application/pdf` | 5 MB | resume |

- Write, update, delete on all buckets: owner only (storage policies use `is_owner()`).
- Folder convention: `<bucket>/<entity>/<uuid>.<ext>` (e.g. `images/projects/2b1f….webp`).
- SVG uploads are allowed only in `images` and are served with a restrictive content type (Part 2 sanitises them before upload).

### 3.8 Authentication

- Method: **email + password** for the owner (default), with optional **TOTP two-factor** (Q1).
- In the Supabase dashboard: **sign-ups disabled**, email confirmations on.
- The owner account is created once from the dashboard; its id is inserted into `app_owner` by a one-time SQL statement (setup step S6).
- The frontend checks `is_owner()` after login; a valid session that is not the owner is signed out and shown "Not authorised".
- Session: Supabase defaults (short-lived access token, refresh token rotation).

### 3.9 Data access in the app

| File | Contents |
|---|---|
| `src/lib/supabase.ts` | Single client created from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; throws a clear error if either is missing. |
| `src/data/database.types.ts` | Generated with `supabase gen types typescript` (first version generated from a local Postgres with all migrations applied). |
| `src/data/schemas/*.ts` | One Zod schema per entity (row + insert/update variants), plus `ImageRef` and `FieldDefinition`. |
| `src/data/schemas/customItem.ts` | `buildItemSchema(fields)` — creates a Zod schema from a section's field definitions. |
| `src/data/queries/*.ts` | TanStack Query hooks for public reads (`usePublishedProjects`, `useSiteSettings`, …). Admin hooks come in Part 2. |

Rule from master spec §13: UI never reads raw rows; every query result passes through its Zod schema.

### 3.10 Migrations and seed

```
supabase/
├─ migrations/
│  ├─ 0001_extensions_enums.sql
│  ├─ 0002_helpers.sql            # set_updated_at, is_owner, image checks
│  ├─ 0003_tables.sql
│  ├─ 0004_indexes.sql
│  ├─ 0005_rls.sql
│  ├─ 0006_storage.sql            # buckets + storage policies
│  └─ 0007_functions.sql          # reorder
├─ seed.sql                        # placeholder content (unpublished except settings)
└─ tests/
   └─ rls.test.sql                 # security tests (§5)
```

Migrations are idempotent where practical and can be applied either by **pasting into the Supabase SQL Editor** in order, or with the Supabase CLI (`supabase db push`).

The seed adds one example row per table (marked clearly as placeholder) so the front end has something to render during development.

### 3.11 Setup guide (done by Ausaf, ~15 minutes)

| Step | Action |
|---|---|
| S1 | Create a free project at supabase.com. Region: **South Asia (Mumbai)** — closest to Bhubaneswar and Indian visitors. Save the database password in a password manager. |
| S2 | Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". |
| S3 | Authentication → Users → **Add user** with your email and a strong password. |
| S4 | SQL Editor → run migrations `0001`–`0007` in order, then `seed.sql`. |
| S5 | Storage → confirm the three buckets exist. |
| S6 | SQL Editor → run `insert into app_owner (user_id) select id from auth.users where email = '<your email>';` |
| S7 | Project Settings → API → copy **Project URL** and **anon public key** into your local `.env` and into Netlify's environment variables. Share those two values with Claude if you want Claude to test against the live project; they are public by design. **Never share the service-role key or database password.** |

## 4. Tasks

- [x] 1.1 Write `0001_extensions_enums.sql` (§3.2)
- [x] 1.2 Write `0002_helpers.sql` — `set_updated_at`, `is_owner`, `is_image_ref`, `is_image_ref_array` (§3.5)
- [x] 1.3 Write `0003_tables.sql` — all tables with constraints and triggers (§3.3)
- [x] 1.4 Write `0004_indexes.sql` (§3.4)
- [x] 1.5 Write `0005_rls.sql` — enable/force RLS, grants, policies (§3.6)
- [x] 1.6 Write `0006_storage.sql` — buckets and storage policies (§3.7)
- [x] 1.7 Write `0007_functions.sql` — `reorder` (§3.5)
- [x] 1.8 Write `seed.sql`
- [x] 1.9 Write `tests/rls.test.sql` covering every acceptance criterion in §5
- [x] 1.10 Run all migrations + tests against a local Postgres with a stubbed `auth` schema in the build environment; fix until green
- [x] 1.11 Add `src/lib/supabase.ts`, generated types, Zod schemas, `buildItemSchema`, public query hooks (§3.9)
- [x] 1.12 Unit tests (Vitest) for Zod schemas and `buildItemSchema`
- [x] 1.13 Write `supabase/README.md` with the setup guide (§3.11)
- [x] 1.14 Ausaf runs setup S1–S7, then `npm run db:verify` (≈25 anonymous checks; with `OWNER_EMAIL`/`OWNER_PASSWORD` for one run, also owner access and live upload type/size limits) ✅ *setup done and verification passing, reported by Ausaf 2026-10-14*

## 5. Acceptance criteria

### Schema
- [x] AC-1.1 All migrations apply cleanly, in order, to an empty database. ✅ *applied twice in a row (re-runnable) plus seed twice, by `npm run db:test`*
- [x] AC-1.2 A second row in `site_settings` is rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.3 A second row in `app_owner` is rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.4 Duplicate or invalid slugs (`My Project`, `a--b`, `admin`) are rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.5 Text over its length limit is rejected by the database. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.6 An image reference without `alt` is rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.7 `experience.end_date` before `start_date` is rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.8 `custom_items.data` that is not a JSON object is rejected. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.9 Deleting a custom section deletes its items. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.10 Updating any row changes `updated_at`. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.11 `reorder` sets `sort_order` to match the given order and rejects a table name outside the whitelist. ✅ *`supabase/tests/rls.test.sql`*

### Security
- [x] AC-1.12 Anonymous: can read published rows; cannot read unpublished rows in any table. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.13 Anonymous: cannot read items of an unpublished custom section, even if the items are published. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.14 Anonymous: insert, update and delete fail on every content table. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.15 Anonymous: can insert a valid message; cannot set `status`; cannot select, update or delete messages. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.16 Signed-in non-owner: same results as AC-1.12–1.15. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.17 Owner: full CRUD on every content table; can read and update messages. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.18 Anonymous and non-owner: cannot upload to any bucket; owner can. ✅ *`supabase/tests/rls.test.sql`*
- [x] AC-1.19 Upload of a wrong file type or over the size limit is rejected. ✅ *bucket limits verified locally; live enforcement confirmed by `npm run db:verify` with owner credentials (Ausaf, 2026-10-14)*
- [x] AC-1.20 Calling `reorder` as anonymous or non-owner fails. ✅ *`supabase/tests/rls.test.sql`*

### App layer
- [x] AC-1.21 The app fails fast with a readable error if Supabase env vars are missing. ✅ *`readSupabaseEnv()` names each missing variable and how to fix it*
- [x] AC-1.22 Every entity has a Zod schema; invalid rows are caught and logged, not rendered. ✅ *`parseRows()` drops and logs invalid rows; custom item data also validated per section*
- [x] AC-1.23 `buildItemSchema` enforces required fields, types and select options for every field type. ✅ *all 10 field types, required/optional, select options, 50 KB limit, unknown keys kept*
- [x] AC-1.24 No service-role key, database password or personal email in the repo (grep check). ✅ *`tests/unit/guardrails.test.ts` scans every committed text file*

## 6. Risks

| Risk | Mitigation |
|---|---|
| Free Supabase projects pause after a period of inactivity | Keep-alive scheduled ping in Part 8; check current free-tier rules at setup time |
| Free-tier storage/bandwidth limits with video | Hero clips can use external URLs (master spec HM-6); upload limit 15 MB |
| Owner locks themself out | Password reset via email; app_owner can be re-set from the SQL Editor |
| Custom field renamed after items exist | Old values kept in JSON; admin shows a "fields no longer defined" notice (Part 2) |

## 7. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Two-factor login for the admin? | **Yes, required.** Enforcement is added in Part 2 together with the enrolment screen: `is_owner()` will also require a two-factor session (`aal2`). Until then the owner can sign in with password only. |
| Q2 | Project categories `work / freelance / personal` | As listed |
| Q3 | Public "Available for work" badge | Yes, toggle in admin (`site_settings.available_for_work`) |
| Q4 | Auto-delete archived messages | No, keep forever |

## 8. Verification summary (2026-10-14)

| Check | Result |
|---|---|
| `npm run db:test` — migrations ×2, seed ×2, schema + security checks as anon, stranger and owner | **212 / 212 passed** |
| Mutation check — security rules deliberately broken to confirm the tests notice | 3 of 4 caught; the 4th (dropping the "section is published" check on custom items) is still blocked by RLS on the section itself, so visitors still can't see those items |
| `npm test` — Zod schemas, `buildItemSchema`, env errors, media URLs, guardrails | **198 / 198 passed** |
| Types generated by the Supabase CLI from the migrated database; `tsc` strict | Clean |
| Live project (task 1.14) | Set up; `db:verify` passing (reported 2026-10-14) |

## Changelog
- 0.1 (2026-10-14) — Initial draft.
- 0.2 (2026-10-14) — Built and verified. Changes found during the build:
  - RLS enabled but not *forced* (§3.6, reason given there).
  - Owner may update only a message's `status`; nobody (including the owner) can read `app_owner` through the API; `site_settings` row is created by migration `0003`, not the seed.
  - Field definitions are also validated by the database (not only the app), and a custom section cannot be placed after `contact`.
  - `reorder()` rejects duplicate ids; sort order is 0-based.
  - ImageRef may carry an optional `blurhash` (for blurred placeholders); paths are checked for `..` and unknown keys are rejected.
  - Optional text columns are stored as `''` (not null) unless marked nullable.
  - Seed rows are all unpublished and marked "[Placeholder]".
  - Added `npm run db:verify` for the live checks (task 1.14) and `supabase/README.md` for setup.
  - Q1–Q4 decided (§7).
