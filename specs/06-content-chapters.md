# Part 6 — Content Chapters: About, Credits Roll, Timeline, Reviews, Custom Sections

**Status:** Draft — awaiting approval
**Version:** 0.1 · 2026-10-17
**Depends on:** Part 1 (content tables), Part 2 (admin, custom-section builder), Part 3 (shell, chapters, tiers), Part 4 (cursor), Part 5 (project cards, gallery viewer)
**Feeds:** Part 7 (contact chapter sits at the end of this sequence), Part 8 (performance and SEO pass)

---

## 1. Scope

The chapters between the globe and the contact form still show their plain Part 3 versions ("Placeholder · the cinematic version arrives in Part 6"). This part gives each one its own scene in the "Director's Cut × Data in Transit" style, all driven by what you enter in the admin:

| # | Chapter | Idea |
|---|---|---|
| 1 | **About** ("The Director") | Your portrait in a film frame, your short bio revealed line by line, the long bio below, and a row of live **readouts** worked out from your data (years of experience, projects shipped, certifications…) |
| 3 | **Credits Roll** (achievements) | End-credits typography: highlighted titles first, "starring" size; then awards, certifications and recognitions as credit lines (title … issuer · year) that roll in as you scroll |
| 4 | **Timeline** (experience & skills) | A video-editor timeline: a year ruler with each role as a **clip** on a track, a playhead that follows your scroll, and the full role details below; skills as **tracks** with level meters |
| 5 | **Reviews** (testimonials) | One big quote at a time, like a title card, with prev/next and the person's name, role, rating and project |
| 5+ | **Custom sections** | Each of the five layouts you can pick in the admin (grid, list, timeline, carousel, gallery) gets a finished design, on the home page and on its own page `/s/<slug>` |

Plus one thing shared by all chapters: a **title-card reveal** for each chapter heading as it scrolls in (letterbox bars close in, the chapter number and title appear).

### Out of scope
- Contact form and inbox → Part 7. SEO, share images, final performance pass and deploy → Part 8.
- No new 3D in these chapters (Q6): the shared stage stays with the hero and the globe, so the rest of the page stays light.
- No database changes. Everything shown here already exists in the admin.

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-6.1 | recruiter | to see experience, skills and achievements quickly and clearly | I can shortlist in a minute |
| US-6.2 | client | to see who's behind the work and what others say | I trust the person |
| US-6.3 | owner | every chapter to look finished with whatever I've entered, including sections I add later | I never have to touch code |
| US-6.4 | keyboard or screen-reader user | all of it as normal headings, lists and links | nothing is hidden behind animation |
| US-6.5 | visitor on a phone or in Lite mode | the same content, lighter | it's fast |

### 2.2 Shared: chapter title cards and reveals

| ID | Requirement |
|---|---|
| CH-1 | Each chapter heading (number · subtitle, then title) gets a **title-card reveal** when it first scrolls into view: two thin letterbox bars close in, the label types in, the title rises. ≈ 700 ms, once per page view. |
| CH-2 | Content blocks **reveal as they enter** (fade and rise, staggered for lists). Driven by IntersectionObserver and CSS; no scroll hijacking and no pinning in Part 6. |
| CH-3 | Reduced motion: no movement, fades ≤ 200 ms. Lite mode: no reveals at all (content is simply there). |
| CH-4 | Text is never hidden from the start in the HTML: if JavaScript or the observer fails, everything is visible (reveals only apply once the page has started them). |
| CH-5 | The Part 3 "Placeholder" notes are removed. |

### 2.3 About — "The Director"

| ID | Requirement |
|---|---|
| AB-1 | **Portrait** in a film frame (thin letterbox bars, a small frame label like `ROLL 01 · FRAME 01`), with a gentle parallax inside the frame on high/mid tiers. No portrait: the frame shows your initials in Garamond. |
| AB-2 | **Short bio** (`bio_short`) in large Garamond, revealed line by line. **Long bio** (`bio_long`, Markdown) below in the reading column. |
| AB-3 | **Readouts** row, worked out from your published data and only shown when there's something to count: years of experience (from the earliest role's start date), roles, projects shipped, certifications, awards. Numbers count up when they scroll in (once), in the label style with timecode-like digits. |
| AB-4 | **Facts**: based in (location), "Available for work" badge when on, social links (GitHub, LinkedIn, YouTube, Instagram, X) and a **Download résumé** button when a résumé is uploaded. |
| AB-5 | Empty bio and no portrait: the chapter still looks intentional (readouts and facts only); no empty boxes. |

### 2.4 Credits Roll — achievements

| ID | Requirement |
|---|---|
| CR-1 | **Highlighted** achievements first, as "starring" cards: badge or image (if any), title in large Garamond, issuer and year, short description, link. |
| CR-2 | The rest as **credit lines** grouped by kind (Awards, Certifications, Titles, Recognition, Publications, Other) in end-credits typography: kind as a small centred heading, then lines of *title* … *issuer · year*, centred on wide screens and stacked on phones. Linked ones open in a new tab. |
| CR-3 | Lines **roll in** from below as they enter (staggered), like credits starting to move; no autoplaying scroll. |
| CR-4 | Kinds with nothing published are left out; a chapter with nothing published shows "Credits are being added." (the chapter can also be hidden in the admin). |

### 2.5 Timeline — experience and skills

| ID | Requirement |
|---|---|
| TL-1 | **Edit timeline** (desktop and tablet ≥ 800 px): a year ruler from the earliest start date to today; each role is a **clip** on a track, as long as the time it covers, labelled with company and role, coloured by employment type. Overlapping roles go on extra tracks automatically. Clicking a clip scrolls to that role's details. |
| TL-2 | A **playhead** (thin accent line with a timecode label showing the year and month) moves along the ruler as you scroll through the role details, and the clip under it lights up. Reduced motion: no moving playhead; the current clip still lights up. |
| TL-3 | **Role details** below, newest first: role, company, type, location, dates (`MMM YYYY – Present`) and a duration readout (`2y 4m`), description, highlights as a list, tech tags, logo if uploaded. |
| TL-4 | **Skills as tracks**: one track per category (Backend, Cloud, Frontend…), each skill a chip with a **level meter** (5 bars, like an audio meter) when a level is set. Featured skills come first in their track. |
| TL-5 | Phones: no ruler; a vertical timeline with a thin playhead line that fills as you scroll, then the skills tracks. |
| TL-6 | Dates are formatted for the visitor's locale; "Present" for an open role, and the duration counts to today. |

### 2.6 Reviews — testimonials

| ID | Requirement |
|---|---|
| RV-1 | **One quote at a time** as a title card: the quote in large Garamond with opening and closing marks, then name, role · company, rating (stars with a text equivalent), avatar if uploaded, links to the source and to the related project if set. |
| RV-2 | **Prev / Next** buttons and a row of small position markers (`01 / 04`); arrow keys work when the controls have focus; swipe on phones. **No autoplay** (Q4). Changing quote is a quick cross-dissolve; reduced motion: instant. |
| RV-3 | With one or two testimonials: shown as a plain stack, no controls. |
| RV-4 | All quotes stay in the HTML (the hidden ones are not removed), so screen readers and search engines get every one; the visible one is announced politely when it changes. |

### 2.7 Custom sections

| ID | Requirement |
|---|---|
| CS-1 | Every section renders with the layout chosen in the admin, on the home page and on `/s/<slug>`: **grid** (cards with image, title, subtitle, date, link), **list** (credit-line style rows), **timeline** (the TL-5 vertical timeline, ordered by the first date field), **carousel** (the RV-1 one-at-a-time card), **gallery** (image grid opening the Part 5 gallery viewer). |
| CS-2 | Items are rendered from your field definitions: the first text field is the title, a second text field the subtitle, the first image the picture, the first date the date, URL fields as links, Markdown fields as text, select and number fields as tags. Empty fields are skipped. |
| CS-3 | On the home page a section shows up to 6 items with "See all of {name}" when it has its own page; the page shows everything with the section intro as a title card. |
| CS-4 | A section with no published items shows its intro and "Nothing here yet." on the page, and is left out of the home page (and the chapter menu) until it has items. |

### 2.8 Tiers and accessibility

| ID | Requirement |
|---|---|
| TA-1 | Everything is DOM and CSS; nothing in Part 6 needs WebGL. Low tier and Lite mode get the same content without parallax or count-ups. |
| TA-2 | Headings follow the page outline (chapter h2, then h3 for groups); lists are real lists; the timeline ruler is decorative (`aria-hidden`) because the role list carries the same information. |
| TA-3 | Contrast AA in both themes; focus rings on every control; the cursor states from Part 4 apply (cards `VIEW`, gallery images `VIEW`, quote area `DRAG` on touch-swipe only). |

## 3. Design

### 3.1 Files

```
src/chapters/
├─ shared/
│  ├─ Reveal.tsx            useReveal() + <Reveal> (IntersectionObserver, CSS classes, once)
│  ├─ TitleCard.css         chapter title-card reveal (used by shell/Chapter.tsx)
│  ├─ readouts.ts           numbers worked out from the data (pure, unit-tested)
│  └─ dates.ts              formatting and durations (pure, unit-tested)
├─ about/AboutChapter.tsx, about.module.css
├─ credits/CreditsChapter.tsx, credits.module.css
├─ timeline/TimelineChapter.tsx, EditTimeline.tsx, SkillTracks.tsx, layout.ts (track packing), timeline.module.css
├─ reviews/ReviewsChapter.tsx, QuoteCarousel.tsx (also used by custom carousels), reviews.module.css
└─ custom/CustomSection.tsx, itemView.ts (field → role mapping), layouts/*.tsx, custom.module.css
```
`placeholders.tsx` is deleted; `SectionPage.tsx` uses `custom/`.

### 3.2 Track packing (TL-1)
Roles sorted by start date are put on the first track where they don't overlap the previous clip (greedy interval packing); open roles end today. Pure function, unit-tested.

### 3.3 Readouts (AB-3)
- Years of experience: from the earliest published role's start date to today, rounded down, shown as `3+` (the `+` when it's not a round number of years).
- Roles: published experience entries. Projects shipped: published projects. Certifications / awards: published achievements of those kinds.
- A readout with value 0 is not shown.

### 3.4 New dependencies
None.

## 4. Tasks

### A. Shared
- [ ] 6.1 Reveal hook and title-card reveal in `Chapter`; remove placeholders
- [ ] 6.2 `dates.ts` and `readouts.ts` (+ unit tests)

### B. Chapters
- [ ] 6.3 About: portrait frame, bio reveal, readouts with count-up, facts and résumé
- [ ] 6.4 Credits Roll: starring cards, grouped credit lines, roll-in
- [ ] 6.5 Timeline: edit timeline (ruler, clips, tracks, playhead), role details, skills tracks with meters, phone version
- [ ] 6.6 Reviews: quote carousel (keyboard, swipe, live region), stack for 1–2
- [ ] 6.7 Custom sections: item view mapping and the five layouts, home preview and `/s/<slug>` page

### C. Demo data
- [ ] 6.8 Richer demo content (a few more roles, achievements of each kind, 4 testimonials, a gallery section) so every design can be seen in `dev:demo`

### D. Verify
- [ ] 6.9 Unit tests: dates, durations, readouts, track packing, item view mapping
- [ ] 6.10 E2E: each chapter renders its data, reveals, carousel keys/swipe, timeline clip click and playhead, custom layouts, reduced motion and Lite, phone layouts; screenshots in both themes at 375 / 1440

## 5. Acceptance criteria

### Shared
- [ ] AC-6.1 Every chapter heading plays its title-card reveal once when it scrolls in; with reduced motion only a short fade; in Lite mode nothing.
- [ ] AC-6.2 With JavaScript reveals disabled (observer unavailable) all content is visible.
- [ ] AC-6.3 No "Placeholder" text remains anywhere on the public site.

### About
- [ ] AC-6.4 Portrait (or initials), short and long bio, location, availability, socials and résumé button all show from the admin data; nothing empty shows.
- [ ] AC-6.5 Readouts match the published data (years from the earliest role, counts of roles, projects, certifications, awards) and zero values are hidden.

### Credits Roll
- [ ] AC-6.6 Highlighted achievements appear first as starring cards; the rest appear grouped by kind as credit lines with issuer and year; empty kinds are absent.

### Timeline
- [ ] AC-6.7 The ruler spans the earliest start to today; each role is a clip of the right length on a non-overlapping track; clicking a clip scrolls to its details.
- [ ] AC-6.8 The playhead follows the scroll through the role details and lights the matching clip; phones show the vertical version.
- [ ] AC-6.9 Dates, "Present" and durations are correct; skills are grouped by category with meters matching their levels.

### Reviews
- [ ] AC-6.10 One quote at a time with prev/next, position markers, arrow keys and swipe; no autoplay; all quotes are in the HTML; 1–2 testimonials show as a stack.

### Custom sections
- [ ] AC-6.11 Each of the five layouts renders a section built in the admin, on the home page (max 6 items + "See all") and on its own page; empty sections are left off the home page and menu.

### Quality
- [ ] AC-6.12 375 / 1440 px, both themes, three tiers: no horizontal scroll, no console errors, AA contrast; initial JS stays within budget.
- [ ] AC-6.13 Build, lint, unit, e2e and database tests all pass.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Too much motion on a long page | Reveals are short and happen once; no pinning in Part 6; Lite and reduced motion respected |
| Sparse content looks empty | Every chapter has an intentional state for little or no data (AB-5, CR-4, RV-3, CS-4) |
| Custom fields vary a lot | A clear field → role mapping (CS-2) with sensible fallbacks; tested with every field type |
| Timeline with a single short role looks odd | Ruler always spans at least 2 years; a single role shows as one clip with its duration |

## 7. Open questions

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Credits Roll: credit lines that **roll in as you scroll** (no pinning), or a **pinned rolling credits** sequence where the list scrolls up like a film ending? | Roll in as you scroll, no pinning |
| Q2 | Timeline: the **video-editor timeline** (year ruler, role clips, playhead) on desktop, or a simpler vertical timeline everywhere? | Video-editor timeline on desktop, vertical on phones |
| Q3 | About: show **readouts** worked out from your data (years of experience, projects, certifications…)? | Yes |
| Q4 | Reviews: one quote at a time **without autoplay**, or should it advance by itself every few seconds (with a pause button)? | No autoplay |
| Q5 | Skills: show **level meters** (1–5), or just names? | Meters where a level is set |
| Q6 | Any 3D in these chapters, or keep 3D to the hero and the globe? | Keep 3D to the hero and the globe |
| Q7 | About portrait label: `ROLL 01 · FRAME 01`, or something else (e.g. your camera, a place)? | `ROLL 01 · FRAME 01` |

## Changelog
- 0.1 (2026-10-17) — Initial draft.
