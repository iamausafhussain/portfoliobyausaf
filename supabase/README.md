# Supabase setup

This folder holds everything the database needs: the schema, the security rules, placeholder content and tests. The full design is in [`specs/01-data-model.md`](../specs/01-data-model.md).

```
migrations/   run these in order (0001 → 0009)
functions/    the email alert for new contact messages (Part 7)
seed.sql      optional placeholder content (all unpublished)
tests/        local security tests (npm run db:test); never run these on your project
```

## One-time setup (about 15 minutes)

### S1 — Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. **Region:** choose **South Asia (Mumbai)**, the closest region to Bhubaneswar and Indian visitors.
3. Set a strong database password and save it in a password manager. You won't need it for the app.

### S2 — Turn off public sign-ups

Go to **Authentication → Sign In / Providers** (the label may differ slightly) and turn **off** "Allow new users to sign up". Only you will ever log in.

### S3 — Create your admin account

Go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick "Auto Confirm User" if offered.

### S4 — Run the migrations

Go to **SQL Editor → New query**. For each file in `migrations/`, **in order**, paste its contents and click **Run**:

1. `0001_extensions_enums.sql`
2. `0002_helpers.sql`
3. `0003_tables.sql`
4. `0004_indexes.sql`
5. `0005_rls.sql`
6. `0006_storage.sql`
7. `0007_functions.sql`

Then, optionally, run `seed.sql` to get one unpublished placeholder row per content type.

Every file can be re-run safely. If a later migration is added, just run the new file.

> **`0008_require_mfa.sql` is different — don't run it yet.** It makes the database require two-factor login. Run it only after step A2 below, once your authenticator is set up.

> Prefer the command line? With the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link --project-ref <id>` then `supabase db push`.

### S5 — Check storage

Go to **Storage**. You should see three public buckets: `images` (5 MB per file), `videos` (15 MB) and `documents` (5 MB, PDF only).

### S6 — Make yourself the owner

In the **SQL Editor**, run this once, using the email from S3:

```sql
insert into public.app_owner (user_id)
select id from auth.users where email = 'YOUR-EMAIL-HERE';
```

It should say "1 row". Without this step you can log in but can't change anything.

### S7 — Connect the app

Go to **Project Settings → API** (or **Data API**) and copy:

- **Project URL**, for example `https://abcdefghijklmnop.supabase.co`
- **anon / public key**

Put them in your local `.env` (copy `.env.example`) and later in Netlify's environment variables:

```
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

These two values are **public by design**: they ship to every visitor's browser, and the security rules in the database decide what each visitor can do.

**Never share or commit the `service_role` key or the database password.** Nothing in this project needs them.

## Admin login and two-factor (Part 2)

Do these once Part 2 (the admin panel) is deployed or running locally.

### A1 — Allow the password-reset link

Go to **Authentication → URL Configuration**:

- **Site URL:** your site's address (for now the Netlify URL, later your domain).
- **Redirect URLs:** add `http://localhost:5173/admin/reset-password` and `https://<your-site>/admin/reset-password`.

Without this, "Forgot password?" emails link to the wrong place. While you're there, check **Authentication → Multi-Factor** shows **TOTP (authenticator app) enabled** (it is by default).

### A2 — Set up your authenticator

1. Open `/admin` and sign in with your email and password.
2. The admin shows a QR code. Scan it with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…) and enter the 6-digit code.
3. Strongly recommended: **Account → Add a backup authenticator** (a second phone or a password manager).

### A3 — Make the database require two-factor

Now run **`0008_require_mfa.sql`** in the SQL Editor. From this point a stolen password alone can't change anything: the database only treats you as the owner after the 6-digit code. The yellow banner in the admin disappears once it's applied.

> If you ever re-run `0002_helpers.sql`, re-run `0008` afterwards (0002 contains the older version of the owner check).

### Lost your authenticator?

1. If you added a backup authenticator, sign in with that one and remove the lost phone under **Account**.
2. Otherwise, in the Supabase dashboard **SQL Editor**, run (with your email):

   ```sql
   delete from auth.mfa_factors
   where user_id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
   ```

   Then sign in straight away: the admin asks you to set up a new authenticator. Until you do, your password alone is enough to set one up, so do this only when you're ready to sign in yourself, and change your password if you think it may be known. Only someone with access to your Supabase dashboard can run this SQL, so protect that account with two-factor too.

## Contact form and email alerts (Part 7)

### C1 — Turn on the contact-form protection

Run **`0009_contact.sql`** in the SQL Editor. It adds the limits on how many messages can be sent (3 per 10 minutes and 10 a day from one connection, 5 a day from one email address, 100 a day for the whole site) and the link limit. Visitors' IP addresses are only ever stored as a scrambled code and are deleted after 2 days. `npm run db:verify` (below) confirms it's in place.

### C2 — Get an email for every new message (optional, about 10 minutes)

Messages always land in the admin **Inbox**. These steps also send you an email for each one, and replying to that email answers the visitor directly.

1. **Resend account.** Sign up at [resend.com](https://resend.com) (free: 100 emails a day) **with the email address you want the alerts sent to**. Until you verify a domain of your own, Resend can only deliver to that address. Then **API Keys → Create API key** (permission: _Sending access_) and copy it.
2. **Make a webhook secret.** Any long random string, for example from a password manager. It stops anyone else from triggering the alert.
3. **Add the secrets.** Supabase → **Edge Functions → Secrets**, add:

   | Name             | Value                                                     |
   | ---------------- | --------------------------------------------------------- |
   | `RESEND_API_KEY` | the key from step 1                                       |
   | `NOTIFY_TO`      | your email (the one you signed up to Resend with)         |
   | `WEBHOOK_SECRET` | the string from step 2                                    |
   | `SITE_URL`       | your site's address, e.g. `https://your-site.netlify.app` |

4. **Deploy the function** from this project folder:

   ```bash
   npx supabase login
   npx supabase functions deploy notify-message --no-verify-jwt --project-ref YOUR-PROJECT-ID
   ```

   (`--no-verify-jwt` is correct: the webhook secret does the checking.)

5. **Create the webhook.** Supabase → **Database → Webhooks → Create a new hook**:
   - Name: `notify-message`; Table: `messages`; Events: **Insert** only
   - Type: **Supabase Edge Functions**, function `notify-message`, method `POST`
   - HTTP headers: add `x-webhook-secret` with the string from step 2

6. **Test it.** Send yourself a message from the site's contact form. The email arrives within a few seconds; check your spam folder the first time and mark it "not spam". If nothing arrives, Supabase → **Edge Functions → notify-message → Logs** shows why.

If the alert ever fails, the message is still saved in your inbox. Nothing on the site changes.

## Shop: Box Office (Part 8)

The shop takes payments through **Dodo Payments**, which acts as the seller of record: it charges the buyer (cards, UPI and more), handles sales tax and VAT abroad, sends receipts and pays you out. The site never sees card details. Do everything below in Dodo's **test mode** first; nothing is charged there.

### D1 — Run the shop migration

Run **`0010_shop.sql`** in the SQL Editor. It adds the products, orders and policy-page tables, the private `products` storage bucket (50 MB per file, only you can upload; buyers only ever get a 60-second link) and the security rules. If you ever re-run `0005` or `0007`, run `0010` again afterwards, because it extends the reordering function they define.

### D2 — Dodo account and keys (test mode)

1. Sign up at [dodopayments.com](https://dodopayments.com) and stay in **Test mode** (the switch in the dashboard). Business verification for live mode can run in the background.
2. **API key:** in the dashboard's developer settings, create an API key and copy it.
3. **Webhook:** in the same developer settings, add a webhook endpoint:
   - URL: `https://YOUR-PROJECT-ID.supabase.co/functions/v1/shop-webhook`
   - Events: `payment.succeeded`, `refund.succeeded`, `dispute.lost`
   - Copy its **signing secret** (it starts with `whsec_`).

   Menu names in Dodo's dashboard may differ slightly from these; the two things you need are the API key and the webhook signing secret.

4. **Download-link secret:** make a random string of at least 32 characters (a password manager is fine). It signs buyers' download links; changing it later makes every existing link stop working.
5. **Email (Resend):** the buyer's download link is emailed through Resend, as in C2. Resend only delivers to other people's addresses **from a domain you've verified** there (Resend → Domains). Until you have one, buyers still get their download on the thank-you page, but the email won't reach them, so verify a domain before going live.

### D3 — Secrets and deploy

Supabase → **Edge Functions → Secrets**, add:

| Name                  | Value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `DODO_API_KEY`        | the API key from D2                                                                   |
| `DODO_WEBHOOK_SECRET` | the webhook signing secret from D2 (`whsec_…`)                                        |
| `DODO_MODE`           | `test` (change to `live` in D5)                                                       |
| `SHOP_TOKEN_SECRET`   | the random string from D2 step 4                                                      |
| `SITE_URL`            | your site's address, e.g. `https://your-site.netlify.app` (already set if you did C2) |
| `RESEND_API_KEY`      | your Resend key (already set if you did C2)                                           |
| `SHOP_FROM`           | the sender, e.g. `Ausaf Hussain <shop@your-domain.com>` (a verified Resend domain)    |

Then deploy the six shop functions from this project folder:

```bash
npx supabase login
npx supabase functions deploy shop-checkout shop-webhook shop-order-status shop-download shop-claim shop-admin --no-verify-jwt --project-ref YOUR-PROJECT-ID
```

(`--no-verify-jwt` is correct: visitors aren't signed in, the webhook checks Dodo's signature, and `shop-admin` checks that the caller is you.)

The admin's **Products** and **Orders** pages show which mode is active and list any secret that's still missing.

### D4 — Add a product and make a test purchase

1. Admin → **Products → New product**: title, price, cover, then **Save**. Saving creates the matching product in Dodo for you. Then add the file (upload up to 50 MB, or an external link for bigger files), and publish.
2. Admin → **Shop policies**: read the three templates, change what doesn't fit, remove the "Review before publishing" line and publish them. Dodo asks for these pages when it reviews your shop.
3. Open the product on your site, **Buy**, and pay with one of Dodo's test cards (listed in Dodo's docs under testing). You land on the thank-you page, the Download button appears within a few seconds, the order shows in Admin → **Orders**, and the email arrives (D2 step 5).
4. Try a failed payment too: use Dodo's decline test card `4000 0000 0000 0002`. You come back to a **Payment failed** page with **Try again**.
5. Admin → **Discount codes → New code**, e.g. `TEST50` for 50% off. Open the product with `?code=TEST50` at the end of its address (or use **Copy link** next to the code): the code is applied at checkout.
6. Refund that test payment in Dodo's dashboard: the order turns **Refunded** and its link stops working.

If the thank-you page keeps saying "Confirming your payment…", check Supabase → **Edge Functions → shop-webhook → Logs** (usually a wrong webhook secret or URL).

**After updating the code** (new shop features), redeploy the shop functions with the command in D3; Netlify rebuilds the site by itself.

### D5 — Going live

Once Dodo has approved your business: switch the dashboard to **Live mode**, create a live API key and a live webhook (same URL and events), put both in the secrets from D3, set `DODO_MODE` to `live`, and **save each paid product once** in the admin so it's created in your live Dodo account. Discount codes live in each mode separately, so create the ones you need again after switching. Then make one real small purchase and refund it.

## Check that it worked

```bash
npm run db:verify
```

This runs about 25 read-only checks against your live project as an anonymous visitor: it can read published content, can't see drafts or messages, and can't write or upload anything.

To also check the owner side (upload limits, file types, owner access), give your login for that one run only:

```bash
# macOS / Linux
OWNER_EMAIL=you@example.com OWNER_PASSWORD='your-password' npm run db:verify

# Windows PowerShell
$env:OWNER_EMAIL='you@example.com'; $env:OWNER_PASSWORD='your-password'; npm run db:verify
```

It uploads three tiny test files and deletes them again. It never changes your content. Once two-factor is set up, it asks for the current 6-digit code from your authenticator app.

## Local tests (developers)

`npm run db:test` creates a throwaway Postgres, applies every migration twice, loads the seed twice and runs 310 schema and security checks as an anonymous visitor, a signed-in stranger and the owner. It needs PostgreSQL 15+ installed locally (set `PG_BIN` if `initdb` isn't on your PATH). Nothing touches your Supabase project.

## Regenerate TypeScript types

After changing the schema:

```bash
SUPABASE_PROJECT_ID=abcdefghijklmnop npm run db:types
```

This needs the Supabase CLI and `supabase login`. It writes `src/data/database.types.ts`; update the Zod schemas in `src/data/schemas/` to match.

## Troubleshooting

| Problem                                             | Fix                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logged in but can't save anything                   | Step S6 wasn't run, or used a different email. Run it again.                                                                                                  |
| `relation "auth.users" does not exist`              | You're running the SQL somewhere other than your Supabase project.                                                                                            |
| Locked out                                          | Use "Forgot password" on the admin login, or reset the password in Authentication → Users.                                                                    |
| Project paused                                      | Free projects pause after a period of inactivity. Click **Restore** in the dashboard. Part 9 adds an automatic keep-alive.                                    |
| Admin signs in but nothing saves after running 0008 | The session was password-only. Sign out and back in with your code. If you ran 0008 before setting up an authenticator, follow A2, or re-run 0002 to undo it. |
| Reset email link goes to the wrong site             | Add the reset URL under Authentication → URL Configuration (A1).                                                                                              |
| "Two-factor isn't enforced" banner in the admin     | Run `0008_require_mfa.sql` (A3).                                                                                                                              |
