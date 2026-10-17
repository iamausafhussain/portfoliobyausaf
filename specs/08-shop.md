# Part 8 — Box Office: Shop for Digital Products

**Status:** Built — Dodo account, migration 0010 and one real test-mode purchase pending (Ausaf)
**Version:** 0.4 · 2026-10-17
**Depends on:** Part 1 (database, storage, security rules), Part 2 (admin), Part 3 (shell, routes), Part 6 (chapter styling, reveals), Part 7 (Edge Functions, Resend email)
**Feeds:** Part 9 (performance, SEO, accessibility audit, Netlify deploy; previously Part 8)

---

## 1. Scope

Sell your own digital products from the site: PDFs (guides, e-books, templates) and editing tools (LUTs, presets, project files, plug-ins) as downloads.

- **A. Box Office**: a shop chapter on the home page with your featured products, a `/shop` page with everything, and a page per product.
- **B. Checkout** through a payment provider's hosted checkout page (cards, UPI, PayPal and so on, depending on the provider), so no card details ever touch your site.
- **C. Delivery**: after a confirmed payment the buyer gets a private download link by email and on the thank-you page. Files sit in private storage and are only handed out through short-lived links.
- **D. Admin**: a Products manager (details, price, cover, gallery, the file itself) and an Orders list (who bought what, downloads, resend link, refunds reflected).
- **E. Shop policies**: Terms, Refund policy and Privacy pages, which payment providers require before they approve you.

### Why not Stripe (directly)

Stripe has accepted new accounts from India **by invitation only** since May 2024, and its own merchant-of-record product (Managed Payments) also needs a Stripe account. So unless you already have a Stripe invite, the shop uses another provider (Q1). The design keeps the provider behind one small adapter, so it can be switched later (including to Stripe, if you get an invite) without touching the shop pages.

### Out of scope

- Physical products, shipping, subscriptions or memberships, licence keys, affiliate programmes.
- A customer account area (buyers use their email link; a lost link can be re-sent).
- Sending invoices yourself: with a merchant-of-record provider (Q1), the provider issues the receipts and tax invoices.

## 2. Requirements

### 2.1 User stories

| ID | As a… | I want… | So that… |
|---|---|---|---|
| US-8.1 | visitor | to see what you sell, with previews, what's included and the price | I can decide to buy |
| US-8.2 | buyer | to pay with my usual method (card, UPI, PayPal) on a trusted checkout | paying feels safe |
| US-8.3 | buyer | my download right after paying, and an email I can come back to | I never lose what I paid for |
| US-8.4 | owner | to add a product with its file and price in the admin, like any other content | selling is no extra work |
| US-8.5 | owner | to see orders and re-send a buyer's link | I can help buyers myself |
| US-8.6 | owner | taxes and receipts handled for me where possible | I don't have to register for VAT abroad |
| US-8.7 | owner | files that can't be found or shared by guessing a link | only buyers get them |

### 2.2 Box Office (BX)

| ID | Requirement |
|---|---|
| BX-1 | A **Box Office** chapter on the home page (after Reviews, before custom sections and Final Scene) shows up to 3 featured products as "posters": cover, title, type (PDF / Tool / Bundle), price, and a short line. "See all" goes to `/shop`. The chapter is left out when there are no published products. Q6. |
| BX-2 | `/shop` lists every published product as a poster grid, with filters by type when there is more than one type. |
| BX-3 | `/shop/<slug>` product page: title, price, cover and gallery (opens in the Part 5 gallery viewer), description (markdown), **What's included** (list), file format and size, version and last update, requirements (e.g. "DaVinci Resolve 18+"), and a **Buy** button. Free products show **Download free** instead (Q5). |
| BX-4 | The Buy button asks for nothing on the site; it opens the provider's checkout with the product and price. A discount-code field is available on the provider's checkout (codes are set up in the provider's dashboard) (Q9). |
| BX-5 | Prices are set in the admin in **USD**, and optionally an **INR** price for buyers in India (Q2). The provider shows the right one; the site shows USD with "Price in INR at checkout for buyers in India" when an INR price is set. |
| BX-6 | Phones: posters in one column, the Buy button stays reachable at the bottom of the product page, gallery swipes. |

### 2.3 Checkout and delivery (CO)

| ID | Requirement |
|---|---|
| CO-1 | **Start checkout**: an Edge Function `shop-checkout` creates a checkout session with the provider for that product (price taken from the database, never from the browser) and returns the provider's checkout address. The provider API key lives only in Supabase secrets. |
| CO-2 | **Confirm payment**: an Edge Function `shop-webhook` receives the provider's events, **checks their signature**, and on a successful payment records the order (once, even if the event arrives twice). The redirect back to the site is never trusted on its own. |
| CO-3 | **Thank-you page** `/shop/thanks`: shows "Confirming your payment…" until the order is recorded (a few seconds), then the product with a **Download** button. If it takes longer than about a minute: "Your payment is being confirmed; the download link is on its way to your email." |
| CO-3a | **Failed payment**: when the buyer comes back from a payment that didn't go through (Dodo's return address says `failed` / `cancelled`, confirmed with Dodo's payment record for this buyer), the page says **Payment failed**, that nothing was bought, and offers **Try again** (the product page) instead of waiting. Dodo's checkout also gets a back button to the product page. |
| CO-4 | **Email**: the buyer gets "Your download: <product>" with their personal download link (sent through Resend, as in Part 7). The provider sends its own receipt. |
| CO-5 | **Download link**: `/d/<token>`, a long random token per order. Each download goes through an Edge Function `shop-download` that checks the order is paid and within limits, then hands out a storage link valid for 60 seconds. Limits: **5 downloads within 30 days** (Q3); after that the page offers "Send me a fresh link" (to the same email). |
| CO-6 | **Refunds** made in the provider's dashboard arrive as webhook events: the order becomes Refunded and its link stops working. |
| CO-7 | Product files live in a **private** storage bucket (`products`): visitors can't list or read it; only the download function can create links. Covers and gallery images stay in the public images bucket. |
| CO-8 | Files up to **50 MB** each are stored in Supabase (the free plan's limit per file). For bigger tools, the product can instead hold an external link (for example a Google Drive or Dropbox file) that is only revealed through the same download page (Q4). |
| CO-9 | **Free products** (Q5): the buyer enters an email and gets the same kind of link, without checkout. Limited like the contact form (Part 7 limits). |
| CO-10 | **Test mode**: the shop works end to end with the provider's test mode and test cards before going live; a switch in the admin shows which mode is active, and live mode needs the live keys. Demo mode (`dev:demo`) fakes the provider so everything can be tried without an account. |

### 2.4 Admin (AD)

| ID | Requirement |
|---|---|
| AD-8.1 | **Products** manager, like the other managers: title, slug, type (PDF, Tool, Bundle), short line, description (markdown), what's included (list), requirements, version, price USD, optional price INR, free (yes/no), cover, gallery (up to 8), the file (upload to the private bucket, or an external link), featured, published, order. |
| AD-8.2 | When a product is saved with a price, the admin creates or updates the matching product on the provider (through an Edge Function), so you never have to copy IDs between dashboards. |
| AD-8.3 | **Orders** list, newest first: date, buyer email, product, amount and currency, status (Paid, Refunded, Free), downloads used. Filter by product and status; search by email. |
| AD-8.4 | Order actions: **Re-send link** (new email with a fresh link; the old one stops working), **Reset downloads** (back to 5 for 30 days), **Revoke** (link stops working; use after a refund done outside the provider). |
| AD-8.5 | Dashboard: a "Sales" card with orders and revenue for the last 30 days, linking to Orders. |
| AD-8.6 | **Shop policies**: Terms, Refund policy and Privacy as editable markdown pages, published at `/terms`, `/refunds`, `/privacy` and linked in the footer and on every product page. They start from short templates clearly marked "Review before publishing" (Q8). |

### 2.4a Discount codes (DC) — added in 0.4

| ID | Requirement |
|---|---|
| DC-1 | Admin → **Discount codes** lists every code on Dodo: code, % off, times used (of the limit), expiry, which products, and Active / Expired / Used up. |
| DC-2 | **New code**: code (or empty for a random one), percent off (1–100), optional total uses, optional last day, all products or chosen ones. It's created on Dodo; a code that already exists is refused on the field. Flat-amount codes can be made in Dodo's dashboard and are listed too. |
| DC-3 | **Delete** a code (with confirmation); it stops working at checkout. |
| DC-4 | **Code links**: `/shop/<slug>?code=CODE` shows "Code CODE is applied at checkout" (with Remove) and passes the code to the checkout, which applies it for the buyer. The site checks the code with Dodo first; an expired, used-up or unknown code, or one for other products, shows a message with **Buy without the code**. **Copy link** in the admin makes these links per product. |
| DC-5 | Buyers can still type any code into Dodo's checkout themselves (BX-4). |

### 2.5 Security (SH)

| ID | Requirement |
|---|---|
| SH-1 | Visitors can read published products (without the file path or external link), and nothing else in the shop tables. Orders are readable only by you; only the Edge Functions (server side) create or change orders. |
| SH-2 | Prices, product IDs and the file are always taken from the database on the server; nothing the browser sends can change what is charged or delivered. |
| SH-3 | Webhooks with a missing or wrong signature are refused; every event is stored by its ID and processed at most once. |
| SH-4 | Download tokens are 32 random bytes; storage links last 60 seconds; a token that is guessed or shared stops working after the download limit. |
| SH-5 | Provider keys, the webhook secret and the Resend key exist only as Supabase secrets. The site's code holds only the public (anon) key, as now. |

## 3. Design

### 3.1 How a purchase travels

```
Product page ──Buy──► shop-checkout (Edge Function)
                        │  reads the product + price from the database
                        │  creates a checkout session with the provider (secret key)
                        ▼
                     Provider's hosted checkout (card / UPI / PayPal…)
                        │                                   │
     redirect to /shop/thanks?session=…              webhook: payment succeeded
                        │                                   ▼
                        │                        shop-webhook (Edge Function)
                        │                          verify signature, store event once
                        │                          create order (paid) + download token
                        │                          email the link (Resend)
                        ▼                                   │
     /shop/thanks polls shop-order-status ◄─────────────────┘
                        │
                        ▼
     Download ──► shop-download (Edge Function) ── checks limits ──► 60-second storage link
```

### 3.2 Provider adapter

One module per provider with three jobs: create a checkout session, verify and read a webhook event, and keep the provider's product in step with yours (AD-8.2). The first build implements the provider chosen in Q1, plus a **demo** adapter for `dev:demo` and the tests. Switching later means writing one new adapter and changing a secret.

### 3.3 Database (`0010_shop.sql`)

- `products`: the fields in AD-8.1 plus `provider_product_id`. Public read of published rows, but the file columns live in a separate owner-only table `product_files` (path or external URL, size, format).
- `orders`: product, buyer email, amount, currency, status, provider IDs, download token hash (only the hash is stored), downloads used, expiry, created at. Owner read; written only by the Edge Functions.
- `shop_events`: provider event IDs already processed (CO-2, SH-3).
- `shop_pages`: terms / refunds / privacy markdown (owner write, public read when published).
- Storage bucket `products` (private), 50 MB per file, any file type.
- Database tests in the style of Parts 1 and 7 (visitors see published products only, never file paths or orders).

### 3.4 Pages and files

```
src/chapters/shop/
  BoxOfficeChapter.tsx    home chapter (featured posters)
  ShopPage.tsx            /shop
  ProductPage.tsx         /shop/:slug (USD / INR, free claim, gallery)
  ThanksPage.tsx          /shop/thanks?ref=…
  DownloadPage.tsx        /d/:token
  PolicyPage.tsx          /terms, /refunds, /privacy
  DemoCheckoutPage.tsx    demo mode only: stands in for Dodo's checkout
  Poster.tsx, Ticket.tsx, PolicyLinks.tsx, shop.module.css
src/admin/shop/
  products.tsx            Products manager (built on the Part 2 manager), file field, price fields
  OrdersPage.tsx, PoliciesPage.tsx, SalesCard.tsx, ShopModeNotice.tsx
src/admin/repository/demoShop.ts   demo provider, same rules via the shared helpers
supabase/functions/
  shop-checkout/  shop-webhook/  shop-order-status/  shop-download/  shop-claim/  shop-admin/
  _shared/  shop.ts (tokens, limits, webhooks, emails)  dodo.ts (adapter)  runtime.ts
supabase/migrations/0010_shop.sql
supabase/tests/shop.test.sql
```

### 3.5 Look

- Products are **film posters**: tall cover (2:3), title in the italic display face, a small "ticket stub" strip with type and price. The Buy button is the accent pill used elsewhere.
- The thank-you page is a **ticket**: "Admit one · <product>" with the Download button; the email repeats the ticket.
- Light and dark themes, tokens only, as everywhere else.

## 4. Tasks

### A. Database and storage
- [x] 8.1 `0010_shop.sql`: tables, security rules, private bucket; database tests
- [x] 8.2 Setup guide: provider account (test mode first), secrets, webhook, going live

### B. Server (Edge Functions)
- [x] 8.3 Provider adapter (Q1) and demo adapter
- [x] 8.4 `shop-checkout`, `shop-webhook` (signature, once-only), `shop-order-status`
- [x] 8.5 `shop-download` (limits, 60-second links, fresh-link email), free-product claim
- [x] 8.6 Provider sync on save (`shop-admin` action `sync`)

### C. Public site
- [x] 8.7 Box Office chapter, `/shop`, product page, gallery
- [x] 8.8 Thank-you page (polling, slow-confirmation message), download page
- [x] 8.9 Policy pages and footer links

### D. Admin
- [x] 8.10 Products manager (file upload to the private bucket or external link)
- [x] 8.11 Orders list and actions; dashboard Sales card; Policies editor
- [x] 8.12 Demo products and orders

### E. Verify
- [x] 8.13 Unit tests: adapter (signature checks with real test vectors), limits, token handling, price display
- [x] 8.14 E2E (demo provider): browse → buy → thanks → download; limits; refund; free product; admin products and orders; phones; both themes
- [x] 8.16 Failed-payment page, discount codes in the admin, code links (0.4)
- [ ] 8.15 A real purchase in the provider's **test mode** on the live Supabase project, after you've created the account

## 5. Acceptance criteria

### Box Office
- [x] AC-8.1 Featured products appear in the Box Office chapter (max 3 + "See all"); `/shop` lists all published products; drafts never appear; the chapter is hidden with no products.
- [x] AC-8.2 The product page shows everything from the admin (gallery, included list, format and size, version, requirements, price; INR note when set); Buy opens the provider checkout for that product and price.

### Checkout and delivery
- [ ] AC-8.3 *(demo provider: passes; real test-mode purchase pending)* After a successful test payment, the order is recorded once (even if the webhook arrives twice), the thank-you page shows the Download button within seconds, and the buyer receives the email with the link.
- [x] AC-8.4 The download link works 5 times within 30 days, then offers a fresh link by email; each download is a storage link that expires after 60 seconds.
- [x] AC-8.5 A webhook with a bad signature is refused and changes nothing; changing the price or product in the browser can't change what's charged or delivered.
- [x] AC-8.6 A refund in the provider's dashboard marks the order Refunded and its link stops working.
- [x] AC-8.7 A free product is delivered by email link without checkout, within the contact-form limits.
- [x] AC-8.8 Product files can't be listed or downloaded without a valid paid order; visitors can't read orders or file locations (database tests).

### Admin
- [x] AC-8.14 *(0.4)* After a failed payment the return page says "Payment failed" with Try again, never "being confirmed"; codes can be created, listed, linked and deleted in the admin; a code link applies the discount, and a bad code says so and can be dropped (demo provider and unit tests; real test-mode check pending).
- [ ] AC-8.9 *(demo provider: passes; against Dodo's test mode pending)* Adding a product with a file and price makes it buyable without visiting the provider's dashboard; editing the price updates the provider.
- [x] AC-8.10 Orders list, filters and search work; Re-send link, Reset downloads and Revoke work; the dashboard Sales card shows the last 30 days.
- [x] AC-8.11 Policy pages are editable, published at their addresses and linked from the footer and product pages.

### Quality
- [x] AC-8.12 375 / 1440 px, both themes: no horizontal scroll, no console errors, AA contrast, keyboard and screen-reader friendly; the shop adds nothing to the home page's first download beyond the chapter itself.
- [ ] AC-8.13 *(build, lint, unit, e2e and database tests pass; real test-mode purchase pending)* Build, lint, unit, e2e and database tests pass; one real test-mode purchase succeeds end to end.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Provider approval takes time or asks for documents | Build and test against the demo provider and the provider's test mode first; policies pages (AD-8.6) ready for the application |
| A provider changes its fees or India support | The adapter keeps the switch small (§3.2) |
| Lost or shared download links | Per-order tokens, limits, fresh-link by email, revoke in the admin |
| Large tool files | 50 MB in Supabase; bigger files by external link revealed only after purchase (CO-8) |
| Tax on international sales | A merchant-of-record provider (Q1) collects and files VAT/GST for you; with a plain gateway (Razorpay) that becomes your job |
| Webhook delays | Thank-you page waits, then falls back to "link is on its way"; email is sent whenever the webhook lands |

## 7. Open questions

| # | Question | Answer |
|---|---|---|
| Q1 | **Payment provider.** (a) **Dodo Payments**: merchant of record (it's the legal seller and handles VAT/GST abroad), built with Indian sellers in mind, UPI and cards; third-party reviews put fees around 4% + $0.40 per sale, plus 1.5% for international cards. (b) **Lemon Squeezy**: merchant of record, 5% + 50¢; Indian sellers without a Stripe account are paid out through PayPal only. (c) **Razorpay**: a payment gateway, not a merchant of record; lower fees (about 3% for international cards, less for Indian UPI/cards), but you handle GST and export paperwork yourself. (d) **Stripe**, only if you already have an invite. Please confirm fees and payout terms on the provider's own pricing page when you sign up. | **Decided:** (a) Dodo Payments (default) |
| Q2 | Prices in **USD**, with an optional **INR** price for buyers in India? | **Decided:** Yes (default) |
| Q3 | Download limits: **5 downloads within 30 days**, then a fresh link by email? | **Decided:** Yes (default) |
| Q4 | Files over 50 MB: by **external link** (Google Drive / Dropbox) revealed only after purchase, or upgrade Supabase to the Pro plan (bigger files, about $25 a month)? | **Decided:** External link (default) |
| Q5 | **Free products** (for example a free LUT to build your email list): delivered by email link, so you collect the email? | **Decided:** Yes (default) |
| Q6 | Chapter name and place: **Box Office**, after Reviews, with up to 3 featured posters? | **Decided:** Yes (default) |
| Q7 | Show the shop in the top bar / Fast Lane (e.g. a "Shop" link), or only through the chapter, the menu and `/shop`? | **Decided:** Chapter menu and `/shop` only (default) |
| Q8 | Policy pages: start from short templates I write, which **you must review** (I'm not a lawyer), or will you provide your own text? | **Decided:** Templates, marked "Review before publishing" (default) |
| Q9 | Discount codes: use the provider's built-in codes on its checkout? | **Decided:** Yes (default) |
| Q10 | Numbering: the shop becomes **Part 8** and performance / SEO / deploy moves to **Part 9**? | **Decided:** Yes (default) |

## Changelog
- 0.1 (2026-10-17) — Initial draft, after checking payment providers available to a seller in India.
- 0.2 (2026-10-17) — Approved by Ausaf with all defaults (Q1–Q10). Design details from Dodo's API docs:
  - Dodo switches currency only through its own "adaptive pricing", so a product with an INR price gets a second Dodo product; the product page offers **USD / INR**, defaulting to INR for visitors on Indian time (BX-5).
  - Download links are signed with a server secret (order id + signature) instead of storing a token; they can always be re-sent and can't be forged (CO-5, SH-4).
  - Webhooks follow the Standard Webhooks scheme (`webhook-id`, `webhook-timestamp`, `webhook-signature`, HMAC-SHA256, 5-minute tolerance); events used: `payment.succeeded`, `refund.succeeded`, `dispute.lost`.
  - The thank-you page proves it belongs to the buyer with a one-time secret kept in the buyer's tab (its hash travels in the checkout metadata), so a leaked payment id alone can't reveal the download.
- 0.3 (2026-10-17) — Built. Notes from the build:
  - Functions: `shop-claim` (free products) and `shop-admin` (status, provider sync, re-send) replace the planned `shop-sync-product`; the adapter is `_shared/dodo.ts`, the demo provider lives in the admin's demo backend.
  - **Every save of a paid product** updates Dodo (not only price changes), and an id Dodo doesn't know is created afresh, so going live means saving each paid product once (setup guide D5).
  - **Re-send link** sends a fresh link and the old one stops working (links are signed, so the same link can't be re-derived once replaced) (AD-8.4).
  - Buyer emails need a domain verified in Resend; without one, buyers still get the download on the thank-you page (setup guide D2).
  - Order: custom sections you place after Reviews stay right after Reviews, then the Box Office (CH 09 with the demo data), then sections placed after the shop, then Final Scene (BX-1).
  - The policy pages' footer links appear only for published pages.
- 0.4 (2026-10-17) — From Ausaf's first test-mode tries: a failed payment showed "being confirmed" forever, and discount codes could only be made in Dodo's dashboard.
  - **CO-3a** failed payments: the thank-you page reads Dodo's `payment_id` and `status` from the return address; `shop-order-status` confirms with Dodo (`GET /payments/{id}`, only when its metadata carries this buyer's ref hash) and the page shows **Payment failed** with Try again. Checkouts get a `cancel_url` back to the product.
  - **DC** discount codes (Ausaf chose: managed in the admin, plus code links): `shop-admin` actions `discounts`, `create_discount`, `delete_discount` (Dodo `/discounts`); percentage codes only from the admin. `shop-checkout` takes an optional `code`, checks it (`GET /discounts/code/{code}`) and passes it as `discount_codes`.
  - Redeploy `shop-checkout`, `shop-order-status` and `shop-admin` (setup guide D3).
