# Part 9 — Launch: Traffic, SEO, Speed, Accessibility

**Status:** Built — live checks pending (run 0011, function env scopes, Search Console, PageSpeed on the live site)
**Version:** 0.3 · 2026-10-17
**Depends on:** every earlier part; Part 7 (visitor hashing, salt), Part 8 (orders, for sales per product)
**Feeds:** —(last planned part)

---

## 1. Scope

The site works. This part makes it **measurable, findable, fast and safe to run** with real visitors and buyers.

- **A. Traffic** — your own analytics in the admin (chosen: option A): visitors, pages, where people come from, and how product views turn into sales. No cookies, no banner.
- **B. SEO and sharing** — real titles, descriptions and preview cards when a link is shared on WhatsApp, LinkedIn, X or Instagram; sitemap; Google Search Console.
- **C. Speed** — measure against the master-spec budgets (P-1 – P-6) and fix what misses.
- **D. Accessibility audit** — automated checks on every page in both themes, plus a keyboard and screen-reader pass (A-1 – A-5).
- **E. Running it** — keep the free Supabase project awake, security headers, error reports, and the launch checklist (own domain, Dodo live mode).

### Out of scope
- Heatmaps, session recordings, A/B tests, ad tracking pixels (Meta, Google Ads).
- Email newsletters or marketing automation.
- A blog.

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-9.1 | owner | to see how many people visit, which pages, and where they came from | I know what my Instagram / YouTube posts bring in |
| US-9.2 | owner | to see views → buy clicks → sales per product | I know which products sell and which pages need work |
| US-9.3 | visitor | not to be tracked across sites or asked about cookies | the site feels respectful |
| US-9.4 | owner | a nice preview card when I share my site, a project or a product | links get clicked |
| US-9.5 | recruiter / buyer | the site to open fast on a phone | I don't leave before it loads |
| US-9.6 | owner | the site to stay up even if nobody visits for a week, and to hear when something breaks | buyers never hit a dead shop |

### 2.2 Traffic (TR)

| ID | Requirement |
|---|---|
| TR-1 | **What's recorded**, once per page view on the public site: the page (path only, no query string; UTM tags go in their own fields), the referring site (host only, e.g. `instagram.com`), UTM source / medium / campaign, device type (phone / tablet / desktop), browser family, country (Q2), and the time. **Never** stored: IP addresses, full user agents, full referrer URLs, emails or anything typed. |
| TR-2 | **Visitors without cookies**: a visitor is counted with a one-way hash of (IP address + browser + the day + a secret salt), the same idea as Part 7's protection. The hash changes every day, so nobody can be followed across days, and the site sets no cookies or local IDs. "Visitors" therefore means unique visitors per day. |
| TR-3 | **Events** besides page views: `buy_click` (product), `checkout_return` (product, paid / failed), `free_claim` (product), `download` (product), `contact_sent`, `resume_open`, `code_link` (a discount-code link was opened). |
| TR-4 | **Not counted**: bots and crawlers (user-agent list), the admin pages, demo mode, and **you** — a "Don't count my visits" switch in the admin (saved in that browser) (Q3). |
| TR-5 | Recording is **fire-and-forget**: it never delays or breaks a page; if it fails nothing is shown. Uses `navigator.sendBeacon` / `keepalive` where available. Respects the browser's **Do Not Track / Global Privacy Control** signal by not recording (Q4). |
| TR-6 | **Abuse limits** in the database (like Part 7): at most 300 events per visitor per hour and 50,000 per day for the whole site; values are length-checked; unknown event names are refused. |
| TR-7 | **Admin → Traffic** page, for the last 7 / 30 / 90 days (and "today"): visitors, page views, and their change against the previous period; a chart of visitors and page views per day; **Right now** (visitors in the last 5 minutes). |
| TR-8 | Lists on the Traffic page, each with counts and share: **Top pages** (titles shown for projects, products and sections), **Sources** (grouped: Instagram, YouTube, LinkedIn, WhatsApp, Google, X, GitHub, Direct, Other; plus UTM campaigns), **Countries**, **Devices** and **Browsers**. Clicking a source or a page filters the whole page by it. |
| TR-9 | **Shop funnel** per product for the period: views → buy clicks → paid orders (from Orders) → conversion %, and revenue; plus free claims and discount-code-link opens. |
| TR-10 | Dashboard card "Visitors" (last 7 days, with change) linking to Traffic. |
| TR-11 | **Retention** (Q5): raw events are kept for 13 months, then deleted by a daily job; daily totals per page / source / country are kept for good, so the long-range chart still works. |
| TR-12 | The Privacy policy template (Part 8) gains a short "Analytics" paragraph describing exactly the above (still marked for your review). |

### 2.3 SEO and sharing (SEO) — master spec S-1 – S-3

| ID | Requirement |
|---|---|
| SEO-1 | Every page has a proper title and description: home (from Site settings), projects, products, custom-section pages, shop, policies. 404s and the admin are `noindex`. |
| SEO-2 | **Preview cards** (Open Graph + Twitter): image, title, description for home, every project, every product and section pages. Because chat apps don't run JavaScript, the tags are put into the page **on the server** by a small Netlify Edge Function that reads the published content from Supabase (Q1). |
| SEO-3 | Default share image: a 1200×630 card generated at build time in the site's style (your name, role, "Portfolio"); projects and products use their cover image. |
| SEO-4 | `sitemap.xml` listing home, shop, published projects, products and section pages, kept current automatically (served by the same edge function); `robots.txt` allowing everything except `/admin`, `/d/`, `/shop/thanks`. |
| SEO-5 | Structured data: `Person` on home (name, role, links), `Product` with price on product pages, `CreativeWork` on project pages. |
| SEO-6 | Setup guide steps for **Google Search Console** (verify the site, submit the sitemap) and checking cards with the platforms' preview tools. |

### 2.4 Speed (PF) — master spec P-1 – P-6

| ID | Requirement |
|---|---|
| PF-1 | Measure the live site with Lighthouse (mobile, throttled) for home, a project, the shop and a product; record the numbers in this spec. |
| PF-2 | Meet the budgets: LCP ≤ 2.5 s, CLS ≤ 0.1, initial JS ≤ 200 KB gzipped (today ≈ 131 KB), 3D ≤ 3 MB, hero video ≤ 4 MB with a poster first. Fix whatever misses (lazy-load, image sizes, preloading the display font, splitting large chunks). |
| PF-3 | Images uploaded in the admin get responsive sizes on the public site (`srcset`) where Supabase's free plan allows; otherwise the admin's existing resize stays the limit. |
| PF-4 | Long-term caching for fonts and built files (already set); short caching for the HTML so a new deploy shows at once. |
| PF-5 | A size check in the tests fails the build if initial JS goes over 200 KB gzipped. |

### 2.5 Accessibility (AX) — master spec A-1 – A-5

| ID | Requirement |
|---|---|
| AX-1 | Automated accessibility checks (axe) on every public page type and every admin page, in both themes, at 375 and 1440 px; no serious or critical issues. |
| AX-2 | Manual pass: keyboard only (tab order, focus visible, no traps outside dialogs), screen reader (headings, landmarks, live messages on forms, shop and thank-you pages), 200 % zoom, reduced motion. Findings and fixes listed here. |
| AX-3 | Colour contrast AA in both themes, including the accent on light backgrounds and text over hero footage. |

### 2.6 Running the site (OP)

| ID | Requirement |
|---|---|
| OP-1 | **Keep-alive**: a daily scheduled ping keeps the free Supabase project from pausing after a quiet week (Q6). |
| OP-2 | **Security headers**: a Content-Security-Policy that allows only the site itself, Supabase, Google Fonts (if used) and Dodo's checkout redirect; plus HSTS once on your own domain. Checked with an online header test (grade A). |
| OP-3 | **Error reports** (Q7): JavaScript errors on the public site and the admin are reported, with page and browser, without personal data, and listed for you; repeated errors are grouped. |
| OP-4 | **Launch checklist** in the setup guide: own domain on Netlify (Q8) → `SITE_URL` and Supabase auth URLs updated → Resend domain verified (buyer emails) → Dodo live mode (keys, webhook, re-save products, re-create codes) → Search Console → one real purchase and refund. |
| OP-5 | A **status line** on the admin dashboard: last deploy's age, whether the shop functions answer, Supabase reachable. |

## 3. Design

### 3.1 How a page view travels

```
Public page (route change) ── track() ── sendBeacon ──► Supabase RPC  public.track(event, path, …)
                                                          │  security definer, callable by visitors
                                                          │  reads the visitor's IP from the request headers
                                                          │  visitor = sha256(ip | ua family | day | salt) — IP dropped
                                                          │  limits (TR-6), bot filter, length checks
                                                          ▼
                                                   analytics.events  (owner read only)
                                                          │  daily job (pg_cron): roll up → analytics.daily, delete > 13 months
                                                          ▼
Admin → Traffic ── owner-only RPCs (traffic_summary, traffic_series, traffic_top, shop_funnel) ──► charts and lists
```

The browser never reads the events table. Visitors can only call `track`, which can only add rows.

### 3.2 Database (`0011_analytics.sql`)

- Schema `analytics` (not exposed to the API): `events` (time, name, path, product_id, referrer_host, utm_source / medium / campaign, country, device, browser, visitor hash), `daily` (date, dimension, value, visitors, views), `salt` (rotated daily).
- `public.track(...)`: the only thing visitors can call. `public.traffic_*` and `public.shop_funnel(...)`: owner only (two-factor, like the rest of the admin).
- Indexes on (time), (name, time), (path, time). Database tests in the Part 1 / 7 style: visitors can't read anything, can't exceed limits, the IP never lands in a table.

### 3.3 Files

```
src/analytics/track.ts           track(), page-view hook, bot / opt-out / DNT checks
src/admin/traffic/TrafficPage.tsx, traffic.ts, traffic.module.css, VisitorsCard.tsx
netlify/edge-functions/meta.ts    preview cards + structured data per page (SEO-2, SEO-5)
netlify/edge-functions/sitemap.ts sitemap.xml (SEO-4)
public/robots.txt, public/og-default.png (generated)
netlify/functions/keep-alive.mts  daily ping (OP-1)
supabase/migrations/0011_analytics.sql, supabase/tests/analytics.test.sql
tests/e2e/traffic.spec.ts, seo.spec.ts, a11y.spec.ts; tests/unit/analytics.test.ts
```

### 3.4 Look

The Traffic page follows the admin style: number cards on top, one line chart (visitors and page views), then lists with thin bars showing each row's share. Dark and light themes, phones included. Demo mode has believable sample traffic for 90 days so the page can be tried without real visitors.

## 4. Tasks

### A. Traffic
- [x] 9.1 `0011_analytics.sql`: tables, `track`, owner reports, limits, daily job; database tests
- [x] 9.2 `track()` in the site: page views and events (TR-3), opt-outs (TR-4, TR-5)
- [x] 9.3 Admin Traffic page, filters, shop funnel, dashboard card; demo data
- [x] 9.4 Privacy policy paragraph (TR-12)

### B. SEO and sharing
- [x] 9.5 Titles and descriptions everywhere; noindex where needed
- [x] 9.6 Edge function for preview cards and structured data; default share image
- [x] 9.7 Sitemap and robots.txt; Search Console steps

### C–D. Speed and accessibility
- [x] 9.8 Lighthouse runs, JS size check in the build (fixes for LCP: see 0.3 notes)
- [x] 9.9 axe checks in e2e for every page type and theme; manual pass and fixes

### E. Running it
- [x] 9.10 Keep-alive, security headers, error reports, dashboard status line
- [x] 9.11 Launch checklist in the setup guide

### F. Verify
- [x] 9.12 Unit, e2e, database tests; screenshots; every acceptance criterion; spec, README, commit and push

## 5. Acceptance criteria

### Traffic
- [ ] AC-9.1 *(demo and database tests pass; live check after running 0011)* Visiting pages on the live site shows up on Admin → Traffic within a minute: visitors, views, pages, sources (an `?utm_source=instagram` link counts as Instagram), country and device.
- [x] AC-9.2 The shop funnel shows views, buy clicks, paid orders and conversion per product, matching Orders.
- [x] AC-9.3 No cookies or local IDs are set for tracking; no IP or full user agent is stored anywhere (database tests); admin pages, bots, DNT/GPC browsers and "Don't count my visits" aren't recorded.
- [x] AC-9.4 Tracking failures never show an error or slow a page; visitors can't read analytics data or exceed the limits (database tests).

### SEO
- [ ] AC-9.5 *(unit tested; check with the preview tools after deploy, setup guide E3)* Sharing the home page, a project and a product in WhatsApp / LinkedIn / X shows the right image, title and description (platform preview tools).
- [ ] AC-9.6 *(unit tested; live check after deploy)* `sitemap.xml` lists every published page and updates when you publish something; `robots.txt` blocks the admin; structured data passes Google's Rich Results test for a product.

### Speed and accessibility
- [ ] AC-9.7 *(local build, simulated slow 4G: Performance 90 home / 90 shop, CLS 0, LCP 2.8 s / 3.0 s — over the 2.5 s budget; JS check passes at 178 KB. Live numbers to record from PageSpeed Insights)* Lighthouse mobile for home, a project, the shop and a product: LCP ≤ 2.5 s, CLS ≤ 0.1, Performance ≥ 85 (numbers recorded here); the JS size check passes.
- [ ] AC-9.8 *(axe: no serious or critical issues on 10 public page types × 4 and 14 admin pages × 3; keyboard checked in e2e; screen-reader pass by Ausaf, setup guide E5)* axe reports no serious or critical issues on any page type, both themes, 375 and 1440 px; manual keyboard and screen-reader pass done.

### Running it
- [ ] AC-9.9 *(CSP checked on the build with no violations; error list works in demo; keep-alive and header grade after deploy)* The Supabase project stays awake through a week without visits; security headers get an A; a test error appears in the error list.
- [x] AC-9.10 Build, lint, unit, e2e and database tests pass; the launch checklist is in the setup guide.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Supabase free plan limits (database 500 MB) fill up with events | Small rows (~200 bytes), daily roll-ups, 13-month retention (TR-11); the Traffic page shows the table size |
| Ad blockers stop analytics on some visitors | Own domain endpoint (Supabase API), no third-party script; numbers are a lower bound and the page says so |
| Country header not available from Supabase in some regions | Fallback to the browser's time zone (Q2) |
| Preview-card edge function adds delay | It only changes the HTML head, caches Supabase answers for a few minutes, and falls back to the plain page on any error |
| A strict Content-Security-Policy breaks something | Roll out in report-only mode first, then enforce |

## 7. Open questions

| # | Question | Answer |
|---|---|---|
| Q1 | **Preview cards**: put the tags in on the server with a Netlify Edge Function (always up to date; included in Netlify's free plan), or generate static pages at build time (needs a rebuild after each change in the admin)? | **Decided:** Netlify Edge Function (default) |
| Q2 | **Country**: from the network (Cloudflare's country header, if Supabase passes it) with the browser's time zone as a fallback, or only from the time zone (less accurate, e.g. can't tell India from Sri Lanka)? | **Decided:** Network, time-zone fallback (default) |
| Q3 | Exclude **your own visits** with a switch in the admin (per browser)? | **Decided:** Yes, and on by default in any browser where you've signed in to the admin (default) |
| Q4 | Respect **Do Not Track / Global Privacy Control** (don't record those visitors)? | **Decided:** Yes (default) |
| Q5 | **Keep raw events** for 13 months, then only daily totals? | **Decided:** Yes (default) |
| Q6 | **Keep-alive**: a Netlify scheduled function (no extra account) or a GitHub Actions schedule (stops if the repo is inactive for 60 days)? | **Decided:** Netlify scheduled function (default) |
| Q7 | **Error reports**: your own error list in the admin (simple, free, no extra account), or **Sentry**'s free plan (richer: stack traces with source maps, alerts by email)? | **Decided:** Own list in the admin (default) |
| Q8 | **Own domain**: do you have one or want to buy one (e.g. `ausafhussain.com`, roughly ₹800–1,200 a year)? It's needed for buyer emails from your own address and looks more professional. The launch steps work with or without it. | **Decided:** Plan for one; steps cover both (default) |
| Q9 | Show **real-time** ("right now") on the Traffic page? It adds a small query every 30 seconds while the page is open. | **Decided:** Yes (default) |

## Changelog
- 0.1 (2026-10-17) — Draft. Part 9 was "performance, SEO, accessibility, deploy"; the site is already deployed on Netlify, so deploy becomes the launch checklist, and Ausaf asked for traffic analytics in the admin (option A).
- 0.2 (2026-10-17) — Approved by Ausaf with all defaults (Q1–Q9).
- 0.3 (2026-10-17) — Built. Notes:
  - Recorded pages are paths only; UTM tags have their own fields, and a tab keeps its entry source for later pages (sessionStorage, not a cookie or ID). Country: Cloudflare's header when present, else the browser's time zone mapped to a country in the database (tz database, 542 zones and aliases).
  - The Content-Security-Policy forbids `eval`; Zod probed for it, so Zod now runs with `jitless` (no change in validation). The policy is written at build time with the theme script's hash (`dist/_headers`); `scripts/check-csp.mjs` loads the build with it (7 pages, no violations).
  - Netlify's functions need the two Supabase variables with the **Functions** scope (setup guide E2).
  - Speed: first-load JavaScript is 178 KB gzipped (budget 200). On Lighthouse's simulated slow 4G the page paints at ~2.2 s and LCP is 2.8–3.0 s, over P-1's 2.5 s: the site can't show anything until React and the router are loaded. Options for a later change (not built): load below-the-fold chapters on demand, and replace the data client with a smaller one. Real-phone numbers from PageSpeed Insights decide whether it's needed.
  - Policy chips in the admin are a button group (axe: tabs can't be "pressed").
  - The screen-reader pass and the live checks are in the launch checklist (setup guide E5).
