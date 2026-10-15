# Part 5 — The System: 3D Globe and Projects

**Status:** Approved — building
**Version:** 0.2 · 2026-10-15
**Depends on:** Part 0 (tokens), Part 1 (`projects`), Part 2 (admin), Part 3 (shell, tiers, motion), Part 4 (hero particles and their hand-off)
**Feeds:** Part 6 (other chapters reuse the shared 3D stage), Part 8 (performance pass)

---

## 1. Scope

The engineering half of "Director's Cut × Data in Transit" (master spec §1): a living 3D globe of glowing data, with your projects as nodes on it.

- **A. The 3D stage**: one shared WebGL canvas behind the whole home page (master spec §9). The hero particles from Part 4 move onto it, so the hero's dissolving footage can travel down the page and **re-form as the globe**.
- **B. The globe**: a dot-matrix Earth (real continents, drawn as thousands of small dots), your home node in Bhubaneswar, a node for each project, and **data packets** travelling along arcs between them, like messages on a pipeline.
- **C. The System chapter**: a scroll-driven tour. The globe turns to each featured project while its card slides in beside it, followed by a grid of all projects. Hover, click and drag work on desktop.
- **D. Project pages** (`/projects/:slug`): the proper cinematic version, styled at last (spec 03 left them plain).
- **E. Admin**: an optional "Place on globe" picker on the project form (projects without a position are placed automatically).

### Out of scope
- Other chapters' content and animation (About, Credits, Timeline, Reviews) → Part 6. They keep their Part 3 placeholders; the stage is built so Part 6 can use it.
- Contact form → Part 7. SEO, share images and the final performance pass → Part 8.

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-5.1 | recruiter | to see the projects clearly, with title, role, tech and a link, without needing the 3D | I can judge the work fast |
| US-5.2 | client | to feel the craft: a live system where my project would be a node | it's memorable |
| US-5.3 | visitor | to explore: turn the globe, hover a node, open a project | it's fun to use |
| US-5.4 | keyboard or screen-reader user | the same projects as a normal list with links | nothing is hidden from me |
| US-5.5 | owner | to choose where a project sits on the globe, or let it be placed for me | the map tells my story |
| US-5.6 | visitor on a phone or slow device | a light version that still looks intentional | the page stays fast |

### 2.2 Shared 3D stage

| ID | Requirement |
|---|---|
| ST-1 | One WebGL canvas, fixed behind the home page content, created once and kept while you scroll. It loads after the first paint as a lazy chunk; until then (and on the low tier) the page reads normally without it. |
| ST-2 | The stage holds layers that chapters switch on as they come into view: the hero particles (Part 4), the globe (Part 5), and later Part 6's scenes. Only visible layers draw, and the loop sleeps when nothing on screen is moving. |
| ST-3 | The Part 4 particles move onto the stage with no visible change to the hero. Their final cloud (Part 4 PT-4) is the starting point of the globe's formation (GL-6). |
| ST-4 | The frame-time guard (Part 4 PT-6), theme tweening (600 ms) and WebGL-failure fallback apply to the whole stage. |
| ST-5 | Pixel ratio capped at 2 (high) / 1.5 (mid); the canvas pauses while the tab is hidden. |

### 2.3 The globe

| ID | Requirement |
|---|---|
| GL-1 | **Dot-matrix Earth**: land drawn as evenly spaced dots (≈ 12 000 on high, ≈ 5 000 on mid) over a matte sphere in `globe-base`, with a thin atmosphere rim. Built from public-domain map data (Natural Earth) at build time into a small file (≤ 64 KB). No downloaded 3D model is needed. |
| GL-2 | **Home node**: Bhubaneswar, labelled "Home · Bhubaneswar", in `accent`. All packet routes start or end here. |
| GL-3 | **Project nodes**: one per published project at its `globe` position. Projects without a position are placed automatically (GL-4). Featured projects are larger and pulse gently. |
| GL-4 | **Auto-placement**: a project with no position gets a stable spot (it never moves between visits) spread around the globe, never on top of another node; the order follows `sort_order`. |
| GL-5 | **Data packets**: glowing dots travel along curved arcs between home and each project node, a few at a time, at a calm pace, like messages moving through a pipeline. Dark theme: additive glow (`accent`, `accent-2`) with a soft halo (the "bloom"); light theme: no glow, ink-like packets in `accent-2-text` with a soft shadow. |
| GL-6 | **Formation**: as The System scrolls into view, the scattered particles from the hero cloud fly in and settle into the globe's dots (about 1.2 s of scroll), then the nodes and arcs fade in. Scrolling back reverses it. With reduced motion: the globe simply fades in. |
| GL-7 | The globe idles with a slow spin (about one turn a minute) when the visitor isn't driving it. |
| GL-8 | Theme switch: matte dark globe ↔ porcelain light globe, glow ↔ shadow, tweened over 600 ms. |

### 2.4 The System chapter

| ID | Requirement |
|---|---|
| SY-1 | **Tour**: the chapter is pinned while you scroll through it, with one stop per featured project (up to 6). At each stop the globe turns so the node faces you and lights its arcs, and that project's card slides in beside it: cover, title, category · year, one-line summary, tech tags, "View project" link. |
| SY-2 | After the tour, an **"All projects" grid** of cards (every published project, featured first) scrolls normally. With no featured projects the tour is skipped and the grid shows straight after the globe. |
| SY-3 | **Hover a node** (desktop): a small label shows the title, and its card highlights. **Click a node**: opens the project page. **Hover a card**: its node lights up on the globe. |
| SY-4 | **Drag to rotate** (desktop mouse or trackpad): the globe turns with inertia and eases back to the tour's angle after a few seconds. The cursor shows `DRAG` over the globe (the Part 4 cursor API). Touch: no drag, so page scrolling is never trapped. |
| SY-5 | **Keyboard**: the cards are the real, focusable links. Focusing a card turns the globe to its node (a tab-through tour); no 3D-only controls. |
| SY-6 | **Layout**: desktop has the globe on one side and the card on the other; phones have the globe on top (smaller) and the card below; the floating Fast Lane never covers a card's link. |
| SY-7 | The chapter title, number and timecode behave as in Part 3; "Projects" in the Fast Lane lands on this chapter. |

### 2.5 Tiers and fallbacks

| ID | Requirement |
|---|---|
| TF-1 | **High**: full dots, packets with glow, formation from the hero particles. **Mid**: fewer dots and packets, no halo, formation kept. **Low / Lite / no WebGL**: no canvas. The chapter shows a still image of the globe (pre-rendered in both themes, ≤ 60 KB each; only the current theme's loads) and the same cards as a normal list; no pinning. |
| TF-2 | **Reduced motion**: no pinning, no camera turns and no flying particles: the chapter shows the still globe (as TF-1) and the cards as a normal list. |
| TF-3 | Everything in the chapter is readable with WebGL off (master spec A-3). The canvas is `aria-hidden`; all meaning lives in the DOM cards. |

### 2.6 Project page (`/projects/:slug`)

| ID | Requirement |
|---|---|
| PP-1 | A **title card** opening: category · year in the label style, title in Garamond, role and client, then the cover image full-width with the letterbox frame from Part 4 (no autoplaying video). |
| PP-2 | Body (Markdown) in a comfortable reading column; tech tags; link buttons (Live, Code, Case study, Video). |
| PP-3 | **Gallery**: images in a responsive grid; clicking one opens a full-screen viewer (keyboard: arrows, Esc; swipe on phones; focus is trapped and returned). |
| PP-4 | **Prev / Next project** at the bottom (in `sort_order`), plus "Back to The System", which returns you to the globe at that project's stop. |
| PP-5 | Page transitions use the existing view transitions; with reduced motion they're a fade. |
| PP-6 | Unknown or unpublished slug → the "Scene not found" page (as now). |

### 2.7 Admin: place on globe

| ID | Requirement |
|---|---|
| AD-1 | The project form gets a **"Place on globe"** field: a small flat world map you click to set the spot, plus latitude/longitude boxes for precision and a **"Place automatically"** option (the default, which stores `null`). |
| AD-2 | A few presets for convenience: "Home (Bhubaneswar)" and any city typed into a search box, from a small built-in list of ≈ 500 world cities (no external service). |
| AD-3 | Validation as in Part 1 (lat −90…90, lng −180…180). Works in demo mode; no database change needed (the `globe` column exists since Part 1). |

## 3. Design

### 3.1 Files

```
src/
├─ scene/
│  ├─ stage/                  (lazy chunk)
│  │  ├─ Stage.ts             one renderer, layers, sleep/wake loop, guard, theme tween
│  │  ├─ StageProvider.tsx    mounts the canvas once for the home page; useStageLayer()
│  │  └─ camera.ts            camera rig: scroll- and drag-driven orbit with inertia
│  ├─ hero/                   Part 4 particles, now a stage layer (no visual change)
│  └─ globe/                  (lazy chunk)
│     ├─ GlobeLayer.ts        sphere, dots, rim, nodes, arcs, packets
│     ├─ geo.ts               lat/lng ↔ 3D, great-circle arcs, auto-placement
│     ├─ formation.ts         hero cloud → globe dots morph
│     ├─ shaders/             dots, packets, rim (GLSL)
│     └─ data/                land-dots.bin (generated), cities.json (admin picker)
├─ chapters/system/
│  ├─ SystemChapter.tsx       pinned tour, cards, grid, fallbacks
│  ├─ ProjectCard.tsx         used by the tour, the grid and the low tier
│  └─ system.module.css
├─ chapters/project/          the styled project page and gallery viewer
└─ admin/fields/GlobeField.tsx  map picker
scripts/
├─ build-globe-data.mjs       Natural Earth land → evenly spaced dots → land-dots.bin
└─ render-globe-stills.py     the low-tier still images (dark + light)
```

### 3.2 Technology choice

**Built as:** the globe follows a DOM "slot" element (its centre and size come from the slot's box every frame, via the camera's view offset), so CSS decides where it sits, sticky positioning pins it, and the phone layout needs no extra 3D code. Picking, labels and drag happen in the DOM against the nodes' projected screen positions, no raycasting.


The master spec named React Three Fiber. Part 4 was built with plain Three.js and it fitted well: smaller download, no React re-renders per frame, and full control of the loop. Part 5 continues with plain Three.js and a small stage manager, so no R3F dependency. The master spec will be updated to match.

Packets get their "bloom" from additive halo sprites, not a post-processing pass, so there's no extra render pass and no extra library.

### 3.3 Scroll choreography

| Scroll position | What happens |
|---|---|
| Hero → About | Part 4: footage → particles → cloud (unchanged) |
| About | The cloud drifts gently behind About at low opacity (it isn't faded out completely any more) |
| Entering The System | Cloud → globe formation (GL-6); title card appears |
| Pinned tour | One stop per featured project; the globe turns to each node, one screen height of scroll per stop. Pinning is plain CSS `position: sticky`, so scrolling is never hijacked |
| After the tour | The globe scrolls away with the end of the tour (it follows its place in the page) and idles; the "All projects" grid scrolls in |
| Leaving | Globe fades out before Credits |

### 3.4 Data

- `projects.globe` (`{lat, lng}` or null) already exists (Part 1). No migration.
- `land-dots.bin`: Float32 lat/lng pairs, generated once by `npm run globe:data` and committed. Source: Natural Earth 1:110m land (public domain), from the `world-atlas` npm package, used only by the script.
- `cities.json`: name, country, lat, lng for ≈ 500 large cities (public-domain GeoNames data, trimmed by the same script).

### 3.5 New dependencies

Development only, for the data script: `world-atlas`, `topojson-client`. Nothing new in the browser (`three` arrived in Part 4).

## 4. Tasks

### A. Stage
- [ ] 5.1 Stage + StageProvider: one canvas, layers, sleep/wake loop, guard, theme tween, failure fallback
- [ ] 5.2 Move the hero particles onto the stage (no visual change; Part 4 tests stay green)

### B. Globe
- [ ] 5.3 Data script: land dots + cities; pre-rendered low-tier stills
- [ ] 5.4 GlobeLayer: sphere, land dots, rim, home and project nodes, auto-placement
- [ ] 5.5 Arcs and packets (glow in dark, ink in light), tier counts
- [ ] 5.6 Formation from the hero cloud; idle spin; reduced-motion version

### C. Chapter
- [ ] 5.7 SystemChapter: pinned tour, cards, globe turns per stop, "All projects" grid
- [ ] 5.8 Interaction: node hover labels, click to open, card ↔ node highlight, drag with inertia, keyboard tour
- [ ] 5.9 Low tier / Lite / reduced motion versions; phone layout

### D. Project page
- [ ] 5.10 Styled project page: title card, cover, body, links, prev/next, back to the right stop
- [ ] 5.11 Gallery viewer (keyboard, swipe, focus trap)

### E. Admin
- [ ] 5.12 GlobeField: map picker, lat/lng, auto option, city search; demo data gets a couple of placed projects

### F. Verify
- [ ] 5.13 Unit tests: geo maths, auto-placement, arcs, formation mapping, stop maths, city search
- [ ] 5.14 E2E: tour stops and cards, node hover/click, drag, keyboard tour, tiers, reduced motion, project page and gallery, admin picker
- [ ] 5.15 Performance and quality: frame time on high/mid, initial JS budget, 3D assets ≤ 3 MB, screenshots at 375 / 1440 in both themes

## 5. Acceptance criteria

### Stage
- [ ] AC-5.1 There is exactly one WebGL canvas on the home page, and the hero looks and behaves as in Part 4 (all Part 4 tests pass).
- [ ] AC-5.2 The stage stops drawing when nothing visible moves and when the tab is hidden.
- [ ] AC-5.3 Initial JS stays ≤ 200 KB gzip; the globe and its data load lazily; 3D assets on first load ≤ 3 MB.

### Globe
- [ ] AC-5.4 The globe shows recognisable continents, the home node at Bhubaneswar and one node per published project (featured ones larger).
- [ ] AC-5.5 Projects without a position get a stable spot that doesn't move between visits and never overlaps another node.
- [ ] AC-5.6 Packets travel along arcs between home and the project nodes; glow in dark, ink in light; the theme tween takes ≈ 600 ms.
- [ ] AC-5.7 Scrolling into The System forms the globe from the hero's particles; scrolling back reverses it.

### Chapter
- [ ] AC-5.8 The tour has one stop per featured project (max 6); at each stop the right node faces the camera and the right card is shown.
- [ ] AC-5.9 Hovering a node shows its label and highlights its card; clicking opens the project page; hovering a card lights its node.
- [ ] AC-5.10 Dragging turns the globe with inertia and the cursor shows `DRAG`; on touch the page scrolls normally.
- [ ] AC-5.11 Tabbing through the cards turns the globe to each node; every card is a working link.
- [ ] AC-5.12 Low tier, Lite mode and no WebGL: no canvas, the still globe image and the same cards; reduced motion: no pinning and no movement.
- [ ] AC-5.13 Frame rate ≥ 55 fps on high (desktop) and ≥ 30 fps on mid (phone) during the tour (master spec P-4).

### Project page
- [ ] AC-5.14 The project page shows the title card, cover, body, tech, links and gallery; prev/next follow `sort_order`; "Back to The System" returns to that project's stop.
- [ ] AC-5.15 The gallery viewer works with the mouse, keyboard (arrows, Esc) and swipe, traps focus and returns it on close.

### Admin
- [ ] AC-5.16 The project form can place a project by clicking the map, typing lat/lng or picking a city, or set it back to automatic; the globe shows the change.

### Quality
- [ ] AC-5.17 375 / 1440 px, both themes, three tiers: no horizontal scroll, no console errors; text over the globe meets WCAG AA.
- [ ] AC-5.18 Build, lint, unit, e2e and database tests all pass.

## 6. Risks

| Risk | Mitigation |
|---|---|
| A pinned scroll tour feels like scroll-jacking | Natural scroll speed (no snapping), a visible "Skip to all projects" link, no pinning on touch-only small screens if it feels heavy in testing, and none with reduced motion |
| Too many projects for the tour | The tour is featured projects only (max 6); everything else lives in the grid |
| The 3D slows phones | Mid tier: fewer dots and packets, no halo; the frame-time guard drops to the still image |
| Map data licences | Natural Earth and GeoNames are public domain; noted in the README |
| Refactoring Part 4 onto the stage breaks the hero | Part 4's e2e tests must stay green (AC-5.1) |

## 7. Open questions

| # | Question | Answer |
|---|---|---|
| Q1 | Globe style: a **dot-matrix Earth** with real continents, or an abstract wireframe or particle sphere with no map? | **Decided:** Dot-matrix Earth (default) |
| Q2 | Where should projects sit? Real places (where the client or the work is, e.g. US for the Harman/Samsung work), or spread out automatically unless you set one? | **Decided:** Automatic unless set in the admin (default) |
| Q3 | The tour: **pinned, one stop per featured project**, or no pinning (globe beside a scrolling list of cards)? | **Decided:** Pinned tour for featured projects (max 6), then the grid (default) |
| Q4 | Should the hero's particles **re-form into the globe**, or should the globe just fade in? | **Decided:** Re-form (the Part 4 hand-off) (default) |
| Q5 | Packet routes: always **home ↔ project**, or also project ↔ project (a mesh)? | **Decided:** Home ↔ project (default) |
| Q6 | Blender: the globe is generated in code (sharper, smaller, themable). Do you still want a Blender-made asset anywhere in Part 5? | **Decided:** No, all in code (default) |
| Q7 | Include the styled project page and gallery in this part? | **Decided:** Yes (default) |

## Changelog
- 0.1 (2026-10-15) — Initial draft.
- 0.2 (2026-10-15) — Approved by Ausaf with all defaults (Q1–Q7).
