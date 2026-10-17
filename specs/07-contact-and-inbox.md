# Part 7 — Final Scene: Contact Form and Admin Inbox

**Status:** Built
**Version:** 0.3 · 2026-10-17
**Depends on:** Part 1 (`messages` table, its security rules), Part 2 (admin shell, dashboard count), Part 3 (shell, Fast Lane "Contact"), Part 6 (reveals, chapter styling)
**Feeds:** Part 8 (deploy, final audit)

---

## 1. Scope

The last chapter of the film, and the reason the site exists: getting in touch.

- **A. Final Scene chapter**: a contact form styled as a film slate, plus your direct email, socials and availability. It replaces the Part 3 placeholder.
- **B. Spam and abuse protection** (master spec SEC-3): checks in the browser and, more importantly, in the database, so a bot calling the API directly is still stopped.
- **C. Admin inbox**: read, filter, search, reply (through your email app), archive and delete messages. An unread count in the admin menu and on the dashboard.
- **D. Optional email alert** to you for each new message (see Q1).

### Out of scope
- Sending replies from inside the admin, automatic replies to the visitor, attachments, exporting messages.
- Deploying the site → Part 8.

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-7.1 | recruiter or client | a short form that says what I need (a role, a project, a collaboration) | I can reach you in a minute |
| US-7.2 | visitor | my email to be visible too | I can use my own mail app instead |
| US-7.3 | visitor | clear errors, and my text kept if something fails | I never have to type it twice |
| US-7.4 | owner | to see every message in one inbox, newest first, with what it's about | I answer the important ones fast |
| US-7.5 | owner | to know when a new message arrives | I don't have to keep checking (Q1) |
| US-7.6 | owner | bots and floods kept out | the inbox stays useful |

### 2.2 Final Scene chapter (CT)

| ID | Requirement |
|---|---|
| CT-1 | Chapter "Final Scene · Contact" with a lead line ("Have a role, a project or a shoot in mind?") and the form beside your direct details on desktop; stacked on phones (form first). |
| CT-2 | **What's this about?** as four choice chips (one required, "Just saying hi" pre-selected): **Hiring** (`hire`), **Freelance project** (`freelance`), **Collaboration** (`collab`), **Just saying hi** (`general`). Q3. |
| CT-3 | Fields: **Name** (required, ≤ 80), **Email** (required, valid, ≤ 254), **Subject** (optional, ≤ 150), **Message** (required, 10–5000, with a character counter near the limit), **Budget** (only shown for Freelance; optional free text ≤ 60, e.g. "₹50k–1L"). Q4. |
| CT-4 | The form is a **film slate**: a header strip reading `SCENE 09 · TAKE 01 · <today's date>` with a clapper bar; the take number goes up with each failed attempt. On a successful send the clapper snaps shut. Q6. |
| CT-5 | Validation uses the same rules as the database (the Part 1 Zod schema). Errors show under each field after you leave it or press Send; on Send, focus moves to the first field with an error. |
| CT-6 | **Success**: the form is replaced by "That's a wrap." with a thank-you naming the visitor and their email, and a reply-time line (Q5). "Send another" brings back an empty form. Announced to screen readers. |
| CT-7 | **Failure**: the typed text stays; a message explains what happened (offline, too many messages, server error) and offers your email as a pre-filled `mailto:` link with their message in it. |
| CT-8 | The draft is kept for this browser tab (session storage) so a reload doesn't lose it; cleared after sending. |
| CT-9 | Direct details beside the form: your public email (copy button and `mailto:`), availability badge, location, socials, and the résumé link if uploaded. Anything not set is left out. |
| CT-10 | Phones: one column; inputs at least 16 px text (no iOS zoom), correct keyboards (`type=email`), autofill names (`name`, `email`), Send button full width and reachable above the Fast Lane dock. |
| CT-11 | Fast Lane "Contact" and the chapter menu land on the chapter and focus its heading (unchanged from Part 3); `/#contact` links work from other pages. |

### 2.3 Spam and abuse (SP) — master spec SEC-3

| ID | Requirement |
|---|---|
| SP-1 | **Honeypot**: a hidden "Website" field that people never see or tab to. If it's filled, the browser shows success but sends nothing. |
| SP-2 | **Time trap**: a send less than 3 seconds after the form appeared is treated like the honeypot (shown as sent, not stored). |
| SP-3 | **Database rate limit** (new migration `0009_contact.sql`, a check that runs before every new message is stored): per visitor, at most **3 messages per 10 minutes and 10 per day**; per sender email, at most **5 per day**; for the whole site, at most **100 per day**. Over a limit the message is refused with a clear reason. Q7. |
| SP-4 | The visitor is recognised by their IP address from the request headers Supabase passes to the database, **stored only as a one-way hash** (with a secret salt the public can't read) and deleted after 2 days. No raw IPs are kept anywhere. |
| SP-5 | **Content rules** in the same check: body trimmed and at least 10 characters after trimming; at most 5 links in the body; email stored lower-case. |
| SP-6 | Visitors still can't read, change or delete messages (Part 1 rules stay); the new check can't be bypassed by calling the API directly. |
| SP-7 | Optional **Cloudflare Turnstile** bot check (Q2). Not built unless chosen. |

### 2.4 Admin inbox (IB)

| ID | Requirement |
|---|---|
| IB-1 | **Inbox** in the admin menu, with the number of new messages as a badge. The dashboard's "New messages" card links to it (Part 2 AD-62). The count refreshes when you come back to the tab and every minute while the admin is open. |
| IB-2 | List, newest first: name, kind badge, subject (or the start of the message), time ("2 h ago", full date on hover). New messages are bold with a dot. 50 at a time with "Load more". |
| IB-3 | Status tabs with counts: **New · Read · Replied · Archived · All** (All leaves out archived ones). Kind filter chips. Search across name, email, subject and message. |
| IB-4 | Opening a message shows it in full (line breaks kept, shown as plain text; links in it are not clickable, to keep the admin safe), with email, kind, budget and date. A **new** message becomes **read** when opened. |
| IB-5 | Actions: **Reply** (opens your mail app with `Re: <subject>` and their message quoted, and marks it Replied), **Copy email**, **Mark as unread**, **Archive / Move to inbox**, **Delete** (asks first; can't be undone). |
| IB-6 | Desktop: list and message side by side. Phones: list, then the message on its own screen with a back button. |
| IB-7 | Next/previous message buttons in the message view, and keyboard shortcuts `j` / `k` (next / previous) and `e` (archive), listed in a small hint. |
| IB-8 | Works in demo mode with sample messages of every kind and status. |

### 2.5 Email alert (NT) — only if Q1 is "Yes"

| ID | Requirement |
|---|---|
| NT-1 | Each stored message triggers an email to your address: "New message: <kind> from <name>" with the message, budget and a link to it in the admin. **Reply-To** is the visitor, so replying from your mail app goes to them. |
| NT-2 | Sent by a small Supabase Edge Function called by a database webhook, through **Resend** (free tier: 100 emails a day). The API key is a Supabase secret, never in the site's code. |
| NT-3 | If the alert fails or isn't set up, the message is still stored and shows in the inbox; nothing on the site changes. |
| NT-4 | Setup steps (Resend account, secret, webhook) are added to `supabase/README.md`. |

## 3. Design

### 3.1 How a message travels

```
Visitor's browser                               Supabase
───────────────────                             ───────────────────────────────────────────
Form → Zod check → honeypot / time trap ──┐
                                          └──► insert into messages (anon key)
                                                 │  before-insert check (0009):
                                                 │   hash IP → count recent → refuse or allow
                                                 │   trim, lower-case, link limit
                                                 ▼
                                               messages row (status = new)
                                                 │  database webhook (Q1)
                                                 ▼
                                               Edge Function "notify-message" → Resend → your inbox
Admin (signed in, MFA) ◄── select / update status / delete (owner only, Part 1 rules)
```

- The public site sends with the anon key, asking for nothing back (visitors aren't allowed to read messages).
- Refusals from the database carry a short code (`rate_limited`, `too_many_links`, …) that the form turns into a friendly message (CT-7).
- Demo mode: the in-memory backend applies the same limits, so the e2e tests can check them.

### 3.2 Database changes (`0009_contact.sql`)

- `private.contact_salt` (one row, a random secret made when the migration runs) and `private.contact_throttle (ip_hash, email, created_at)`. The `private` schema is not exposed to the API.
- A `before insert` trigger on `public.messages` that runs as a trusted function and counts recent rows for the limits in SP-3. It also deletes throttle rows older than 2 days.
- The function reads the visitor IP from `request.headers` (`x-forwarded-for`, first address). If no IP can be read (for example in local tests), only the email and site-wide limits apply.
- Database tests: limits, refusal codes, link limit, no raw IP stored, anonymous visitors still can't read the throttle table or messages.
- You run the new file once in the Supabase SQL Editor, like the earlier ones; the setup guide says so.

### 3.3 Files

```
src/chapters/contact/
  ContactChapter.tsx      chapter layout: form + direct details
  ContactForm.tsx         slate form, validation, states (editing, sending, sent, failed)
  Slate.tsx               the clapper header and its snap
  useContactDraft.ts      session-storage draft
  sendMessage.ts          honeypot, time trap, error-code mapping
  contact.module.css
src/data/source.ts        + sendMessage() for Supabase and demo
src/admin/inbox/
  InboxPage.tsx           list + filters + search (+ side-by-side message on desktop)
  MessageView.tsx         full message and actions
  inbox.module.css
src/admin/data/hooks.ts   + useMessages(), useUpdateMessageStatus(), useDeleteMessage()
supabase/migrations/0009_contact.sql
supabase/functions/notify-message/index.ts   (Q1)
supabase/tests/contact.test.sql
```

### 3.4 Look

- The slate uses the existing tokens: dark board, chalk-white text, the accent on the clapper stripes. In the light theme it becomes a white board with ink text.
- Snap: the clapper bar rotates down over ≈ 200 ms with a small bounce; reduced motion and Lite mode skip it (Q6).
- The inbox follows the Part 2 admin style (tables, chips, toasts).

## 4. Tasks

### A. Database
- [x] 7.1 `0009_contact.sql`: salt, throttle table, before-insert check, refusal codes; database tests
- [x] 7.2 Setup guide update (run 0009; email alert steps if Q1)

### B. Public site
- [x] 7.3 `sendMessage` for Supabase and demo (demo applies the same limits)
- [x] 7.4 Final Scene chapter: slate form, chips, conditional budget, validation, draft, states, direct details
- [x] 7.5 Remove the contact placeholder

### C. Admin
- [x] 7.6 Inbox list: tabs with counts, kind chips, search, load more, unread badge in the menu, dashboard link
- [x] 7.7 Message view: full message, actions, mark-as-read on open, next/previous, shortcuts, phone layout
- [x] 7.8 Demo messages of every kind and status

### D. Email alert (only if Q1 is "Yes")
- [x] 7.9 Edge Function `notify-message` (Resend), webhook setup notes

### E. Verify
- [x] 7.10 Unit tests: error-code mapping, time trap, draft, inbox filtering and search
- [x] 7.11 E2E: send flow, errors, limits, honeypot, phones; inbox actions, filters, shortcuts; screenshots in both themes at 375 / 1440

## 5. Acceptance criteria

### Final Scene
- [x] AC-7.1 A valid message sends and shows "That's a wrap." with the visitor's name and email; it appears in the admin inbox as New with the right kind, subject, body and budget. ✅ *e2e `contact.spec.ts`*
- [x] AC-7.2 Each field shows its error (empty, too long, bad email, message under 10 characters); Send focuses the first error; nothing is sent until it's valid. ✅ *e2e + unit (validation)*
- [x] AC-7.3 Budget only appears for Freelance; switching away hides it and it isn't sent. ✅ *e2e + unit*
- [x] AC-7.4 A failed send keeps the text, explains why, and offers a pre-filled `mailto:`; a reload before sending keeps the draft. ✅ *e2e (offline, server and rate-limit failures; draft after reload)*
- [x] AC-7.5 Your email, availability, location, socials and résumé show beside the form when set, and are left out when not. ✅ *e2e*
- [x] AC-7.6 At 375 px the form is one column, nothing is hidden behind the Fast Lane dock, and fields use 16 px text with the right keyboards. ✅ *e2e at 375 px: the dock slides away while a field has focus*

### Spam and abuse
- [x] AC-7.7 A filled honeypot, or a send within 3 seconds, shows success but stores nothing. ✅ *e2e + unit*
- [x] AC-7.8 The 4th message from one visitor within 10 minutes is refused with a friendly message (and the per-email and site-wide limits work, checked in the database tests). ✅ *e2e (demo) + 19 database checks*
- [x] AC-7.9 A body with more than 5 links is refused; emails are stored lower-case; no raw IP address is stored anywhere. ✅ *e2e + database checks*
- [x] AC-7.10 Calling the API directly can't skip the limits, and visitors still can't read, change or delete messages or the throttle data. ✅ *database checks as anonymous visitor and signed-in stranger; `db:verify` confirms 0009 on the live project*

### Inbox
- [x] AC-7.11 The menu badge and the dashboard show the number of new messages; opening one marks it read and the count drops. ✅ *e2e*
- [x] AC-7.12 Tabs, kind chips and search filter the list correctly; "Load more" shows older messages. ✅ *e2e + unit*
- [x] AC-7.13 Reply opens a `mailto:` with "Re: <subject>" and the quoted message and marks it Replied; Copy email, Mark as unread, Archive / Move to inbox and Delete (after confirming) all work. ✅ *e2e + unit (reply link)*
- [x] AC-7.14 Message text is shown as plain text (no HTML, links not clickable); next/previous and `j` / `k` / `e` work; phones get list → message → back. ✅ *e2e*

### Email alert (if Q1 is "Yes")
- [x] AC-7.15 A new message sends one email with Reply-To set to the visitor; with no key set, sending a message still works. ✅ *built and unit-tested (payload, Reply-To, escaping, secret check); the live send is confirmed once you finish setup step C2*

### Quality
- [x] AC-7.16 375 / 1440 px, both themes: no horizontal scroll, no console errors, AA contrast, keyboard and screen-reader friendly; reduced motion and Lite respected; initial JS within budget. ✅ *e2e at 375 / 1440 px in both themes (contact, inbox and the full public and admin screen sweeps); reduced motion and Lite turn off the clapper animation; text uses the AA-checked theme tokens; initial JS within the 200 KB budget (unit)*
- [x] AC-7.17 Build, lint, unit, e2e and database tests all pass. ✅ *build, lint, 860 unit, 155 e2e (one Part 5 globe check needed a retry, as before), 259 database checks*

## 6. Risks

| Risk | Mitigation |
|---|---|
| Bots post straight to the API | The limits live in the database, not just the form (SP-3, AC-7.10) |
| The IP header differs on the live project | Fall back to the email and site-wide limits; checked against the live project when you run 0009 |
| Shared networks (office, college) hit the per-visitor limit | Limits are generous for people (3 per 10 min); the refusal message offers your email |
| Email alerts land in spam | Resend's sending domain, Reply-To set to the visitor; the inbox is always the source of truth |
| Personal data in messages | Only the owner can read them (Part 1); IPs are hashed and deleted after 2 days |

## 7. Open questions

| # | Question | Answer |
|---|---|---|
| Q1 | **Email alert** for each new message? Needs a free Resend account and about 10 minutes of setup by you (I'll write the steps). | **Decided:** Yes (default) |
| Q2 | Add **Cloudflare Turnstile** (an invisible "are you human" check from Cloudflare), or rely on the honeypot, time trap and database limits? | **Decided:** No for now; add it later if spam gets through (default) |
| Q3 | Choice labels: **Hiring · Freelance project · Collaboration · Just saying hi**? | **Decided:** Yes, as listed (default) |
| Q4 | Budget field only for Freelance, optional, free text? | **Decided:** Yes (default) |
| Q5 | Reply-time line after sending: "I usually reply within a couple of days", or no promise ("I'll get back to you soon")? | **Decided:** "I usually reply within a couple of days." (default) |
| Q6 | Form as a **film slate** with a clapper that snaps shut on send, or a plain clean form? | **Decided:** Film slate (default) |
| Q7 | Limits: **3 per 10 minutes and 10 per day** per visitor, **5 per day** per email, **100 per day** for the whole site? | **Decided:** Yes (default) |

## Changelog
- 0.1 (2026-10-17) — Initial draft.
- 0.2 (2026-10-17) — Approved by Ausaf with all defaults (Q1–Q7).
- 0.3 (2026-10-17) — Built. Notes from the build:
  - The limits apply only to messages sent through the API (visitors and signed-in users), so data you add by hand in the SQL Editor isn't counted.
  - The email alert function checks a shared secret sent by the webhook, so nobody else can make it send email.
  - The time trap counts from when the form first appeared, so a person retrying straight after a failed send isn't mistaken for a bot.
  - The open clapper's angle is worked out from the slate's width, so it opens the same height on phones and desktops.
  - Opening a new message updates the list in place instead of reloading it, so next / previous keep working on the New tab.
  - Inbox search waits a moment after you stop typing before it updates the address, and reads the live address when it does, so opening or archiving a message during that moment isn't undone.
  - The demo site now has a public email (hello@example.com) so the direct-email block and the fallback link can be seen.
  - `npm run db:verify` gained a check that 0009 is installed (a message with 6 links must be refused; nothing is stored).
