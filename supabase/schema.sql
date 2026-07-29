-- SCAF League schema.
--
-- Unlike the previous version of this app, every column below is created up
-- front in a single migration. The old schema shipped in pieces (see the
-- add-*.sql files this replaces) which forced the application code to guess
-- at runtime whether a given column existed yet. Run this once against a
-- fresh Supabase project and the app never has to special-case schema drift.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'player');
create type public.sport_type as enum ('pickleball', 'badminton', 'tennis', 'volleyball');
create type public.division_format as enum ('singles', 'doubles');
create type public.registration_status as enum ('pending', 'approved', 'declined');
create type public.match_status as enum ('scheduled', 'score_submitted', 'completed', 'forfeit', 'cancelled');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  points_per_win integer not null default 4,
  points_per_played_loss integer not null default 1,
  bonus_point_per_set_won_when_lost integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  role public.user_role not null default 'player',
  full_name text not null,
  email text not null,
  access_disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  display_name text not null,
  email text,
  mobile_number text,
  rating text,
  dupr_rating text,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  sport public.sport_type not null,
  start_date date not null,
  end_date date not null,
  logo_url text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  skill_level text not null,
  format public.division_format not null,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  primary key (team_id, player_id)
);

create table public.division_entries (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  label text not null,
  player_id uuid references public.player_profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((player_id is not null and team_id is null) or (player_id is null and team_id is not null))
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  status public.registration_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (division_id, player_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  round integer not null check (round > 0),
  round_label text,
  entry_a_id uuid not null references public.division_entries(id) on delete cascade,
  entry_b_id uuid not null references public.division_entries(id) on delete cascade,
  target_score integer not null default 11 check (target_score > 0),
  number_of_sets integer not null default 3 check (number_of_sets > 0),
  restrict_score_updates boolean not null default false,
  score_update_before_days integer not null default 0 check (score_update_before_days >= 0),
  score_update_after_days integer not null default 0 check (score_update_after_days >= 0),
  allow_forfeit boolean not null default true,
  forfeit_before_days integer not null default 0 check (forfeit_before_days >= 0),
  forfeit_after_days integer not null default 0 check (forfeit_after_days >= 0),
  schedule_week_start date not null,
  schedule_week_end date not null,
  extension_week_start date not null,
  extension_week_end date not null,
  status public.match_status not null default 'scheduled',
  winner_entry_id uuid references public.division_entries(id),
  forfeit_by_entry_id uuid references public.division_entries(id),
  created_at timestamptz not null default now(),
  check (entry_a_id <> entry_b_id),
  check (schedule_week_end >= schedule_week_start),
  check (extension_week_start > schedule_week_end),
  check (extension_week_end >= extension_week_start)
);

create table public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number integer not null check (set_number between 1 and 3),
  entry_a_score integer not null check (entry_a_score >= 0),
  entry_b_score integer not null check (entry_b_score >= 0),
  unique (match_id, set_number)
);

create table public.forfeit_claims (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  claimed_by_entry_id uuid not null references public.division_entries(id) on delete cascade,
  opponent_entry_id uuid not null references public.division_entries(id) on delete cascade,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (match_id, claimed_by_entry_id)
);

create view public.standings as
with set_counts as (
  select
    m.id as match_id,
    sum(case when ms.entry_a_score > ms.entry_b_score then 1 else 0 end) as a_sets,
    sum(case when ms.entry_b_score > ms.entry_a_score then 1 else 0 end) as b_sets
  from public.matches m
  left join public.match_sets ms on ms.match_id = m.id
  group by m.id
),
match_points as (
  select
    m.division_id,
    e.id as entry_id,
    case when m.status in ('completed', 'score_submitted') then 1 else 0 end as played,
    case when m.winner_entry_id = e.id then 1 else 0 end as wins,
    case when m.status in ('completed', 'score_submitted') and m.winner_entry_id <> e.id then 1 else 0 end as losses,
    case when m.status = 'forfeit' and m.winner_entry_id = e.id then 1 else 0 end as forfeits_won,
    case when m.status = 'forfeit' and m.winner_entry_id <> e.id then 1 else 0 end as forfeits_lost,
    case when m.status = 'cancelled' then 1 else 0 end as cancelled,
    case
      when m.status = 'forfeit' and m.winner_entry_id = e.id then c.points_per_win
      when m.status in ('completed', 'score_submitted') and m.winner_entry_id = e.id then c.points_per_win
      when m.status in ('completed', 'score_submitted') and m.winner_entry_id <> e.id then
        c.points_per_played_loss + case
          when e.id = m.entry_a_id and sc.a_sets > 0 then c.bonus_point_per_set_won_when_lost
          when e.id = m.entry_b_id and sc.b_sets > 0 then c.bonus_point_per_set_won_when_lost
          else 0
        end
      else 0
    end as points
  from public.matches m
  join set_counts sc on sc.match_id = m.id
  join public.division_entries e on e.id in (m.entry_a_id, m.entry_b_id)
  join public.divisions d on d.id = m.division_id
  join public.tournaments t on t.id = d.tournament_id
  join public.clubs c on c.id = t.club_id
)
select
  division_id,
  entry_id,
  sum(played)::integer as played,
  sum(wins)::integer as wins,
  sum(losses)::integer as losses,
  sum(forfeits_won)::integer as forfeits_won,
  sum(forfeits_lost)::integer as forfeits_lost,
  sum(cancelled)::integer as cancelled,
  sum(points)::integer as points
from match_points
group by division_id, entry_id;

create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.users where id = auth.uid() and role = 'admin' and access_disabled = false);
$$;

create function public.is_entry_member(entry uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.division_entries de
    left join public.player_profiles pp on pp.id = de.player_id
    left join public.team_members tm on tm.team_id = de.team_id
    left join public.player_profiles tpp on tpp.id = tm.player_id
    where de.id = entry
      and (pp.user_id = auth.uid() or tpp.user_id = auth.uid())
  );
$$;

/**
 * Deletes a login (auth user) on an admin's behalf. This app is a static
 * export with no server runtime to hold a service_role key, so the privileged
 * work lives here instead -- SECURITY DEFINER bypasses RLS, hence the explicit
 * admin / same-club / not-yourself checks below.
 */
create function public.delete_user_login(target_user_id uuid)
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

  -- Unlink the player profile first: player_profiles.user_id and public.users.id
  -- both cascade on delete, so deleting the auth user directly would wipe the
  -- profile, its division entries, and every match those entries appear in.
  update public.player_profiles set user_id = null where user_id = target_user_id;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_login(uuid) from public;
revoke all on function public.delete_user_login(uuid) from anon;
grant execute on function public.delete_user_login(uuid) to authenticated;

alter table public.clubs enable row level security;
alter table public.users enable row level security;
alter table public.player_profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.divisions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.division_entries enable row level security;
alter table public.registrations enable row level security;
alter table public.matches enable row level security;
alter table public.match_sets enable row level security;
alter table public.forfeit_claims enable row level security;

create policy "admins manage clubs" on public.clubs for all using (public.is_admin()) with check (public.is_admin());
create policy "anyone can read club branding" on public.clubs for select using (true);
create policy "users read own account" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "admins manage users" on public.users for all using (public.is_admin()) with check (public.is_admin());
-- Lets a freshly self-signed-up auth user create their own public.users row, gated
-- entirely by an admin having already pre-added this exact email as a player (an
-- unclaimed profile, or one this same user already claimed on a prior attempt) --
-- role is always forced to 'player'. This must run BEFORE the player_profiles claim
-- below, not after: player_profiles.user_id is a foreign key into this table, so the
-- claim update would otherwise violate that constraint.
create policy "players self-provision after claiming a profile" on public.users for insert to authenticated with check (
  id = auth.uid()
  and role = 'player'
  and access_disabled = false
  and exists (select 1 from public.player_profiles where email = auth.jwt() ->> 'email' and (user_id is null or user_id = auth.uid()))
);

create policy "authenticated read league data" on public.player_profiles for select to authenticated using (true);
create policy "admins manage player profiles" on public.player_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "players update own profile" on public.player_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Lets a self-signed-up auth user claim an unclaimed player profile whose email an
-- admin already entered (via Add User And Player or bulk import), or reclaim one
-- they already own -- the actual entry point into the club is still admin-controlled
-- since it requires that pre-existing email match.
create policy "players claim own profile by email" on public.player_profiles for update using (
  email = auth.jwt() ->> 'email' and (user_id is null or user_id = auth.uid())
) with check (user_id = auth.uid());

create policy "authenticated read tournaments" on public.tournaments for select to authenticated using (true);
create policy "anyone can read tournaments for the public leaderboard" on public.tournaments for select to anon using (true);
create policy "admins manage tournaments" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read divisions" on public.divisions for select to authenticated using (true);
create policy "anyone can read divisions for the public leaderboard" on public.divisions for select to anon using (true);
create policy "admins manage divisions" on public.divisions for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read teams" on public.teams for select to authenticated using (true);
create policy "admins manage teams" on public.teams for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read team members" on public.team_members for select to authenticated using (true);
create policy "admins manage team members" on public.team_members for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read division entries" on public.division_entries for select to authenticated using (true);
create policy "anyone can read division entries for the public leaderboard" on public.division_entries for select to anon using (true);
create policy "admins manage division entries" on public.division_entries for all using (public.is_admin()) with check (public.is_admin());

create policy "players create registrations" on public.registrations for insert to authenticated with check (
  exists(select 1 from public.player_profiles where id = player_id and user_id = auth.uid())
);
create policy "players read registrations" on public.registrations for select to authenticated using (true);
create policy "admins manage registrations" on public.registrations for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read matches" on public.matches for select to authenticated using (true);
create policy "admins manage matches" on public.matches for all using (public.is_admin()) with check (public.is_admin());
create policy "players update own match scores" on public.matches for update using (
  public.is_entry_member(entry_a_id) or public.is_entry_member(entry_b_id)
) with check (
  public.is_entry_member(entry_a_id) or public.is_entry_member(entry_b_id)
);

create policy "authenticated read match sets" on public.match_sets for select to authenticated using (true);
create policy "admins manage match sets" on public.match_sets for all using (public.is_admin()) with check (public.is_admin());
create policy "players insert match sets for own matches" on public.match_sets for insert to authenticated with check (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and (public.is_entry_member(m.entry_a_id) or public.is_entry_member(m.entry_b_id))
  )
);

create policy "authenticated read forfeit claims" on public.forfeit_claims for select to authenticated using (true);
create policy "players claim own forfeits" on public.forfeit_claims for insert to authenticated with check (
  public.is_entry_member(claimed_by_entry_id)
  and exists (
    select 1 from public.matches m
    where m.id = match_id
      and m.status in ('scheduled', 'score_submitted')
      and current_date between m.schedule_week_start and m.schedule_week_end
      and claimed_by_entry_id in (m.entry_a_id, m.entry_b_id)
      and opponent_entry_id in (m.entry_a_id, m.entry_b_id)
      and claimed_by_entry_id <> opponent_entry_id
  )
);
create policy "admins manage forfeit claims" on public.forfeit_claims for all using (public.is_admin()) with check (public.is_admin());

-- Public storage bucket for the club logo shown in the app header. Public so the logo
-- renders without an auth header on every page, including the logged-out login screen.
insert into storage.buckets (id, name, public) values ('club-logos', 'club-logos', true)
on conflict (id) do nothing;

create policy "anyone can view club logos" on storage.objects for select using (bucket_id = 'club-logos');
create policy "admins manage club logos" on storage.objects for all
  using (bucket_id = 'club-logos' and public.is_admin())
  with check (bucket_id = 'club-logos' and public.is_admin());
