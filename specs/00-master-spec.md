# Part 0 — Master Spec

**Project:** Ausaf Hussain — Animated Portfolio ("Director's Cut × Data in Transit")
**Status:** Approved · Part 0 built and verified (2026-10-14)
**Version:** 0.4 · 2026-10-14
**Owner:** Ausaf · **Builder:** Claude

---

## 1. Vision

A portfolio that plays like a short film about its owner, with a live 3D data system at its centre. The cinematic shell (letterbox, film grain, title cards, real drone/camera footage) shows the creative side; the 3D globe of glowing data packets shows the engineering side (pipelines, messaging, data flow).

It must impress in the first 5 seconds **and** let a busy recruiter reach the resume in one click.

## 2. Goals and non-goals

### Goals
- G1. Stand out among developer portfolios through a distinctive, cohesive cinematic + 3D experience.
- G2. Serve three audiences: product-company recruiters, freelance clients, and general/YouTube visitors.
- G3. All content is editable from an admin panel, including new custom sections, with no code changes.
- G4. Light and dark themes, each designed deliberately, not inverted.
- G5. Fast and usable on mid-range phones and slow networks.
- G6. Built spec-first, part by part, each part verified against its acceptance criteria.

### Non-goals (v1)
- Blog / CMS for long-form articles.
- Multi-user admin roles (single owner only).
- Internationalisation (English only).
- E-commerce or payments.
- Analytics dashboard inside admin (can use Netlify/Plausible externally).

## 3. Audiences and what each must achieve

| Audience | Must be able to | Within |
|---|---|---|
| Recruiter (product company) | Open resume, see projects + tech stack, see experience | 1 click / 10 s |
| Freelance client | See work quality, testimonials, send an enquiry | 2 clicks |
| General visitor | Enjoy the full cinematic experience, browse footage | Full scroll |

## 4. Sitemap and routes

| Route | Purpose | Access |
|---|---|---|
| `/` | Single-page cinematic portfolio (all chapters) | Public |
| `/projects/:slug` | Project detail page (deep-linkable, shareable) | Public |
| `/s/:sectionSlug` | Optional full page for a custom section | Public |
| `/resume` | Redirect/download of current resume PDF | Public |
| `/admin/login` | Admin sign-in | Public |
| `/admin/*` | Admin panel | Authenticated owner only |
| `*` | 404 styled as "Scene not found" | Public |

## 5. Page narrative (home `/`)

Order is fixed for built-in chapters; custom sections are inserted by `sort_order` (Part 1/2).

| # | Chapter | Content source | Spec part |
|---|---|---|---|
| 0 | Opening Scene (hero) | Settings (name, tagline) + `hero_media` | 4 |
| 1 | About | Settings (bio, portrait) | 6 |
| 2 | The System (projects on 3D globe) | `projects` | 5 |
| 3 | Credits Roll (achievements & titles) | `achievements` | 6 |
| 4 | Timeline (experience & skills) | `experience`, `skills` | 6 |
| 5 | Reviews (testimonials) | `testimonials` | 6 |
| 5+ | Custom sections | `custom_sections` / `custom_items` | 2, 6 |
| 6 | Final Scene (contact) | `messages` (write) | 7 |

**Persistent UI (all chapters):** top bar with logo, chapter progress indicator, theme toggle, and the **Fast Lane** (Resume · Projects · Contact).

## 6. Design system

All values below are **design tokens**. They live in one source (`src/theme/tokens.ts`) and are emitted as CSS custom properties **and** passed as uniforms to 3D shaders, so both stay in sync.

### 6.1 Colour tokens

| Token | Dark — "Night Screening" | Light — "Daylight Edit" | Use |
|---|---|---|---|
| `bg` | `#0B0B0D` | `#F6F2EA` | Page background |
| `bg-elevated` | `#141418` | `#FFFFFF` | Cards, panels |
| `fg` | `#EDE8DF` | `#16140F` | Primary text |
| `fg-muted` | `#9A958C` | `#5E5A52` | Secondary text |
| `accent` | `#F57327` (tungsten orange) | `#C14E0B` (burnt orange) | Highlights, buttons, packets, focus rings |
| `accent-text` | `#F57327` | `#9C3F09` | Accent-coloured body text / links (AA on `bg`) |
| `accent-2` | `#49ABE8` (signal blue) | `#1981C8` | Secondary data trails, info states |
| `accent-2-text` | `#49ABE8` | `#13649B` | Secondary accent as text |
| `on-accent` | `#0B0B0D` | `#FFFFFF` | Text/icons on an `accent` background (buttons) |
| `border` | `#26262C` | `#E2DCCF` | Dividers |
| `danger` | `#E5534B` | `#B42318` | Errors |
| `success` | `#3FB27F` | `#1B7849` | Success states |
| `grain-opacity` | `0.08` | `0.04` | Film grain overlay |
| `globe-base` | `#121216` matte | `#EFEAE0` porcelain | Globe material |
| `globe-glow` | on (bloom) | off (soft shadow instead) | Packet rendering |

Accent hues are taken from the Awwwards "Animation" colour palette (`#F57327`, `#C14E0B`, `#49ABE8`, `#1981C8`); the `-text` variants are darkened only where needed to pass contrast in light mode.

All text/background pairs must meet **WCAG AA** (4.5:1 body, 3:1 large text and UI components) in both themes. `accent` / `accent-2` in light mode are for UI and large text only; small text uses the `-text` variants.

Measured contrast on `bg`: dark — `fg` 16.1, `fg-muted` 6.6, `accent` 6.9, `accent-2` 7.8 · light — `fg` 16.5, `fg-muted` 6.2, `accent-text` 6.0, `accent-2-text` 5.7, `success` 4.9, `accent` 4.3 and `accent-2` 3.8 (UI/large text only); `on-accent` on `accent` 6.9 (dark) / 4.8 (light). All pass AA for their intended use, enforced by `tests/unit/tokens.test.ts`.

CSS variable names are the token names in kebab-case with a `--color-` prefix, e.g. `--color-bg-elevated`, `--color-accent-2-text`.

### 6.2 Typography

| Role | Font | Notes |
|---|---|---|
| Italic display (title cards, chapter names, pull quotes, emphasis) | **Garamond Italic** — see note | Cinematic serif italic |
| Body / UI (Regular 400, Medium 500, Bold 700) | **Inter** | Variable font |

Two fonts only. Data labels, tech tags and timecodes use Inter Medium with uppercase, wider letter-spacing and tabular numbers (`font-variant-numeric: tabular-nums`) instead of a monospace font.

**Garamond note:** Apple Garamond is Apple's proprietary corporate typeface and is not licensed for embedding on websites. The spec uses **EB Garamond Italic** (open-source, SIL OFL) as the implementation, which is the closest freely licensed match. The font family is a single token (`font-italic`), so if you obtain a web licence for Apple Garamond or another Garamond, swapping it is a one-line change.

Fluid type scale using `clamp()`, growing linearly between a 375 px and a 1440 px wide viewport (size at 375 → size at 1440): `xs 12 · sm 14 · base 16 · lg 18→20 · xl 22→28 · 2xl 28→40 · 3xl 36→64 · hero 56→160 px`. (The hero minimum is 56 px so "Ausaf Hussain" fits on one line on a phone.)
Fonts are self-hosted (woff2, subset, `font-display: swap`).

#### 6.2.1 Swappable fonts

Fonts are defined in **one config file**, `src/theme/fonts.ts`, so changing a font never means hunting through components.

```ts
// src/theme/fonts.ts — the only place font choices live
export const fonts = {
  italic: {
    family: 'EB Garamond',
    fallback: "Georgia, 'Times New Roman', serif",
    files: [{ src: '/fonts/eb-garamond-italic.woff2', weight: '400 700', style: 'italic' }],
  },
  body: {
    family: 'Inter',
    fallback: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    files: [{ src: '/fonts/inter-variable.woff2', weight: '400 700', style: 'normal' }],
  },
} as const;
```

| ID | Requirement |
|---|---|
| FT-1 | `@font-face` rules, CSS variables (`--font-italic`, `--font-body`) and font preloads are all generated from `fonts.ts`. |
| FT-2 | Components only reference the two roles (`italic`, `body`) via tokens, never a font name. |
| FT-3 | Swapping a font = drop the new `.woff2` into `public/fonts/` and edit `family` + `files` in `fonts.ts`. No other file changes. |
| FT-4 | 3D text (if any, e.g. title cards rendered in WebGL) reads its font file from the same config. |
| FT-5 | Fallback stacks are tuned (`size-adjust`, `ascent-override`) so a font swap or slow load causes no visible layout shift (CLS ≤ 0.1). |
| FT-6 | README has a short "Change a font" section with the exact steps. |

### 6.3 Space, shape, layers

- Spacing scale (px): `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`.
- Radii: `sm 4 · md 8 · lg 16 · pill 999`.
- Layers (z-index): `canvas 0 · content 10 · grain 20 · letterbox 30 · nav 40 · modal 50 · toast 60`.
- Max content width: `1280px`; side gutter `16px` (mobile) → `48px` (desktop).

### 6.4 Motion tokens

| Token | Value | Use |
|---|---|---|
| `dur-fast` | 150 ms | Hovers, toggles |
| `dur-base` | 300 ms | UI transitions |
| `dur-slow` | 600 ms | Theme switch, section reveals |
| `dur-scene` | 1200 ms | Camera moves, title cards |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default reveal |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Camera travel |
| `ease-cinema` | `cubic-bezier(0.7, 0, 0.2, 1)` | Letterbox, title cards |

When `prefers-reduced-motion: reduce` is set: no camera flights, no parallax, no particle morphs; fades ≤ 200 ms only.

## 7. Theme system

| ID | Requirement |
|---|---|
| TH-1 | On first visit, theme follows the OS setting (`prefers-color-scheme`). |
| TH-2 | The toggle switches between light and dark; the choice persists across reloads (localStorage, wrapped in try/catch). |
| TH-3 | No flash of the wrong theme on load (theme resolved by an inline script before first paint). |
| TH-4 | Switching animates CSS colours and 3D scene (lighting, materials, bloom) together within `dur-slow` (600 ms). |
| TH-5 | Admin panel supports both themes with the same tokens. |
| TH-6 | Every component uses tokens only — no hard-coded colours (enforced by lint rule / review). |

## 8. Tech stack

Versions: latest stable at build time, pinned in `package.json`.

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite |
| UI | React 19 |
| Routing | React Router |
| 3D | Three.js, React Three Fiber, @react-three/drei, @react-three/postprocessing |
| Shaders | GLSL (via `vite-plugin-glsl`) |
| Motion | GSAP + ScrollTrigger, Lenis smooth scroll |
| Styling | CSS Modules + CSS custom properties (tokens) |
| Data fetching | TanStack Query |
| Forms / validation | React Hook Form + Zod |
| Backend | Supabase (Postgres, Auth, Storage, Row Level Security) |
| 3D assets | Blender Python scripts → glTF (Draco/Meshopt compressed) |
| Hosting | Netlify (deploy from GitHub) |
| Quality | ESLint, Prettier, Vitest, Playwright (smoke tests) |

## 9. Architecture

```
            ┌────────────── Netlify (static hosting, SPA redirects) ──────────────┐
Browser ──► │  React app                                                           │
            │   ├─ Public site  ── TanStack Query ──► Supabase (anon key, RLS:     │
            │   │   ├─ DOM layer (chapters, nav, forms)       read published only, │
            │   │   └─ <Canvas> (R3F scene, lazy-loaded)      insert messages)     │
            │   └─ Admin (/admin, lazy-loaded) ── Supabase Auth ──► full CRUD      │
            │                                      (owner only, via RLS)           │
            └──────────────────────────────────────────────────────────────────────┘
Supabase Storage: images, resume PDF, footage posters (footage itself may be hosted on Storage or a CDN — decided in Part 4)
```

Key decisions:
- **One persistent `<Canvas>`** behind the DOM for the whole home page; chapters drive the camera via ScrollTrigger rather than mounting separate canvases.
- **Admin and 3D code are separate lazy chunks**; recruiters on slow networks get content before 3D loads.
- **Security lives in the database** (RLS), not the frontend. Only the anon key ships to the browser; the service-role key is never used client-side.
- **Device tiers:** `high` (full effects), `mid` (reduced particles, no bloom), `low` (static 2D fallback, no WebGL). Tier is detected from GPU info, `deviceMemory`, and a short frame-time probe.

## 10. Folder structure

```
portfolio/
├─ specs/                      # This spec and parts 1–8
├─ blender/                    # bpy scripts that generate 3D assets
├─ public/
│  ├─ models/                  # Exported .glb files
│  └─ fonts/
├─ supabase/
│  ├─ migrations/              # SQL schema + RLS policies
│  └─ seed.sql
├─ src/
│  ├─ app/                     # Router, providers, layout
│  ├─ theme/                   # tokens.ts, fonts.ts, ThemeProvider, toggle
│  ├─ lib/                     # supabase client, device tier, utils
│  ├─ data/                    # Query hooks + Zod schemas per entity
│  ├─ scene/                   # R3F: Canvas, camera rig, globe, particles
│  │  └─ shaders/
│  ├─ chapters/                # Hero, About, System, Credits, Timeline, Reviews, Custom, Contact
│  ├─ components/              # Shared UI (Button, Card, FastLane, Grain, Letterbox…)
│  ├─ admin/                   # Admin pages, forms, section builder
│  └─ styles/                  # Global CSS, resets
├─ tests/                      # Vitest unit + Playwright smoke
├─ netlify.toml
└─ .env.example                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

## 11. Content model (overview)

Full schema, constraints and RLS are defined in **Part 1**. Entities:

| Entity | Purpose |
|---|---|
| `site_settings` | Single row: display name ("Ausaf Hussain"), tagline, bio, portrait, resume URL, social links, hero playback mode |
| `hero_media` | Hero footage managed from admin (see §11.1) |
| `projects` | Title, slug, summary, body, images, tech tags, links, featured flag, globe position |
| `achievements` | Titles, awards, certifications (title, issuer, date, image, link) |
| `experience` | Role, company, start/end, highlights |
| `skills` | Name, category, level |
| `testimonials` | Quote, author, role, company, avatar |
| `custom_sections` | Admin-defined sections: name, slug, layout, field definitions (JSON) |
| `custom_items` | Items for a custom section, values stored as JSON validated against its field definitions |
| `messages` | Contact form submissions (public insert, owner read) |

Every content table has: `id`, `sort_order`, `is_published`, `created_at`, `updated_at`.

### 11.1 Flexible hero footage

| ID | Requirement |
|---|---|
| HM-1 | The owner can add, replace, reorder, publish/unpublish and delete hero clips from the admin, with no code change or redeploy. |
| HM-2 | Each clip has: source (uploaded file **or** external URL), poster image (required), optional mobile version, title/alt text, optional per-theme assignment (dark / light / both). |
| HM-3 | Supported formats: MP4 (H.264) required; WebM optional. Upload limit 15 MB per clip; admin warns above 4 MB. |
| HM-4 | Playback modes (set in `site_settings`): **single** (first published clip), **sequence** (cycle through clips with film-cut transitions), **random** (one per visit). |
| HM-5 | If no clip is published, or the device is low-tier, or reduced motion is on, the hero shows the poster image (or a generated gradient) instead. |
| HM-6 | External URLs allow hosting large footage elsewhere (e.g. a video CDN) to stay within Supabase free-tier bandwidth. |

## 12. Global non-functional requirements

### Performance (measured on Lighthouse mobile, mid-tier device, Fast 4G)
| ID | Budget |
|---|---|
| P-1 | LCP ≤ 2.5 s; content readable before 3D finishes loading |
| P-2 | Initial JS (excluding lazy 3D/admin chunks) ≤ 200 KB gzipped |
| P-3 | Total 3D assets ≤ 3 MB compressed on first load |
| P-4 | ≥ 55 fps desktop (high tier), ≥ 30 fps mid-tier mobile |
| P-5 | CLS ≤ 0.1 |
| P-6 | Hero footage: poster image first, video ≤ 4 MB per clip, muted autoplay, lazy |

### Accessibility
| ID | Requirement |
|---|---|
| A-1 | WCAG 2.2 AA contrast in both themes |
| A-2 | Full keyboard navigation; visible focus rings; skip-to-content link |
| A-3 | All 3D content has an equivalent DOM version (project list readable without WebGL) |
| A-4 | Respects `prefers-reduced-motion` (section 6.4) |
| A-5 | Images have alt text (required field in admin) |

### SEO and sharing
| ID | Requirement |
|---|---|
| S-1 | Per-route title, description, Open Graph and Twitter card images |
| S-2 | `sitemap.xml` and `robots.txt`; `/admin` disallowed |
| S-3 | JSON-LD `Person` schema on home |

### Browser support
Latest 2 versions of Chrome, Edge, Firefox, Safari (macOS + iOS), Samsung Internet. Without WebGL → low-tier fallback.

### Security
| ID | Requirement |
|---|---|
| SEC-1 | Only anon key in frontend; all writes protected by RLS |
| SEC-2 | Admin routes require an authenticated session matching the owner's user id |
| SEC-3 | Contact form: Zod validation, honeypot field, rate limit (Part 7) |
| SEC-4 | Uploaded files restricted by type and size (Part 2) |

## 13. Conventions

- **Code:** TypeScript strict; no `any` without a comment explaining why. Components `PascalCase.tsx`, hooks `useThing.ts`, one component per file.
- **Styling:** tokens only; CSS Modules per component.
- **3D:** every scene object disposes geometries/materials on unmount; heavy loops use `useFrame` with delta time, never `setInterval`.
- **Data:** every entity has a Zod schema in `src/data/`; UI never reads raw rows without parsing.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `spec:`…), one task per commit where practical.
- **Env:** `.env.example` documents every variable; secrets never committed.

## 14. Spec-driven workflow

1. Claude writes the part spec (Requirements → Design → Tasks).
2. Ausaf reviews; changes are made in the spec, not in code.
3. On approval, Claude builds strictly against the task list.
4. Each part ends with a verification step: every acceptance criterion is checked and marked ✅ / ❌ in the spec.
5. Changes discovered mid-build go back into the spec first (version bump + changelog line).

**Definition of Done (every part):** all acceptance criteria pass · builds with no TS/lint errors · works in both themes · works at 375 px and 1440 px widths · reduced-motion respected · no console errors.

| Part | Spec |
|---|---|
| 0 | Master spec (this document) |
| 1 | Supabase data model, RLS, auth |
| 2 | Admin panel + custom-section builder |
| 3 | App shell: routing, theme system, smooth scroll, Fast Lane, device tiers |
| 4 | Hero scene: film intro, footage → particles |
| 5 | 3D globe and project system |
| 6 | Content chapters: About, Credits, Timeline, Reviews, Custom |
| 7 | Contact form + admin inbox |
| 8 | Performance, SEO, accessibility audit, Netlify deploy |

## 15. Part 0 deliverables (tasks)

Part 0 produces the foundation every later part builds on:

- [x] 0.1 Scaffold Vite + React + TypeScript project with the folder structure in §10
- [x] 0.2 Add ESLint, Prettier, Vitest; strict `tsconfig`
- [x] 0.3 Implement `src/theme/tokens.ts` with all tokens from §6 (both themes)
- [x] 0.4 Emit tokens as CSS custom properties; global styles, resets
- [x] 0.4a Implement `src/theme/fonts.ts` and generate `@font-face`, font variables and preloads from it (§6.2.1); self-host EB Garamond Italic and Inter
- [x] 0.5 Add `.env.example`, `netlify.toml` (SPA redirect), README with setup steps
- [x] 0.6 Token preview page (`/dev/tokens`, dev-only) showing colours, type and motion in both themes

### Acceptance criteria — Part 0
- [x] AC-0.1 `npm run dev`, `npm run build`, `npm run lint`, `npm test` all succeed on a clean clone. ✅ *verified on a fresh clone: `npm ci`, `build`, `lint`, `test` pass; `dev` serves `/` and `/dev/tokens` with no console errors*
- [x] AC-0.2 Token preview page renders every colour, type size and motion token in both themes. ✅ *checked in Chromium at 1440 px and 375 px, both themes, no horizontal scroll*
- [x] AC-0.3 All §6.1 text/background pairs pass WCAG AA (automated contrast test). ✅ *26 contrast tests; caught light `success` at 4.47:1, fixed to `#1B7849` (4.91:1)*
- [x] AC-0.4 No hard-coded colour values outside `tokens.ts` (lint/grep check). ✅ *`tests/unit/guardrails.test.ts`; also a test that every `var(--…)` used in `src/` is defined*
- [x] AC-0.5 Folder structure matches §10. ✅ *`tests/unit/guardrails.test.ts`*
- [x] AC-0.6 Changing `family` and `files` in `fonts.ts` (test: swap Garamond for another serif) updates the whole site with no other file edited. ✅ *`tests/unit/designSystem.test.ts` swaps the italic font and checks every generated rule*
- [x] AC-0.7 No font family names appear outside `fonts.ts` (grep check). ✅ *`tests/unit/guardrails.test.ts`*

## 16. Decisions log

| # | Topic | Decision |
|---|---|---|
| D1 | Accent colours | From Awwwards Animation palette: tungsten orange `#F57327` / `#C14E0B` + signal blue `#49ABE8` / `#1981C8` (§6.1) |
| D2 | Fonts | Two fonts only: Garamond italic for display/emphasis (EB Garamond as licensed stand-in for Apple Garamond) + Inter 400/500/700. Swappable from one config file (§6.2.1) |
| D3 | Hero footage | Fully admin-managed, swappable at any time (§11.1); placeholders until real clips are uploaded |
| D4 | Display name | "Ausaf Hussain" |
| D5 | Domain | Netlify subdomain first; custom domain added later (no code change needed) |
| D6 | Repository | Ausaf creates the GitHub repo and attaches it; Part 0 build tasks start after that |
| D7 | Monospace font | Dropped; data labels use Inter Medium with tabular numbers |

No open questions.

## Changelog
- 0.1 (2026-10-13) — Initial draft.
- 0.2 (2026-10-13) — Accent colours from Awwwards palette; Garamond italic + Inter; admin-managed hero footage (§11.1); display name, hosting and repo decisions recorded (§16).
- 0.3 (2026-10-13) — Two fonts only (JetBrains Mono removed); fonts swappable from a single `fonts.ts` config (§6.2.1, FT-1–FT-6, AC-0.6/0.7).
- 0.4 (2026-10-14) — Built and verified. Changes found during the build: light `success` darkened to `#1B7849` (failed AA at 4.47:1); added `on-accent` token for button labels; fluid type minimums defined for 375 px (hero 56→160 px); CSS variable naming documented (§6.1, §6.2).
