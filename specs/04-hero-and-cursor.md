# Part 4 — Opening Scene (Hero) and Custom Cursor

**Status:** Draft — awaiting approval
**Version:** 0.1 · 2026-10-14
**Depends on:** Part 0 (tokens), Part 1 (`hero_media`, `site_settings`), Part 3 (shell, tiers, motion)
**Feeds:** Part 5 (the hero's particles hand over to the 3D globe)

---

## 1. Scope

Two things that set the tone of the whole site:

- **A. The Opening Scene**: the first 5 seconds (master spec G1). A short film intro (letterbox bars, title card with your name), your footage playing behind it, and, as you scroll, the footage breaking apart into glowing particles that drift down towards the next chapters (the bridge to Part 5's data globe).
- **B. The custom cursor**: a small "viewfinder" cursor that follows the mouse with a soft lag and changes shape over what it touches (links, buttons, project cards, video). Desktop only; never on touch screens.

### Out of scope
- The 3D globe itself and the camera journey through chapters → Part 5. Part 4's particles end as a cloud that Part 5 can take over.
- Sound. A muted-by-default sound toggle is a possible later addition (Q6).

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-4.1 | first-time visitor | the site to open like a film | it's memorable in the first seconds |
| US-4.2 | recruiter in a hurry | to read the name, role and Fast Lane straight away and skip the intro | the cinematic part never slows me down |
| US-4.3 | owner | to change the hero footage from the admin | the opening stays fresh |
| US-4.4 | visitor on a slow phone or network | a still image first, and no heavy video or 3D if my device can't take it | the page loads fast |
| US-4.5 | visitor sensitive to motion | no flashing, no camera moves, an easy way to pause video | it's comfortable |
| US-4.6 | desktop visitor | a cursor that feels crafted and reacts to what I point at | the site feels premium |
| US-4.7 | keyboard or touch user | none of the cursor effects to get in my way | the site works the same for me |

### 2.2 Opening Scene requirements

#### Intro sequence (first visit)

| ID | Requirement |
|---|---|
| OS-1 | The sequence, about **2.4 s** total: letterbox bars slide in from top and bottom (0–0.5 s) → a timecode `00:00:00:00` ticks in the corner → the title card writes your name in Garamond italic, letter by letter (0.5–1.6 s) → tagline fades up (1.6–2.0 s) → bars ease back to a thin cinematic frame (2.0–2.4 s). |
| OS-2 | The name, tagline, top bar and Fast Lane are **real text in the page from the first paint** (only revealed by animation), so they're readable, selectable and indexed even if JavaScript is slow. The Largest Contentful Paint is the name or the poster, never a blank screen (master spec P-1). |
| OS-3 | **Skip**: any scroll, click, key or the "Skip intro" button ends the sequence at once and jumps to its final frame. |
| OS-4 | The full intro plays **once per browser session**; later visits in the same session (or back-navigation) show the final frame immediately. |
| OS-5 | Reduced motion: no letter-by-letter, no sliding bars: everything fades in within 200 ms. Lite mode: final frame, no animation. |

#### Footage

| ID | Requirement |
|---|---|
| FG-1 | The **poster image** shows first (from `hero_media.poster`, sized for the screen), then the video fades in once it can play through. No published clip: a generated gradient "night sky" using theme tokens. |
| FG-2 | Clip choice follows `site_settings.hero_playback`: **single** (first published clip), **sequence** (each clip plays once, joined by a short film-cut: a 120 ms flash-to-black), **random** (one per visit). Clips marked dark-only or light-only follow the current theme; switching theme swaps the clip at the next cut. |
| FG-3 | Video is muted, inline, loops (single/random), and uses the **phone version** on narrow or mid-tier screens and **WebM** where supported. |
| FG-4 | Video only loads on **high and mid tiers**, never with Data Saver, never in Lite mode or with reduced motion (poster only). It doesn't start downloading until after the first paint. |
| FG-5 | Video pauses when the hero is off screen or the tab is hidden, and resumes when it's back. |
| FG-6 | A small **pause/play** button sits in the corner of the hero (WCAG 2.2.2), keyboard accessible, remembered for the session. |
| FG-7 | The image and video are darkened with a theme-aware gradient so the title always meets AA contrast over any footage. |

#### Footage → particles (scroll)

| ID | Requirement |
|---|---|
| PT-1 | As you scroll from the hero towards About, the current video frame is **sampled into a grid of particles** (one particle per few pixels, colour taken from the frame), which lift off, scatter and drift down while the video fades out, ending as a loose glowing cloud. The animation is **scrubbed by scroll** (scroll back and it re-forms). |
| PT-2 | Particle count by tier: **high ≈ 60 000**, **mid ≈ 15 000**, **low: none** (the poster simply fades). Rendered with Three.js points and a small custom shader; no bloom on mid. |
| PT-3 | **Dark theme**: additive glow, particles take the footage colours tinted towards the `accent` tokens. **Light theme**: no glow, smaller ink-like particles, tinted towards `accent-2-text`. Theme switches tween the material over 600 ms (master spec TH-4). |
| PT-4 | The particle cloud's final state (positions and colours) is exposed to Part 5 so the globe can form out of it. |
| PT-5 | Three.js and the shader load **after the first paint**, as their own chunk (not in the 200 KB initial budget). Until loaded, scrolling the hero just fades the footage. |
| PT-6 | If WebGL fails or a frame takes over 50 ms repeatedly, the scene stops and falls back to the fade. |

#### Hero layout

| ID | Requirement |
|---|---|
| HL-1 | Name in the hero size, tagline, location label, an "Available for work" badge when on, and a scroll cue, as now; the letterbox frame and timecode overlay sit above the footage. |
| HL-2 | Phones: the letterbox is thinner, the name wraps cleanly, and the floating Fast Lane never covers the tagline. |
| HL-3 | The hero is still one screen tall; the particle effect happens within the first ~120 % of scroll so About appears without delay. |

### 2.3 Custom cursor requirements

| ID | Requirement |
|---|---|
| CU-1 | **Only on devices with a precise pointer that can hover** (`(hover: hover) and (pointer: fine)`), never on touch, and turned off with reduced motion, in Lite mode and on the low tier. The system cursor returns automatically in every one of those cases. |
| CU-2 | **Look**: a small solid dot (6 px) that tracks the pointer exactly, plus a **viewfinder ring** (36 px, thin corner brackets like a camera frame) that follows with a soft spring lag. Uses `accent` in both themes; `mix-blend-mode: difference` keeps it visible over footage. |
| CU-3 | **States** (the ring morphs, 200–300 ms): **link/button** → ring tightens around the target and snaps its corners to it ("focus lock"); **project card** → ring grows and shows a label `VIEW` in the label style; **video/hero** → shows `PLAY`/`PAUSE`; **text field** → hides, system text cursor shows; **pressed** → ring shrinks briefly (shutter click); **leaving the window** → fades out. |
| CU-4 | **Magnetic buttons**: primary buttons (Fast Lane Contact, theme toggle, menu button) gently pull towards the cursor (max 6 px) and settle back. Off with reduced motion. |
| CU-5 | Any element can opt in with `data-cursor="view" | "play" | "drag" | "hide"` and an optional `data-cursor-label="…"` (so Parts 5–7 add states without touching the cursor code). |
| CU-6 | **Never gets in the way**: `pointer-events: none`; keyboard focus rings unchanged; the real cursor's hotspot is where the dot is; text selection works; works in the admin? **No**, the admin keeps the normal cursor (Q5). |
| CU-7 | **Performance**: one `requestAnimationFrame` loop that sleeps when the pointer is still; transforms only (no layout); no React re-renders per frame. Under 0.5 ms per frame. |
| CU-8 | Visitors can turn it off: Lite mode turns it off (no separate switch). |

## 3. Design

### 3.1 Files

```
src/
├─ chapters/hero/
│  ├─ HeroChapter.tsx        layout, real text, controls (replaces HeroPlaceholder)
│  ├─ IntroSequence.ts       timeline (GSAP when loaded; CSS fallback); skip + once-per-session
│  ├─ useHeroMedia.ts        picks clip(s) by playback mode, theme, tier, screen
│  ├─ HeroVideo.tsx          poster → video, sequence cuts, pause/resume, visibility
│  ├─ Letterbox.tsx, Timecode.tsx
│  └─ hero.module.css
├─ scene/hero/               (lazy chunk)
│  ├─ ParticleField.ts       Three.js points; samples the video into positions/colours
│  ├─ particles.vert/.frag   GLSL: scatter driven by a 0–1 progress uniform
│  └─ handoff.ts             exposes the final cloud to Part 5
└─ cursor/
   ├─ CursorProvider.tsx     enabled? (pointer, motion, tier, lite); mounts the cursor
   ├─ Cursor.tsx             dot + viewfinder ring (DOM + CSS transforms)
   ├─ cursorEngine.ts        rAF loop, spring, target detection via data-cursor / role
   ├─ magnetic.ts            useMagnetic(ref) hook
   └─ cursor.module.css
```

### 3.2 Intro timing (tokens)

| Step | Start | Duration | Easing |
|---|---|---|---|
| Letterbox in | 0 ms | 500 ms | `ease-cinema` |
| Name, per letter | 500 ms | ~60 ms each (max 1100 ms total) | `ease-out` |
| Tagline | 1600 ms | 400 ms | `ease-out` |
| Letterbox settle | 2000 ms | 400 ms | `ease-in-out` |

### 3.3 Particles: how the footage turns into particles

1. When the visitor first scrolls past 5 % of the hero, the current video frame (or the poster) is drawn into a small offscreen canvas, e.g. 320 × 180 on high.
2. Each sampled pixel becomes a particle: start position = its place on screen, colour = the pixel colour; dark pixels are skipped so the cloud has shape.
3. Each particle gets a random drift direction and speed (seeded, so it looks the same every time).
4. A `progress` uniform (0 → 1, scrubbed by ScrollTrigger over the hero) moves particles from "picture" to "cloud" in the vertex shader; the video's opacity goes from 1 → 0 over the first 30 % of that.
5. Hosted footage must allow cross-origin reading (Supabase Storage does); if a video can't be read (an external host without CORS), the **poster** is sampled instead, which always works.

### 3.4 Cursor engine

- Pointer position is read on `pointermove` (passive), written to the dot immediately; the ring follows with a critically damped spring (stiffness ≈ 0.18 per frame at 60 fps, adjusted for frame time).
- Target detection on `pointerover`: nearest ancestor with `data-cursor`, else `a, button, [role=button]` → link state; `input, textarea, [contenteditable]` → hide; `video` → play.
- Link "focus lock": ring animates to the target's bounding box (plus 6 px) while hovered, then releases.
- Labels are real text in a hidden-from-screen-readers element (`aria-hidden`).

### 3.5 New dependencies

`three` (lazy chunk, also needed by Part 5). Nothing else: GSAP and Lenis are already in place.

## 4. Tasks

### A. Opening Scene
- [ ] 4.1 `HeroChapter` with real text from settings; letterbox, timecode, pause button, scroll cue; replace the placeholder
- [ ] 4.2 Intro sequence (GSAP + CSS fallback), skip, once per session, reduced motion and Lite behaviour
- [ ] 4.3 `useHeroMedia`: playback modes, theme filter, tier/screen/Data Saver rules; demo data gets 2–3 sample clips (generated, small)
- [ ] 4.4 `HeroVideo`: poster first, video fade-in, WebM/phone sources, sequence film-cuts, pause off-screen and when hidden
- [ ] 4.5 Particle field (Three.js, lazy): frame sampling, shaders, scroll scrub, tier counts, theme tween, WebGL failure fallback, hand-off
- [ ] 4.6 Contrast overlay and layout on phones

### B. Cursor
- [ ] 4.7 Cursor provider + enable rules; dot and viewfinder ring; spring loop
- [ ] 4.8 States (link lock, view, play/pause, hide, press, leave) and `data-cursor` API; mark project cards, hero video, Fast Lane, menu
- [ ] 4.9 Magnetic buttons hook on primary controls

### C. Verify
- [ ] 4.10 Unit tests (clip selection, intro-once logic, cursor enable rules, spring maths)
- [ ] 4.11 E2E: intro plays/skips/once; poster → video; pause button; tiers and reduced motion; particles render and scrub (pixel check on a screenshot); cursor states with a mouse, absent on touch
- [ ] 4.12 Performance: Lighthouse-style LCP and initial JS check; frame time with particles on high; screenshots in both themes at 375 / 1440

## 5. Acceptance criteria

### Opening Scene
- [ ] AC-4.1 First visit plays the intro in ≈ 2.4 s; a second load in the same session shows the final frame at once.
- [ ] AC-4.2 Scrolling, clicking, pressing a key or "Skip intro" ends the intro immediately.
- [ ] AC-4.3 The name and tagline are in the HTML and readable with JavaScript blocked after the first bundle (they render, just without animation).
- [ ] AC-4.4 Poster appears first; the video fades in only on high/mid tier, without Data Saver, reduced motion or Lite mode.
- [ ] AC-4.5 `single`, `sequence` and `random` playback each behave as specified; dark-only/light-only clips follow the theme.
- [ ] AC-4.6 The pause button stops and resumes the video and is reachable by keyboard; video also pauses off screen.
- [ ] AC-4.7 With no published clip, the gradient background shows and nothing errors.
- [ ] AC-4.8 Scrolling the hero turns the picture into particles; scrolling back re-forms it (screenshot comparison at progress 0, 0.5, 1).
- [ ] AC-4.9 Particle counts match the tier; low tier and reduced motion show no WebGL canvas at all.
- [ ] AC-4.10 Theme switch tweens the particles' look in 600 ms (glow in dark, ink in light).
- [ ] AC-4.11 Title text meets WCAG AA over the darkest and lightest sample footage in both themes.
- [ ] AC-4.12 Initial JS stays ≤ 200 KB gzip (Three.js is a separate lazy chunk); LCP element is the name or poster.

### Cursor
- [ ] AC-4.13 With a mouse: dot and ring appear; the system cursor is hidden only over the page (not the admin).
- [ ] AC-4.14 On touch, with reduced motion, in Lite mode or on the low tier: no custom cursor, system cursor shown.
- [ ] AC-4.15 Hovering a link locks the ring to it; a project card shows `VIEW`; the hero video shows `PLAY`/`PAUSE`; a text field hides the custom cursor.
- [ ] AC-4.16 Primary buttons move towards the cursor by at most 6 px and settle back.
- [ ] AC-4.17 Clicking, text selection and keyboard focus behave exactly as without the cursor.
- [ ] AC-4.18 The cursor loop stops when the pointer is still (no work per frame when idle).

### Quality
- [ ] AC-4.19 All pages at 375 / 1440 px, both themes, three tiers: no horizontal scroll, no console errors.
- [ ] AC-4.20 Build, lint, unit, e2e and database tests all pass.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Heavy video hurts load time | Poster first, video after first paint, phone versions, 4 MB guidance in the admin, tiers and Data Saver respected |
| External video hosts block frame reading (CORS) | Sample the poster instead (always works) |
| Particles too slow on some laptops | Tier counts, frame-time guard (PT-6), Lite mode |
| Custom cursor feels gimmicky or laggy | Subtle defaults, exact-tracking dot, spring tuned for responsiveness, easy to disable via Lite mode |
| Intro annoys repeat visitors | Once per session, skippable instantly, real text visible from the start |

## 7. Open questions

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Intro length: about 2.4 s, or shorter (≈ 1.5 s)? | 2.4 s |
| Q2 | Particles drift **down** towards the next chapter, or **outwards** like an explosion? | Drift down (feels like data falling into the system) |
| Q3 | Cursor style: **viewfinder** (camera-frame brackets), or a simple **dot + circle**? | Viewfinder |
| Q4 | Magnetic buttons on the primary controls? | Yes, subtle (max 6 px) |
| Q5 | Custom cursor in the admin too? | No, the admin keeps the normal cursor |
| Q6 | Sound in the intro (a soft projector whir, off by default with a toggle)? | No sound for now |
| Q7 | Do you have clips ready? If not, the demo gets generated sample clips and the live site shows the gradient until you upload. | Generated samples in demo |

## Changelog
- 0.1 (2026-10-14) — Initial draft. Cursor added at Ausaf's request.
