# Supabase setup

This folder holds everything the database needs: the schema, the security rules, placeholder content and tests. The full design is in [`specs/01-data-model.md`](../specs/01-data-model.md).

```
migrations/   run these in order (0001 → 0007)
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

`npm run db:test` creates a throwaway Postgres, applies every migration twice, loads the seed twice and runs 223 schema and security checks as an anonymous visitor, a signed-in stranger and the owner. It needs PostgreSQL 15+ installed locally (set `PG_BIN` if `initdb` isn't on your PATH). Nothing touches your Supabase project.

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
| Project paused                                      | Free projects pause after a period of inactivity. Click **Restore** in the dashboard. Part 8 adds an automatic keep-alive.                                    |
| Admin signs in but nothing saves after running 0008 | The session was password-only. Sign out and back in with your code. If you ran 0008 before setting up an authenticator, follow A2, or re-run 0002 to undo it. |
| Reset email link goes to the wrong site             | Add the reset URL under Authentication → URL Configuration (A1).                                                                                              |
| "Two-factor isn't enforced" banner in the admin     | Run `0008_require_mfa.sql` (A3).                                                                                                                              |
