-- Walkathon: registered players log step counts, and a dashboard ranks them.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION. This script contains no drop, no delete,
-- no update, no truncate and no alter of any existing table. It only creates
-- new objects:
--   tables    walkathons, walkathon_participants, walkathon_step_entries
--   functions walkathon_validate_entry, can_post_walkathon_steps
--   plus indexes, one trigger and RLS policies, all on those new tables.
--
-- It does REFERENCE three existing tables -- clubs, users and player_profiles
-- -- as foreign keys. A foreign key reads those tables and adds a constraint;
-- it never modifies a row in them. (Adding one takes a brief lock on the
-- referenced table, so run it when the league is quiet if you like, but no
-- data changes either way.)
--
-- Re-runnability is handled with "if not exists" guards rather than by
-- dropping and recreating, so nothing is ever removed on a second run.
--
-- Two rules are enforced down here rather than in the UI, because a
-- leaderboard nobody can quietly inflate is the whole point:
--   1. You may only write rows for your own player profile, and only if you
--      are registered for that walkathon (see can_post_walkathon_steps).
--   2. A week holds EITHER daily entries OR one weekly total, never both --
--      otherwise "I posted my week, then also logged Tuesday" double counts.

create table if not exists public.walkathons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.walkathon_participants (
  id uuid primary key default gen_random_uuid(),
  walkathon_id uuid not null references public.walkathons(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (walkathon_id, player_id)
);

-- entry_date is the day itself for a daily post, or the Monday of the week
-- for a weekly one. week_start is generated so both kinds can be grouped and
-- de-duplicated by week without the app having to agree on how weeks start.
create table if not exists public.walkathon_step_entries (
  id uuid primary key default gen_random_uuid(),
  walkathon_id uuid not null references public.walkathons(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  entry_date date not null,
  covers_week boolean not null default false,
  steps integer not null check (steps >= 0 and steps <= 500000),
  week_start date generated always as ((date_trunc('week', entry_date::timestamp))::date) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One daily row per day, and one weekly row per week. Partial indexes so the
-- two kinds cannot collide with each other on the same key.
create unique index if not exists walkathon_one_daily_entry_per_day
  on public.walkathon_step_entries (walkathon_id, player_id, entry_date)
  where not covers_week;

create unique index if not exists walkathon_one_weekly_entry_per_week
  on public.walkathon_step_entries (walkathon_id, player_id, week_start)
  where covers_week;

create index if not exists walkathon_step_entries_lookup
  on public.walkathon_step_entries (walkathon_id, entry_date);

/**
 * Rejects an entry that would double count, and one dated outside the
 * walkathon. Raised as friendly text because these surface straight to the
 * player posting their steps.
 */
create or replace function public.walkathon_validate_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start date;
  window_end date;
begin
  select w.start_date, w.end_date into window_start, window_end
  from public.walkathons w where w.id = new.walkathon_id;

  if new.entry_date < window_start or new.entry_date > window_end then
    raise exception 'That date is outside the walkathon (% to %).', window_start, window_end
      using errcode = 'check_violation';
  end if;

  if new.covers_week then
    if exists (
      select 1 from public.walkathon_step_entries e
      where e.walkathon_id = new.walkathon_id and e.player_id = new.player_id
        and e.id <> new.id and not e.covers_week and e.week_start = new.week_start
    ) then
      raise exception 'You already logged individual days in that week. Remove them before posting a weekly total.'
        using errcode = 'check_violation';
    end if;
  else
    if exists (
      select 1 from public.walkathon_step_entries e
      where e.walkathon_id = new.walkathon_id and e.player_id = new.player_id
        and e.id <> new.id and e.covers_week and e.week_start = new.week_start
    ) then
      raise exception 'You already posted a weekly total for that week. Remove it before logging single days.'
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Created only when absent, so a re-run leaves the existing trigger alone.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'walkathon_validate_entry_trigger'
      and tgrelid = 'public.walkathon_step_entries'::regclass
  ) then
    create trigger walkathon_validate_entry_trigger
      before insert or update on public.walkathon_step_entries
      for each row execute function public.walkathon_validate_entry();
  end if;
end $$;

/** True when the caller owns that player profile AND is registered for that walkathon. */
create or replace function public.can_post_walkathon_steps(target_walkathon uuid, target_player uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.walkathon_participants wp
    join public.player_profiles pp on pp.id = wp.player_id
    where wp.walkathon_id = target_walkathon
      and wp.player_id = target_player
      and pp.user_id = auth.uid()
  );
$$;

alter table public.walkathons enable row level security;
alter table public.walkathon_participants enable row level security;
alter table public.walkathon_step_entries enable row level security;

-- Each policy is created only if it isn't already there. Everyone signed in
-- can READ every step entry -- that is what makes a leaderboard possible.
-- Writing is limited to your own registered profile.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathons' and policyname = 'authenticated read walkathons') then
    create policy "authenticated read walkathons" on public.walkathons for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathons' and policyname = 'admins manage walkathons') then
    create policy "admins manage walkathons" on public.walkathons for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathon_participants' and policyname = 'authenticated read walkathon participants') then
    create policy "authenticated read walkathon participants" on public.walkathon_participants for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathon_participants' and policyname = 'admins manage walkathon participants') then
    create policy "admins manage walkathon participants" on public.walkathon_participants for all using (public.is_admin()) with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathon_step_entries' and policyname = 'authenticated read walkathon steps') then
    create policy "authenticated read walkathon steps" on public.walkathon_step_entries for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathon_step_entries' and policyname = 'players post their own walkathon steps') then
    create policy "players post their own walkathon steps" on public.walkathon_step_entries
      for all to authenticated
      using (public.can_post_walkathon_steps(walkathon_id, player_id))
      with check (public.can_post_walkathon_steps(walkathon_id, player_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'walkathon_step_entries' and policyname = 'admins manage walkathon steps') then
    create policy "admins manage walkathon steps" on public.walkathon_step_entries
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

-- Scoped to the new function above and nothing else. anon's auth.uid() is
-- null so it could only ever get false back, but there is no reason to offer.
revoke all on function public.can_post_walkathon_steps(uuid, uuid) from anon;
grant execute on function public.can_post_walkathon_steps(uuid, uuid) to authenticated;
