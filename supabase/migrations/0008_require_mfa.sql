-- Part 2 · 0008 — Two-factor login enforced by the database (spec 02 §3.7, AD-3)
--
-- !! Run this ONLY AFTER you have set up your authenticator in the admin
-- !! (sign in once and scan the QR code). Before that, the admin can't save anything
-- !! with this migration applied. To undo: re-run 0002_helpers.sql.
--
-- After this migration, is_owner() is true only for the owner's two-factor (aal2) session.
-- A password-only session gets the same access as any visitor.

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.app_owner where user_id = (select auth.uid()));
$$;

-- Whether the signed-in account is the owner, before the code is entered.
-- Lets the login screen turn away other accounts early. Grants no rights by itself.
-- Its presence also tells the admin that this migration has been applied.
create or replace function public.is_owner_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_owner where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_owner_account() from public, anon;
grant execute on function public.is_owner_account() to authenticated;
