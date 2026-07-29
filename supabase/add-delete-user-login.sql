-- Lets an admin delete a login (auth user) from the app itself. Run once in
-- the Supabase SQL Editor. Safe to re-run (create or replace + idempotent
-- grants).
--
-- Why an RPC rather than a server route: this app is a static export on
-- GitHub Pages, so there is no server runtime to hold SUPABASE_SERVICE_ROLE_KEY
-- and no way to serve a POST handler (those return 405 in production). A
-- SECURITY DEFINER function runs with the owner's privileges inside Postgres,
-- so the client can call it with only the anon/publishable key while the
-- privileged work stays server-side in the database.
--
-- Security: SECURITY DEFINER bypasses RLS, so every check is done explicitly
-- below -- caller must be an enabled admin, target must be in the caller's own
-- club, and nobody can delete their own login. search_path is pinned so the
-- function can't be hijacked by a caller-controlled schema.

create or replace function public.delete_user_login(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_club_id uuid;
  target_club_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only enabled admins can delete logins.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own login.';
  end if;

  select club_id into caller_club_id from public.users where id = auth.uid();
  select club_id into target_club_id from public.users where id = target_user_id;

  if target_club_id is null or target_club_id is distinct from caller_club_id then
    raise exception 'That user was not found in your club.';
  end if;

  -- Unlink the player profile BEFORE deleting the login. player_profiles.user_id
  -- references public.users(id) on delete cascade, and public.users.id references
  -- auth.users(id) on delete cascade -- so deleting the auth user without this
  -- would silently cascade away the player profile, its division entries, and
  -- every match those entries appear in. Deleting a login should only revoke
  -- access; the person's roster spot and results stay put, just unlinked.
  update public.player_profiles set user_id = null where user_id = target_user_id;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_login(uuid) from public;
revoke all on function public.delete_user_login(uuid) from anon;
grant execute on function public.delete_user_login(uuid) to authenticated;
