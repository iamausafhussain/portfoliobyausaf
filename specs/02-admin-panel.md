# Part 2 — Admin Panel and Custom-Section Builder

**Status:** Approved · Built and verified in demo mode (2026-10-14) · live checklist pending
**Version:** 0.2 · 2026-10-14
**Depends on:** Part 0 (design system), Part 1 (data model, RLS, auth)
**Feeds:** Parts 4–7 (everything the public site shows is edited here)

---

## 1. Scope

### In scope
- Admin login, **required two-factor login** (decided in Part 1, Q1), password reset, sign-out.
- Admin shell: navigation, dashboard, both themes, works from 375 px (phone) to desktop.
- Managers to create, edit, publish/unpublish, reorder and delete:
  site settings, hero media, projects, achievements, experience, skills, testimonials.
- **Custom-section builder**: define a new section and its fields, then add items to it through a form generated from those fields.
- Uploads for images, video and PDF with client-side checks, automatic image resizing and WebP conversion, and alt text required.
- Media library: see every uploaded file, where it is used, and delete unused files.
- A dev-only **demo mode** with an in-memory backend, so the admin can be run and tested without a Supabase project.

### Out of scope (later parts)
- Contact message inbox → Part 7 (the dashboard only shows the count of new messages).
- How content looks on the public site → Parts 3–6. The admin links to the public pages once they exist.
- Theme toggle → Part 3. Until then the admin follows the operating-system theme.
- Analytics, multiple admins, version history (master spec non-goals).

## 2. Requirements

### 2.1 User stories

| ID | As the owner, I want… | So that… |
|---|---|---|
| US-2.1 | to sign in with email, password and a 6-digit code from my authenticator app | a stolen password alone can't change my site |
| US-2.2 | to set up the authenticator the first time I sign in, by scanning a QR code | setup needs no command line |
| US-2.3 | to reset my password by email | I can't lock myself out by forgetting it |
| US-2.4 | a dashboard showing drafts, published counts and new messages | I see what needs attention |
| US-2.5 | to add, edit, reorder, publish and delete every kind of content | I never touch code to update the site |
| US-2.6 | to upload images and have them resized and compressed automatically | the site stays fast without manual editing |
| US-2.7 | to be forced to write alt text for every image | the site stays accessible |
| US-2.8 | to create a new section (e.g. "Talks") with my own fields | the site grows with me |
| US-2.9 | to be warned before leaving a form with unsaved changes | I don't lose work |
| US-2.10 | to be told if the same item was changed in another tab | I don't overwrite my own edits |
| US-2.11 | to use the admin on my phone | I can add an achievement the day I get it |
| US-2.12 | to find and delete files nothing uses | storage stays within the free tier |

### 2.2 Functional requirements

#### Authentication

| ID | Requirement |
|---|---|
| AD-1 | `/admin/*` is reachable only with a session that is **two-factor verified** (`aal2`) **and** belongs to the owner. Anything else redirects to `/admin/login`, remembering the requested page. |
| AD-2 | Login flow: email + password → if no authenticator is set up, the **setup screen** (QR code + manual key + verify code) → otherwise the **code screen** (6-digit code). |
| AD-3 | The database enforces two-factor too: `is_owner()` returns true only for an `aal2` session (new migration `0008_require_mfa.sql`). A password-only session can read published content like any visitor and nothing more. |
| AD-4 | A signed-in user who is not the owner is signed out and shown "This account can't access the admin." |
| AD-5 | Up to **two** authenticators can be registered (main phone + backup), managed on an Account page. Removing the last one is not allowed. |
| AD-6 | "Forgot password" sends a Supabase reset email; the reset link opens `/admin/reset-password`, which sets a new password (min 12 characters). |
| AD-7 | Wrong password or code: a generic error message ("Email, password or code is incorrect"); no hint which part was wrong. |
| AD-8 | Sign-out ends the session in this browser; Account page also offers "Sign out of all devices". |
| AD-9 | Lost-authenticator recovery is documented (SQL Editor steps in `supabase/README.md`). |

#### Lists (every manager)

| ID | Requirement |
|---|---|
| AD-10 | Each manager lists all rows (drafts included) in display order, showing title, a thumbnail when there is an image, status (Published / Draft) and last updated time. |
| AD-11 | Reorder by drag and drop **and** by keyboard (focus a handle, Space, arrows, Space). Saved immediately with one `reorder()` call; on failure the list snaps back with an error. |
| AD-12 | Publish / unpublish from the list with one click (switch). |
| AD-13 | Search box filters the list by title text. Filter chips: All / Published / Drafts. |
| AD-14 | Delete asks for confirmation naming the item. Files used only by that item are deleted from storage too. |
| AD-15 | "Duplicate" creates a draft copy (slug gets `-copy`, `-copy-2`, …). |
| AD-16 | Empty state explains what the section is for and shows an "Add the first …" button. |

#### Forms (every manager)

| ID | Requirement |
|---|---|
| AD-20 | Forms validate with the same Zod schemas as the data layer (Part 1), on blur and on submit; errors appear next to the field and in a summary at the top, and focus moves to the first error. |
| AD-21 | Database errors are translated into plain messages (e.g. duplicate slug → "That web address is already used by another project"). |
| AD-22 | Save shows progress, then a "Saved" toast. The form stays open. "Save & publish" is offered for drafts. |
| AD-23 | Leaving a form with unsaved changes (link, back button, closing the tab) asks for confirmation. |
| AD-24 | **Edit conflict check**: saving only succeeds if the row's `updated_at` is unchanged since it was loaded; otherwise "This was changed somewhere else — reload to see the latest version" (with Reload and "Overwrite anyway"). |
| AD-25 | Slugs are generated from the title while the item is a new draft, and can be edited; once published, changing a slug shows a warning that old links will break. |
| AD-26 | Markdown fields have a small toolbar (bold, italic, link, list, heading) and a Preview tab. Preview never renders raw HTML. |
| AD-27 | Tag fields: type and press Enter or comma; suggestions from tags already used elsewhere (e.g. tech tags). |
| AD-28 | Character counters on limited text fields, matching the database limits. |

#### Media

| ID | Requirement |
|---|---|
| AD-30 | Image upload: drag and drop or file picker; JPEG, PNG, WebP, AVIF or SVG. Raster images are resized to fit **2560 px** on the long side and converted to **WebP (quality 0.85)** in the browser before upload; width and height are stored automatically. |
| AD-31 | Alt text is required before an image can be saved (it's part of the image field, not a separate step). |
| AD-32 | SVG files are sanitised (scripts, event handlers and external references removed) before upload. |
| AD-33 | Video upload: MP4 (required) and optional WebM / mobile versions. Over 4 MB shows a warning with the file size; over 15 MB is refused before uploading. Upload shows a progress bar and can be cancelled. |
| AD-34 | Hero clips need a poster: upload one, or **capture the current frame** of the uploaded video. |
| AD-35 | Hero clips can use an external `https://` URL instead of an upload (master spec HM-6). |
| AD-36 | Resume: PDF only, 5 MB max; replaces the previous file. |
| AD-37 | Files are stored as `<bucket>/<entity>/<uuid>.<ext>`. Replacing or removing a file in a form deletes the old file after the row is saved. |
| AD-38 | Media library page: every file in the three buckets with size, type, preview and "Used by …" (or "Unused"); unused files can be deleted individually or all at once; total storage used is shown. |

#### Managers

| ID | Manager | Notes |
|---|---|---|
| AD-40 | **Site settings** (single form) | Name, tagline, short and long bio, portrait, location, public email, resume, social links, "Available for work", hero playback mode (single / sequence / random), SEO title, description and share image. |
| AD-41 | **Hero media** | Title, source (upload / URL), MP4, WebM, mobile version, poster, theme (dark / light / both). Inline video preview. |
| AD-42 | **Projects** | All Part 1 fields; gallery with multiple images (reorderable); links (live, repo, case study, video); featured switch; globe position as latitude/longitude with an "Auto-place" option (left empty). |
| AD-43 | **Achievements** | Kind, title, issuer, date, description, image, verification link, highlighted switch. |
| AD-44 | **Experience** | Company, role, type, location, start / end date with "I currently work here", description, highlights (list), tech tags, logo. |
| AD-45 | **Skills** | Name, category (suggestions + free text), level 1–5 (shown as 5 dots), icon, featured. Grouped by category in the list. |
| AD-46 | **Testimonials** | Quote, author, role, company, avatar, rating (stars), source link, related project (dropdown of projects). |

#### Custom-section builder

| ID | Requirement |
|---|---|
| AD-50 | "New section": name, web address (slug, generated from the name), intro, layout (grid / list / timeline / carousel / gallery), where it appears (after which chapter), show on home page, own page at `/s/<slug>`, show in navigation. |
| AD-51 | Field editor: add, remove and reorder fields (drag or keyboard). Each field: label, key (generated from the label, editable until items exist), type, required, help text, options (select only, one per line). Limits as in Part 1 (1–15 fields, unique keys). |
| AD-52 | A **live form preview** next to the field editor shows exactly what the item form will look like. |
| AD-53 | Starter templates when creating a section: *Talks*, *Certifications*, *Publications*, *Gear*, *Blank*. Each pre-fills sensible fields that can be changed. |
| AD-54 | Changing fields after items exist: renaming a key or removing a field never deletes item data. Before saving, the builder lists what changes ("3 items have values for *venue*, which will be hidden"). |
| AD-55 | Section items manager: a list like every other manager, with a form generated by `buildItemSchema(section.fields)`. Items holding values for fields that no longer exist show a "Hidden data" panel with the old values and a "Remove hidden data" button. |
| AD-56 | Deleting a section deletes its items (Part 1 cascade) after a confirmation that says how many items will be deleted. |
| AD-57 | Sections appear in the admin navigation under "Your sections", in their display order. |

#### Dashboard

| ID | Requirement |
|---|---|
| AD-60 | Cards per content type: published / draft counts, link to the manager. |
| AD-61 | "Needs attention": drafts, items without images where an image is expected (projects without a cover), and hero media with no published clip. |
| AD-62 | New-message count (links to Part 7's inbox once it exists). |
| AD-63 | Storage used across buckets (from the media library data). |

## 3. Design

### 3.1 Routes

| Route | Screen |
|---|---|
| `/admin/login` | Email + password |
| `/admin/login/verify` | 6-digit code |
| `/admin/login/setup-2fa` | First-time authenticator setup |
| `/admin/forgot-password`, `/admin/reset-password` | Password reset |
| `/admin` | Dashboard |
| `/admin/settings` | Site settings |
| `/admin/hero`, `/admin/projects`, `/admin/achievements`, `/admin/experience`, `/admin/skills`, `/admin/testimonials` | Managers (list) |
| `/admin/<manager>/new`, `/admin/<manager>/:id` | Create / edit form |
| `/admin/sections` | All custom sections |
| `/admin/sections/new`, `/admin/sections/:id` | Section builder |
| `/admin/sections/:id/items`, `…/items/new`, `…/items/:itemId` | Section items |
| `/admin/media` | Media library |
| `/admin/account` | Password, authenticators, sign-out everywhere |

All admin routes are one lazy-loaded chunk, never part of the public site's initial download (master spec P-2).

### 3.2 Layout

```
Desktop (≥ 1024 px)                              Phone (< 1024 px)
┌────────────┬──────────────────────────────┐    ┌───────────────────────────┐
│ Ausaf      │  Projects            [+ New] │    │ ☰  Projects        [+ New]│
│ Hussain    │  ┌ search ┐ All·Live·Drafts  │    │ ┌ search ───────────────┐ │
│ ─────────  │  ⋮⋮ ▢ EDI pipeline  ● Live   │    │ ⋮⋮ ▢ EDI pipeline  ● Live │
│ Dashboard  │  ⋮⋮ ▢ Drone reel    ○ Draft  │    │ ⋮⋮ ▢ Drone reel   ○ Draft │
│ Settings   │  ⋮⋮ ▢ …                      │    │                           │
│ Hero       │                              │    └───────────────────────────┘
│ Projects ● │                              │     Navigation opens as a sheet
│ …          │                              │
│ YOUR       │                              │
│ SECTIONS   │                              │
│ Talks      │                              │
│ + New      │                              │
│ ─────────  │                              │
│ Media      │                              │
│ Account    │                              │
└────────────┴──────────────────────────────┘
```

- Visual language: same tokens as the public site. Garamond italic for page titles, Inter for everything else, data labels in the uppercase label style. Calm and functional; no film grain or heavy motion in the admin.
- Forms: one column on phones, two on wide screens where it helps (e.g. image beside its fields). Sticky save bar at the bottom of long forms.
- Feedback: toasts (bottom right / bottom on phones), inline field errors, skeletons while loading.

### 3.3 Architecture: a repository between the UI and Supabase

```
Admin UI (React, React Hook Form)
      │  uses
      ▼
AdminRepository  ← one interface: auth, rows, reorder, files
      │
      ├── SupabaseRepository  (production; RLS does the security)
      └── DemoRepository      (dev only; in-memory, seeded, VITE_DEMO=1)
```

- **`AdminRepository`** (`src/admin/repository/types.ts`): `auth` (signIn, verifyCode, enrollTotp, listFactors, removeFactor, signOut, resetPassword, …), `list(table)`, `get(table, id)`, `create`, `update(table, id, patch, expectedUpdatedAt)`, `remove`, `reorder`, `uploadFile`, `removeFiles`, `listFiles`.
- **`SupabaseRepository`** maps calls to `supabase-js`, adds the `updated_at` conflict check (`.eq('updated_at', expected)`; 0 rows ⇒ conflict), and translates errors (§3.6).
- **`DemoRepository`** applies the same Zod schemas and the same rules as the database (unique slugs, 50 KB item limit, etc.), stores files as object URLs, and uses demo login `demo@example.com` / any code `000000`. It is only included when `VITE_DEMO=1` and is excluded from production builds (test-enforced).
- TanStack Query hooks (`src/admin/data/`) wrap the repository; every mutation invalidates the matching admin and public queries.

Why: the admin can be developed, screenshot-tested and demonstrated without a live project, and tests run fast without a network.

### 3.4 Forms

- **React Hook Form** + `@hookform/resolvers/zod` using the Part 1 Insert / Update schemas.
- Field components in `src/admin/fields/`: `TextField`, `TextAreaField`, `MarkdownField`, `NumberField`, `DateField`, `UrlField`, `SelectField`, `SwitchField`, `TagsField`, `ImageField`, `ImageListField`, `VideoField`, `FileField`, `LinksField`, `RatingField`, `LevelField`, `SlugField`.
- The custom-section item form maps each field type to one of these components, so custom sections get the same quality as built-in ones.
- Markdown preview uses `react-markdown` with raw HTML disabled (the same renderer the public site will use).

### 3.5 Media pipeline

1. Check type and size against the bucket limits (Part 1 §3.7) before anything is uploaded.
2. Raster images: decode → resize to ≤ 2560 px long side → encode WebP at 0.85 → record width/height. If the browser can't encode WebP, upload the original (if within limits).
3. SVG: sanitise with DOMPurify (SVG profile).
4. Upload to `<bucket>/<entity>/<uuid>.<ext>` with upload progress; cancellable.
5. On save: the row stores the new path; afterwards, replaced or removed files are deleted. If that deletion fails, the file appears as "Unused" in the media library.
6. "Used by" in the media library is worked out by scanning every row's image, video and file fields (including custom items' image fields).

### 3.6 Error messages

| Database / network error | Shown as |
|---|---|
| `23505` unique (slug) | "That web address is already used by another {item}." |
| `23505` unique (skill name) | "You already have a skill called {name}." |
| `23514` check | "{Field} isn't valid." (field from the constraint name when possible) |
| `42501` / `PGRST301` permission | "Your session has expired — sign in again." → redirect to login |
| Conflict (0 rows on `updated_at` check) | AD-24 dialog |
| Storage: too large / wrong type | "This file is {size} — the limit is {limit}." / "Only {types} files can be uploaded here." |
| Network failure | "Couldn't reach the server. Check your connection and try again." (with Retry) |

### 3.7 Database change: `0008_require_mfa.sql`

```sql
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.app_owner where user_id = (select auth.uid()));
$$;
```

- Local test stand-in gains `auth.jwt()`; security tests add: owner with `aal1` = no owner rights; owner with `aal2` = full rights.
- `npm run db:verify` asks for the current 6-digit code when owner credentials are given, so the live owner checks keep working.
- **Order matters on the live project**: set up the authenticator in the admin first (sign in once, scan the QR code), *then* run `0008`. The setup screen works before `0008` because enrolment uses Supabase Auth, not `is_owner()`. The admin shows a reminder banner until `0008` is detected.

### 3.8 New dependencies

| Package | Why |
|---|---|
| `react-hook-form`, `@hookform/resolvers` | Forms with Zod validation |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Accessible drag and drop with keyboard support |
| `react-markdown` | Safe Markdown preview (no raw HTML) |
| `dompurify` | SVG sanitising |
| `@testing-library/react`, `@testing-library/user-event`, `jsdom` (dev) | Component tests |

All admin-only packages load only inside the admin chunk.

### 3.9 Accessibility

- Every input has a visible label; required fields marked in text, not only colour.
- Errors are linked to their fields (`aria-describedby`) and announced; the error summary receives focus on failed submit.
- Drag and drop has a keyboard alternative with screen-reader announcements.
- Toasts use a polite live region; destructive confirmations are real dialogs with focus trapped and returned.
- Contrast from Part 0 tokens; focus rings always visible.

## 4. Tasks

### Phase A — Sign-in and shell
- [x] 2.1 Install dependencies; admin route tree, lazy chunk, `RequireOwner` guard
- [x] 2.2 `AdminRepository` interface; `SupabaseRepository` (auth, rows, reorder, files, errors, conflict check)
- [x] 2.3 `DemoRepository` with seed data and the same validation rules; `VITE_DEMO` switch; production exclusion test
- [x] 2.4 Login, code, authenticator setup, forgot / reset password screens
- [x] 2.5 `0008_require_mfa.sql`, `auth.jwt()` in the test stand-in, new security tests, `db:verify` code prompt, README recovery steps
- [x] 2.6 Admin shell: sidebar / phone sheet, toasts, confirm dialog, unsaved-changes guard, error summary
- [x] 2.7 Account page: change password, authenticators (add second / remove), sign out everywhere

### Phase B — Managers
- [x] 2.8 Field components (§3.4) with tests
- [x] 2.9 Media pipeline: resize/WebP, SVG sanitise, video checks, frame capture, upload progress/cancel, old-file cleanup
- [x] 2.10 Generic list (search, filters, publish switch, reorder, duplicate, delete) and generic form page
- [x] 2.11 Site settings, hero media, projects, achievements, experience, skills, testimonials
- [x] 2.12 Dashboard

### Phase C — Custom sections and media
- [x] 2.13 Section builder: details, field editor, live preview, templates, change warnings
- [x] 2.14 Section items manager with generated forms and "Hidden data" panel
- [x] 2.15 Media library with "Used by" and unused-file cleanup

### Phase D — Verify
- [x] 2.16 Component and flow tests in demo mode (see §5)
- [x] 2.17 Screenshots of every screen at 375 px and 1440 px in both themes; fix issues
- [ ] 2.18 Ausaf: set up authenticator on the live site, run `0008`, run `db:verify`, walk through the live checklist (§5.4)

## 5. Acceptance criteria

### 5.1 Sign-in and security
- [x] AC-2.1 Visiting any `/admin` page while signed out redirects to the login page and returns to that page after signing in. ✅ *`tests/e2e/auth.spec.ts`*
- [x] AC-2.2 First sign-in shows the authenticator setup; after a valid code the dashboard opens. ✅ *e2e*
- [x] AC-2.3 Later sign-ins require the 6-digit code; a wrong code shows the generic error and does not sign in. ✅ *e2e (wrong code refused, right code accepted)*
- [x] AC-2.4 After `0008`, a password-only (`aal1`) owner session cannot write anything (database test). ✅ *11 new checks in `supabase/tests/rls.test.sql` (223 total)*
- [x] AC-2.5 A non-owner account is signed out with the "can't access the admin" message. ✅ *e2e + database check that `is_owner_account()` is false for other accounts*
- [x] AC-2.6 Password reset email → new password works; passwords under 12 characters are refused. ✅ *e2e (12-character rule, mismatch, change succeeds; reset request never reveals if the email exists). Live reset email is on the live checklist*
- [x] AC-2.7 The last authenticator can't be removed; a second one can be added and removed. ✅ *e2e*
- [x] AC-2.8 The public site's initial download contains no admin code (build-output check), and no demo code exists in a production build. ✅ *`tests/unit/adminBundle.test.ts` builds for production and inspects every chunk; verified it fails when a demo string is added*

### 5.2 Managing content
- [x] AC-2.9 Each of the 7 built-in managers can create, edit, publish, unpublish, reorder (mouse and keyboard), duplicate and delete. ✅ *e2e: create/publish/duplicate/delete for 5 managers, hero and settings saves, keyboard reorder*
- [x] AC-2.10 Invalid input shows field errors and a summary, focuses the first error, and nothing is saved. ✅ *e2e*
- [x] AC-2.11 Duplicate slug and other database errors show the plain messages from §3.6. ✅ *e2e + unit (error mapping)*
- [x] AC-2.12 Leaving a changed form asks for confirmation; leaving an unchanged form does not. ✅ *e2e*
- [x] AC-2.13 Saving after the same row was changed elsewhere shows the conflict dialog, and "Reload" shows the newer data. ✅ *e2e*
- [x] AC-2.14 A 6000 × 4000 JPEG is uploaded as a WebP no larger than 2560 px on its long side, with width and height stored. ✅ *e2e: 6000×4000 JPEG stored as 2560×1707 WebP*
- [x] AC-2.15 An image can't be saved without alt text. ✅ *e2e*
- [x] AC-2.16 An SVG containing a `<script>` or `onload` is uploaded without them. ✅ *unit (jsdom) + e2e*
- [x] AC-2.17 A 16 MB video is refused before upload; a 5 MB one uploads with a size warning. ✅ *e2e*
- [x] AC-2.18 A poster can be captured from the uploaded video. ✅ *e2e with a real recorded video clip*
- [x] AC-2.19 Replacing or deleting an image removes the old file from storage. ✅ *e2e (also: files shared with a duplicate are kept; uploads in an abandoned form are removed)*

### 5.3 Custom sections and media
- [x] AC-2.20 A section created from the *Talks* template, with one field added and one reordered, saves; the live preview matches the item form. ✅ *e2e*
- [x] AC-2.21 Items for that section are validated by its fields (required, type, select options). ✅ *e2e*
- [x] AC-2.22 Removing a field (or changing its type) after items exist keeps the old values, shows the warning before saving, and shows them in "Hidden data"; "Remove hidden data" clears them. (Keys of fields that already have items are locked, per AD-51, so they can't be renamed; labels can.) ✅ *e2e*
- [x] AC-2.23 Deleting a section states how many items will be deleted and deletes them. ✅ *e2e*
- [x] AC-2.24 The media library shows "Used by" correctly for project covers, galleries, hero posters, the resume and custom-item images; deleting unused files works. ✅ *e2e (covers, galleries, hero posters, resume, custom-item images; bulk delete of unused)*
- [x] AC-2.25 The dashboard counts match the data. ✅ *e2e*

### 5.4 Quality
- [x] AC-2.26 Every admin screen works at 375 px and 1440 px, in both themes, with no horizontal scrolling and no console errors. ✅ *`tests/e2e/screens.spec.ts`: 16 screens × 375/1440 px × dark/light, plus manual review of the screenshots*
- [x] AC-2.27 Every action in AC-2.9 can be done with the keyboard alone; focus is always visible. ✅ *keyboard reorder tested e2e; focus rings come from Part 0 tokens; dialogs use native `<dialog>` focus handling*
- [x] AC-2.28 `npm run build`, `lint`, `test` and `db:test` pass. ✅ *build, lint (0 warnings), 412 unit tests, 36 e2e tests, 223 database checks*
- [ ] AC-2.29 **Live checklist (Ausaf):** sign in with the authenticator; add a project with a cover; publish it; reorder; create a "Talks" section with one item; upload a hero clip with a captured poster; replace your resume; run `db:verify` with the code prompt.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Losing the phone with the authenticator | Register a second authenticator (AD-5); SQL recovery steps in the README (AD-9) |
| Running `0008` before setting up the authenticator locks writes | Order explained in §3.7, a banner in the admin, and the README; reverting is one SQL statement |
| Large videos exhaust free-tier bandwidth | 4 MB warning, 15 MB limit, external URL option |
| Browser can't encode WebP (very old Safari) | Falls back to the original file within limits |
| Demo code leaking into production | Separate module behind `VITE_DEMO`, plus a build-output test |

## 7. Decisions

All five defaults approved by Ausaf on 2026-10-14.

| # | Question | Decision |
|---|---|---|
| Q1 | Keep the admin at `/admin`? (It's protected by login and two-factor either way.) | Yes, `/admin` |
| Q2 | Resize images to 2560 px and convert to WebP automatically? | Yes |
| Q3 | Markdown editor: simple (toolbar + preview, light) or a rich "Word-like" editor (heavier)? | Simple |
| Q4 | Allow a backup authenticator (second phone or a password manager such as 1Password/Bitwarden)? | Yes, up to two |
| Q5 | Automatically sign out of the admin after a period of inactivity? | No — Supabase session rules apply; sign out manually |

## 8. Verification summary (2026-10-14)

| Check | Result |
|---|---|
| `npm run test:e2e` — Playwright against demo mode | **36 / 36 passed** |
| `npm test` — unit tests incl. production-bundle check | **412 / 412 passed** |
| `npm run db:test` — migrations ×2, seed ×2, security checks incl. two-factor | **223 / 223 passed** |
| `npm run lint`, `npm run build` | Clean |
| Live project (task 2.18 / AC-2.29) | Pending — needs Ausaf's sign-in and authenticator |

Not testable from the build environment (no access to the live project): the real Supabase upload endpoint, password-reset emails and authenticator enrolment against Supabase Auth. These are covered by the live checklist (AC-2.29).

## Changelog
- 0.1 (2026-10-14) — Initial draft.
- 0.2 (2026-10-14) — Built and verified. Changes found during the build:
  - **AC-2.22 reworded**: field keys are locked once items use them (AD-51), so the check covers removing a field or changing its type instead of renaming a key.
  - **Save waits for uploads**: Save is disabled ("Waiting for upload…") while an image or file is still processing or uploading, so a save can't miss it.
  - **Publish switches are instant**: the switch flips immediately and reverts if the server refuses.
  - **Abandoned uploads are cleaned up**: files uploaded into a form that is then left without saving are deleted (if nothing else uses them).
  - **Files shared by duplicates are kept**: deleting an item only removes files no other item uses.
  - **Duplicates are labelled** "(copy)" for every content type, so copies are distinguishable in lists.
  - **Unsaved-changes check** compares values canonically (the form library flagged untouched optional fields as changed).
  - **Error summary takes focus** on a failed save (not the first field), as §3.9 says.
  - Added `is_owner_account()` in `0008` so the login screen can turn away other accounts before the code is entered, and so the admin can tell whether `0008` has been applied (banner).
  - Setup guide gained steps A1–A3 (reset-link redirect URLs, authenticator setup, then `0008`) and lost-authenticator recovery, including the honest caveat that the password alone can set up a new authenticator until you do.
