# Part 3 — App Shell: Routing, Themes, Smooth Scroll, Fast Lane, Device Tiers

**Status:** Approved · Built and verified in demo mode (2026-10-14)
**Version:** 0.3 · 2026-10-14
**Depends on:** Part 0 (tokens, fonts), Part 1 (data layer), Part 2 (admin, demo mode)
**Feeds:** Parts 4–7 plug their chapters into the shell built here

---

## 1. Scope

The frame every public page lives in, and the systems the cinematic chapters rely on. After this part the site is fully navigable, themed and accessible, with placeholder chapters that Parts 4–7 replace.

### In scope
- **Theme system** (master spec TH-1 – TH-6): no-flash first paint, the toggle, a cinematic switch animation, the same toggle in the admin.
- **Public layout**: top bar (name, chapter indicator, chapter menu, theme toggle), the **Fast Lane** (Resume · Projects · Contact), footer, film-grain overlay.
- **Home page skeleton**: every chapter in order (including custom sections placed by `insert_after`), each with an anchor and a temporary placeholder.
- **Routes**: `/`, `/projects/:slug`, `/s/:slug`, `/resume`, 404 — the two detail pages render a plain, readable version now (styled properly in Parts 5–6).
- **Smooth scroll** (Lenis) wired to GSAP ScrollTrigger, plus scroll-to-chapter.
- **Device tiers** (`high` / `mid` / `low`) and a visitor-facing **Lite mode** switch.
- **Reduced motion** handling shared by everything.
- **Public demo mode**: `npm run dev:demo` also shows the public site with the demo content (published items only), so the whole site can be previewed and tested without Supabase.

### Out of scope
- The look of each chapter (hero → Part 4, globe → Part 5, content chapters → Part 6, contact → Part 7).
- 3D scene, its theme transition and its tier behaviour (Part 5 consumes the APIs defined here).
- SEO metadata, sitemap, Open Graph images → Part 8 (this part only sets page titles).

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-3.1 | visitor | the site to open in my system's light or dark mode, without a flash | it feels polished from the first frame |
| US-3.2 | visitor | to switch theme with one click and have it remembered | I can read it the way I like |
| US-3.3 | recruiter | Resume, Projects and Contact always one click away | I get what I need in seconds |
| US-3.4 | visitor | to always know which chapter I'm in and jump to any other | the long scroll never feels lost |
| US-3.5 | visitor on a slow phone | the site to stay smooth, and to be able to switch effects off | it's usable on any device |
| US-3.6 | visitor sensitive to motion | animation to calm down when my system asks for reduced motion | it's comfortable to use |
| US-3.7 | visitor with a link to a project or section | that page to open directly | shared links work |
| US-3.8 | keyboard or screen-reader user | every control to be reachable and announced | the site works for me |
| US-3.9 | owner | to preview the whole site with sample content without Supabase | I can try changes safely |

### 2.2 Functional requirements

#### Theme (master spec §7)

| ID | Requirement |
|---|---|
| TS-1 | Before first paint, an inline script in `index.html` sets `data-theme` on `<html>` from the saved choice, or from `prefers-color-scheme` if there is none (TH-1, TH-3). It is generated from `tokens.ts` at build time and is a few hundred bytes. |
| TS-2 | The toggle switches dark ↔ light and saves the choice in `localStorage` (try/catch; works without storage, it just isn't remembered) (TH-2). |
| TS-3 | While no choice is saved, the site follows live OS changes (e.g. the phone switching to dark at sunset). |
| TS-4 | The switch animates as an **iris wipe** — the new theme opens as a circle from the toggle, like a camera iris — over `dur-slow` (600 ms), using the View Transitions API. Browsers without it cross-fade colours over 600 ms. Reduced motion: instant. (TH-4) |
| TS-5 | Theme state is available to code through `useTheme()` → `{ theme, setTheme, toggle, transition }`, where `transition` (start time and duration) lets the 3D scene (Part 5) tween in sync. |
| TS-6 | `<meta name="theme-color">` follows the theme so the phone's browser bar matches. |
| TS-7 | The admin uses the same toggle and the same saved choice (TH-5). |
| TS-8 | The toggle is a button with a clear label ("Switch to light theme"), visible focus, and a projector-switch icon that animates between states. |

#### Layout and navigation

| ID | Requirement |
|---|---|
| NV-1 | **Top bar** (all public pages): "Ausaf Hussain" (link home), chapter indicator, chapter menu button, theme toggle. Transparent over the hero, gains a background once scrolled; hides on scroll down and returns on scroll up (always visible with reduced motion or keyboard focus inside it). |
| NV-2 | **Chapter indicator**: film-timecode style — `CH 02 · The System` plus a thin progress line for the whole page. On phones only the chapter number and name show. Updates as chapters enter the middle of the screen. |
| NV-3 | **Chapter menu**: lists every chapter (and custom sections with "Show in navigation") with their numbers; choosing one scrolls there smoothly and moves focus to that chapter's heading. Opens as a full-screen overlay on phones. Esc closes it. |
| NV-4 | **Fast Lane**: three always-visible actions — **Resume** (opens the PDF in a new tab), **Projects**, **Contact** (scroll to the chapter; from other pages, go home and then scroll). Desktop: a small pill at the top right inside the top bar. Phones: a floating pill at the bottom centre that steps aside while the menu is open. Hidden if the resume isn't uploaded (Resume button only). |
| NV-5 | **Footer**: name, social links from settings, "Available for work" badge, Lite-mode switch, admin link (small, `rel="nofollow"`), © year. |
| NV-6 | **Skip link** to the main content (already in Part 0) and a `<main>` landmark on every page. |
| NV-7 | Route changes: scroll to top (or to the `#hash`), focus moves to the new page's `<h1>`, the document title updates, and a short cross-fade plays (View Transitions; none with reduced motion). |

#### Home page skeleton

| ID | Requirement |
|---|---|
| HP-1 | Chapters render in this order: hero, about, projects, credits, timeline, reviews, contact (master spec §5). |
| HP-2 | Published custom sections with "Show on home page" are inserted after the chapter named in `insert_after`, ordered by `sort_order`. |
| HP-3 | Each chapter is a `<section>` with an id (`#hero`, `#about`, `#projects`, `#credits`, `#timeline`, `#reviews`, `#contact`, `#s-<slug>`), a heading, and its chapter number. |
| HP-4 | Until Parts 4–7 replace them, each chapter shows a simple placeholder with real data where it's cheap (e.g. counts and titles) so the page is meaningful. |
| HP-5 | Chapters register themselves with a `ChapterRegistry`, which the indicator, menu and Fast Lane read. Adding a chapter needs no changes to the shell. |

#### Routes

| ID | Requirement |
|---|---|
| RT-1 | `/projects/:slug` shows a published project: title, summary, role/year/client, tech, links, cover, gallery and the Markdown story, in a clean readable layout. Unknown or unpublished slug → 404 ("Scene not found"). |
| RT-2 | `/s/:slug` shows a published custom section that has "Its own page" turned on: name, intro and its published items rendered by field type. Otherwise 404. |
| RT-3 | `/resume` opens the resume PDF (redirect). With no resume uploaded: a short page saying so, with links to LinkedIn and Contact. |
| RT-4 | Loading states use skeletons, not spinners on blank pages; data errors show a calm message with Retry, never a broken page. |
| RT-5 | If Supabase isn't configured (and not in demo mode), the public site still renders the shell with placeholders, plus a one-line notice **in development only**. |

#### Smooth scroll

| ID | Requirement |
|---|---|
| SC-1 | Lenis smooth scrolling on mouse/trackpad **and touch** devices (Lenis `syncTouch`, with momentum tuned so it doesn't feel laggy). Native scrolling with reduced motion and in Lite mode. Text selection, find-in-page, pinch-zoom and `position: sticky` keep working. |
| SC-2 | Lenis drives GSAP ScrollTrigger (one shared ticker), so Parts 4–7 can attach scroll animations with `useScrollTrigger()`. |
| SC-3 | `scrollToChapter(id)` scrolls smoothly with an offset for the top bar, updates the URL hash without a jump, and focuses the heading. Keyboard scrolling (Space, Page Down, arrows, Home/End) keeps working. |
| SC-4 | Opening a URL with a `#hash` lands on that chapter after content loads. Back/forward restores scroll position. |
| SC-5 | GSAP and Lenis are **not** in the initial download: they load right after first paint (idle), keeping master spec P-2. |

#### Device tiers and Lite mode

| ID | Requirement |
|---|---|
| DT-1 | Tier is decided once per visit: **low** if there is no WebGL, `Save-Data` is on, memory ≤ 2 GB / ≤ 2 CPU cores, or WebGL runs in software (no GPU); **mid** on phones/tablets, memory ≤ 4 GB, or a known low-end GPU; otherwise **high**. |
| DT-2 | A 1-second frame-time probe after load moves the tier down one step if the median frame takes over 22 ms (below ~45 fps). It never moves up. |
| DT-3 | **Lite mode** switch (footer, and in the chapter menu): forces `low` and is remembered. Reduced motion doesn't force `low` (3D can still show, just without motion). |
| DT-4 | Testing override: `?tier=low|mid|high` sets the tier for the session. |
| DT-5 | `useDeviceTier()` returns `{ tier, reason, lite, setLite }`; `<html data-tier="…">` lets CSS adapt (e.g. grain off on `low`). |

#### Motion and grain

| ID | Requirement |
|---|---|
| MO-1 | `useReducedMotion()` follows `prefers-reduced-motion` live. With it on: no smooth scroll, no parallax, no iris wipe, transitions ≤ 200 ms (master spec §6.4). |
| MO-2 | **Film grain**: a subtle animated noise overlay at the token opacity (`grain-opacity`), drawn on a small canvas tile, paused when the tab is hidden; static on `mid`, off on `low` and with reduced motion. It never blocks clicks. |

#### Public demo mode

| ID | Requirement |
|---|---|
| PD-1 | With `VITE_DEMO=1` (dev only), public query hooks read the demo data (published rows only, same as RLS) instead of Supabase. Edits made in the demo admin show on the demo site in the same tab. |
| PD-2 | Like the admin demo, none of it reaches a production build (the bundle test is extended). |

## 3. Design

### 3.1 Components and modules

```
src/
├─ theme/
│  ├─ ThemeProvider.tsx      useTheme(), iris transition, theme-color meta
│  ├─ ThemeToggle.tsx        projector-switch button (public + admin)
│  └─ themeScript.ts         builds the inline pre-paint script (used by the Vite plugin)
├─ app/
│  ├─ PublicLayout.tsx       top bar, Fast Lane, footer, grain, <main>
│  ├─ RouteEffects.tsx       focus h1, title, scroll restoration, view transitions
│  └─ router.tsx             routes (admin stays a lazy chunk)
├─ shell/
│  ├─ TopBar.tsx, ChapterIndicator.tsx, ChapterMenu.tsx, FastLane.tsx, Footer.tsx
│  ├─ chapters.ts            ChapterRegistry + useChapter(id, meta) + chapter ordering
│  ├─ FilmGrain.tsx
│  └─ shell.module.css
├─ motion/
│  ├─ MotionProvider.tsx     lazy-loads GSAP + Lenis after first paint
│  ├─ useScrollTrigger.ts    safe hook for Parts 4–7 (no-op until loaded / when motion is off)
│  └─ scrollTo.ts            scrollToChapter()
├─ device/
│  ├─ tier.ts                detectTier() (pure, testable), frame probe
│  ├─ DeviceProvider.tsx     useDeviceTier(), Lite mode
│  └─ useReducedMotion.ts
├─ chapters/
│  ├─ HomePage.tsx           renders the ordered chapter list
│  ├─ ChapterPlaceholder.tsx
│  ├─ ProjectPage.tsx        /projects/:slug (plain version)
│  ├─ SectionPage.tsx        /s/:slug (plain version)
│  └─ ResumeRoute.tsx
└─ data/
   ├─ source.ts              PublicDataSource: Supabase or demo (dev only)
   └─ queries/public.ts      unchanged API, now reads through the source
```

### 3.2 Theme flow

```
index.html <head>
  inline script ── reads localStorage('theme') ─┬─ saved → data-theme
                                               └─ none  → matchMedia(prefers-color-scheme) → data-theme
React mounts ── ThemeProvider reads <html data-theme> (never re-decides) ── renders
Toggle click ── document.startViewTransition(() => set data-theme)
             └─ ::view-transition-new(root) clip-path: circle(0 → 150vmax at toggle centre), 600 ms ease-cinema
```

Tokens already define both themes on `[data-theme]` (Part 0), so switching is one attribute change.

### 3.3 Chapter ordering (pure function, unit-tested)

```ts
orderChapters(builtIn: ChapterKey[], sections: CustomSection[]): ChapterEntry[]
// built-ins in fixed order; each published, show_on_home section inserted after its
// insert_after chapter, ties broken by sort_order then name; 'contact' always last.
```

### 3.4 Tier detection (pure function, unit-tested)

```ts
detectTier(env: { webgl: boolean; saveData: boolean; memoryGB?: number; cores?: number;
                  touch: boolean; mobileUA: boolean; gpu?: string }): { tier; reason }
```

Low-end GPU list: software renderers (SwiftShader, llvmpipe), Mali-4xx/T6xx, Adreno 3xx–5xx, PowerVR SGX, Intel HD 2000–4000. `reason` is shown in a dev-only overlay (`?debug=tier`).

### 3.5 Bundle budget (master spec P-2: ≤ 200 KB gzip initial JS)

| Piece | Where | Approx. gzip |
|---|---|---|
| React, router, query, app shell, theme | initial | ~115 KB |
| supabase-js + Zod (needed for public data) | initial | ~55 KB |
| GSAP + ScrollTrigger + Lenis | lazy (idle) | ~35 KB |
| Admin | lazy (route) | as today |

The production-bundle test asserts the initial total stays under 200 KB and that GSAP/Lenis aren't in it.

### 3.6 New dependencies

`gsap` (with ScrollTrigger; free licence), `lenis`. Nothing else.

## 4. Tasks

- [x] 3.1 Theme: pre-paint script (from the Vite plugin), ThemeProvider, `useTheme`, iris transition, fallback cross-fade, theme-color meta, OS-follow
- [x] 3.2 ThemeToggle (projector switch) in public top bar and admin (sidebar + phone bar)
- [x] 3.3 Device: `detectTier`, frame probe, Lite mode, `?tier=` override, `useReducedMotion`, `data-tier`
- [x] 3.4 Motion: lazy GSAP + Lenis, shared ticker, `useScrollTrigger`, `scrollToChapter`, hash landing, scroll restoration
- [x] 3.5 Public data source with demo mode (PD-1/PD-2); extend bundle test
- [x] 3.6 ChapterRegistry, `orderChapters`, HomePage skeleton with placeholders
- [x] 3.7 Top bar, chapter indicator, chapter menu, Fast Lane, footer, film grain
- [x] 3.8 Routes: project page, section page, resume, 404, route effects (focus, title, transitions)
- [x] 3.9 Unit tests (theme script, tier detection, chapter ordering, storage failures) and e2e tests (§5)
- [x] 3.10 Screenshots at 375 / 1440 px, both themes, all tiers; fix issues; update docs and specs

## 5. Acceptance criteria

### Theme
- [x] AC-3.1 First visit with the OS in light mode renders light from the first paint; same for dark (checked before any JavaScript bundle runs). ✅ *e2e with the app bundle blocked, so only the inline script can act*
- [x] AC-3.2 After toggling, a reload keeps the choice; with `localStorage` blocked the toggle still works for the session. ✅ *e2e (reload keeps it; with storage throwing, no errors and the toggle works)*
- [x] AC-3.3 With no saved choice, changing the OS theme updates the open page. ✅ *e2e*
- [x] AC-3.4 The toggle runs the iris wipe in browsers with View Transitions, cross-fades otherwise, and switches instantly with reduced motion. ✅ *e2e (View Transition seen; reduced motion switches synchronously with no transition)*
- [x] AC-3.5 The admin toggle shares the same saved choice. ✅ *e2e*
- [x] AC-3.6 `theme-color` matches the theme's background. ✅ *e2e + unit (theme-color equals the background token)*

### Navigation
- [x] AC-3.7 The chapter indicator names the chapter in the middle of the screen while scrolling through every chapter, including a custom section. ✅ *e2e through all 8 chapters including the custom “Talks” section*
- [x] AC-3.8 The chapter menu lists all chapters plus nav-enabled sections; choosing one scrolls there and focuses its heading; Esc closes it. ✅ *e2e*
- [x] AC-3.9 Fast Lane: Resume opens the PDF; Projects and Contact scroll to their chapters — also from `/projects/:slug`. ✅ *e2e, including a resume uploaded in the demo admin appearing in the Fast Lane*
- [x] AC-3.10 Custom sections appear after their `insert_after` chapter in `sort_order`; drafts and "hidden from home" sections don't. ✅ *unit (`orderChapters`) + e2e*
- [x] AC-3.11 `/projects/:slug` and `/s/:slug` render published content and 404 for unpublished or missing slugs; `/resume` redirects or explains. ✅ *e2e (published project and section pages, draft/unknown → 404, `/resume` with no resume)*
- [x] AC-3.12 After every route change focus is on the page's `<h1>` and the title is updated. ✅ *e2e*

### Motion and devices
- [x] AC-3.13 Smooth scroll is on with a mouse and on touch, off with reduced motion and in Lite mode; keyboard scrolling works in all cases. ✅ *e2e: Lenis on with mouse and on touch; off with reduced motion and Lite; End key scrolls*
- [x] AC-3.14 `detectTier` gives the documented tier for each rule (unit tests); `?tier=` overrides; the probe only ever lowers the tier. ✅ *unit (every rule) + e2e (`?tier=`)*
- [x] AC-3.15 Lite mode is remembered and sets `data-tier="low"`; grain is off on `low` and with reduced motion. ✅ *e2e (persists across reload; grain hidden)*
- [x] AC-3.16 GSAP and Lenis aren't in the initial download; initial JS ≤ 200 KB gzip (bundle test). ✅ *bundle test: no GSAP, Lenis or Supabase Auth in the first download; initial JS 155 KB gzip*

### Quality
- [x] AC-3.17 Every public page works at 375 px and 1440 px, both themes, tiers low/mid/high, with no horizontal scroll and no console errors. ✅ *`tests/e2e/public-screens.spec.ts`: 4 pages + menu × 375/1440 × dark/light × low/mid/high, plus manual review of screenshots*
- [x] AC-3.18 Keyboard only: skip link, top bar, menu, Fast Lane, toggle, footer all reachable with visible focus; menu traps focus while open. ✅ *e2e (skip link first; top bar controls reachable; focus stays inside the open menu; Esc returns focus)*
- [x] AC-3.19 Public demo mode shows demo content; nothing demo-related is in a production build. ✅ *e2e uses demo content throughout; bundle test checks no demo code in production*
- [x] AC-3.20 Build, lint, unit, e2e and database tests all pass. ✅ *build, lint, 544 unit, 71 e2e (1 retried under load), 223 database checks*

## 6. Risks

| Risk | Mitigation |
|---|---|
| Smooth scroll fights the browser (jank on touch, broken find-in-page or anchors) | Touch momentum tuned and tested on a phone-sized touch emulation; anchors and keyboard tested; Lite mode and reduced motion switch it off |
| Theme transition looks wrong over WebGL (Part 5) | `transition` timing exposed in `useTheme()` so the scene tweens alongside; iris uses a screenshot of the page, so the canvas is included |
| Wrong tier on a capable phone | Mid tier still gets 3D; the probe only downgrades; visitors can force Lite mode |
| Initial bundle creeps over 200 KB | Bundle test fails the build; motion libraries lazy-loaded |

## 7. Decisions (Ausaf, 2026-10-14)

| # | Question | Decision |
|---|---|---|
| Q1 | Theme switch effect | Iris wipe |
| Q2 | Chapter indicator | Film timecode |
| Q3 | Fast Lane on phones | Floating pill at the bottom |
| Q4 | Smooth scroll on touch screens | **Yes** (changed from the draft default; SC-1, AC-3.13 updated) |
| Q5 | Lite mode switch for visitors | Yes |
| Q6 | Small "Admin" link in the footer | Yes, `nofollow` |

## Changelog
- 0.1 (2026-10-14) — Initial draft.
- 0.2 (2026-10-14) — Approved. Smooth scrolling on touch screens turned on (Q4).
- 0.3 (2026-10-14) — Built and verified. Changes found during the build:
  - **Software rendering counts as low tier** (DT-1): WebGL without a GPU (SwiftShader, llvmpipe) is far too slow for the 3D scene.
  - **Public reads use the small REST client** instead of the full Supabase client, so sign-in, realtime and storage code stay out of the first download: initial JS went from 205 KB to **155 KB gzip** (budget 200 KB).
  - **Landing on a #chapter holds its position** while content above it is still loading (it was being pushed down as images and data arrived), until the layout settles or the visitor scrolls.
  - The demo backend is now **shared** by the demo admin and the demo site in the same tab (PD-1), and edits in the admin refresh the site's data.
  - `--topbar-height` added as a design token.
