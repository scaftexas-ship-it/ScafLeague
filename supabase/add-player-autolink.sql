-- Adds automatic self-service account linking to an already-provisioned
-- project. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- What this enables: when an admin adds a player with an email (Add User
-- And Player, or bulk import) but no login gets created for them (no
-- SUPABASE_SERVICE_ROLE_KEY, or the admin just didn't set a password), that
-- person can later sign up themselves at /login using that same email, and
-- the app auto-claims their player profile and creates their users row --
-- no admin "Link Existing Login" step required. Gated by the email having
-- already been entered by an admin, so random sign-ups still get nothing.

alter table public.player_profiles add column if not exists email text;

drop policy if exists "players self-provision after claiming a profile" on public.users;
create policy "players self-provision after claiming a profile" on public.users for insert to authenticated with check (
  id = auth.uid()
  and role = 'player'
  and access_disabled = false
  and exists (select 1 from public.player_profiles where email = auth.jwt() ->> 'email' and (user_id is null or user_id = auth.uid()))
);

drop policy if exists "players claim own profile by email" on public.player_profiles;
create policy "players claim own profile by email" on public.player_profiles for update using (
  email = auth.jwt() ->> 'email' and (user_id is null or user_id = auth.uid())
) with check (user_id = auth.uid());
