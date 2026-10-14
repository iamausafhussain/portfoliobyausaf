# Ausaf Hussain — Portfolio

A cinematic, animated portfolio ("Director's Cut × Data in Transit") built with React, Three.js and Supabase, deployed on Netlify. Every piece of content is editable from an admin panel.

The project is built **spec-first**: read [`specs/`](specs/) before changing behaviour.

| Spec                                                          | Status         |
| ------------------------------------------------------------- | -------------- |
| [Part 0 — Master spec](specs/00-master-spec.md)               | Built          |
| [Part 1 — Data model, security, auth](specs/01-data-model.md) | Built, live    |
| [Part 2 — Admin panel](specs/02-admin-panel.md)               | Spec in review |
| Parts 3–8                                                     | Not started    |

## Requirements

- Node.js 22 or newer (`node -v`)
- Git
- For the database tests only: PostgreSQL 15+ command-line tools (`initdb`, `pg_ctl`, `psql`)

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the two Supabase values (see supabase/README.md)
npm run dev               # http://localhost:5173
```

The site runs without a `.env`; anything that needs data will show a clear "Supabase is not configured" error until the values are set.

## Scripts

| Command            | What it does                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`      | Start the dev server                                                                                                  |
| `npm run build`    | Type-check and build to `dist/`                                                                                       |
| `npm run preview`  | Serve the production build locally                                                                                    |
| `npm run lint`     | ESLint                                                                                                                |
| `npm run format`   | Prettier (write)                                                                                                      |
| `npm test`         | Unit tests and repository guardrails (Vitest)                                                                         |
| `npm run db:test`  | Apply all migrations to a throwaway local Postgres and run the security tests                                         |
| `npm run db:types` | Regenerate `src/data/database.types.ts` from your Supabase project (needs the Supabase CLI and `SUPABASE_PROJECT_ID`) |

## Design system

All visual decisions live in two files:

- [`src/theme/tokens.ts`](src/theme/tokens.ts) — colours (dark and light), type sizes, spacing, radii, layers, motion.
- [`src/theme/fonts.ts`](src/theme/fonts.ts) — the two fonts (italic display and body).

At build time these are turned into CSS variables (`--color-bg`, `--font-italic`, `--space-4`, …) and injected into the page before first paint. Components only use the variables. Tests fail if a colour or font name appears anywhere else in `src/`, or if a component uses a variable that doesn't exist.

Preview every token in both themes at **http://localhost:5173/dev/tokens** (dev server only).

### Change a font

1. Put the new `.woff2` file in `public/fonts/`.
2. In `src/theme/fonts.ts`, change `family` and `files` for the role (`italic` or `body`).
3. If you switch between a serif and a sans-serif, also set `fallbackMetrics` (`'timesNewRoman'`, `'georgia'`, `'arial'`, …).
4. Restart `npm run dev`.

The `@font-face` rules, the size-matched fallback (prevents text jumping while the font loads), the CSS variable and the preload tag all update automatically.

### Change a colour

Edit the value in `src/theme/tokens.ts`, then run `npm test`. The contrast tests check every text/background pair against WCAG AA in both themes.

## Project structure

```
specs/            Specs for each part (read these first)
blender/          Blender Python scripts that generate 3D assets
public/           Static files: fonts, 3D models, favicon
supabase/         Database migrations, seed data, security tests, setup guide
build/            Vite plugin that injects the design system
src/
  app/            Router, providers, layout
  theme/          tokens.ts, fonts.ts, CSS generation
  lib/            Supabase client, query client, utilities
  data/           Database types, Zod schemas, query hooks
  scene/          Three.js / React Three Fiber scene (Part 5)
  chapters/       Home page chapters
  components/     Shared UI
  admin/          Admin panel (Part 2)
  styles/         Global CSS
  dev/            Dev-only pages
tests/            Unit tests (Vitest) and end-to-end tests (Playwright)
```

## Deploying

Netlify reads [`netlify.toml`](netlify.toml). In Netlify → Site configuration → Environment variables, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Full steps arrive in Part 8.

## Fonts licence

EB Garamond and Inter are licensed under the SIL Open Font License 1.1.
