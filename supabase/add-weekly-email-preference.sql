-- Lets a player turn the weekly points email off.
--
-- NON-DESTRUCTIVE: adds one column and one policy. No table is rewritten, no
-- row is changed beyond picking up the default, nothing is dropped.
--
-- Defaults to true because the email is opt-OUT: a player who has never heard
-- of it should still get the first one, with a way to stop it from there.
alter table public.player_profiles
  add column if not exists weekly_email_enabled boolean not null default true;

-- Players can already update their own profile ("players update own profile"
-- in schema.sql, keyed on user_id = auth.uid()), so that policy covers this
-- column too -- nothing further is needed for a player to switch it off.
--
-- Verify with:
--   select display_name, email, weekly_email_enabled
--     from public.player_profiles
--    where email is not null
--    order by display_name;
