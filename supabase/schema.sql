create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'player');
create type public.sport_type as enum ('pickleball', 'badminton', 'tennis', 'volleyball');
create type public.division_format as enum ('singles', 'doubles');
create type public.registration_status as enum ('pending', 'approved', 'declined');
create type public.match_status as enum ('scheduled', 'score_submitted', 'completed', 'forfeit', 'cancelled');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  role public.user_role not null default 'player',
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  display_name text not null,
  rating text,
  created_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  sport public.sport_type not null,
  start_date date not null,
  end_date date not null,
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
  entry_a_id uuid not null references public.division_entries(id) on delete cascade,
  entry_b_id uuid not null references public.division_entries(id) on delete cascade,
  target_score integer not null default 11 check (target_score > 0),
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
      when m.status = 'forfeit' and m.winner_entry_id = e.id then 4
      when m.status in ('completed', 'score_submitted') and m.winner_entry_id = e.id then 4
      when m.status in ('completed', 'score_submitted') and m.winner_entry_id <> e.id then
        1 + case
          when e.id = m.entry_a_id and sc.a_sets > 0 then 1
          when e.id = m.entry_b_id and sc.b_sets > 0 then 1
          else 0
        end
      else 0
    end as points
  from public.matches m
  join set_counts sc on sc.match_id = m.id
  join public.division_entries e on e.id in (m.entry_a_id, m.entry_b_id)
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
  select exists(select 1 from public.users where id = auth.uid() and role = 'admin');
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
create policy "users read own account" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "admins manage users" on public.users for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read league data" on public.player_profiles for select to authenticated using (true);
create policy "admins manage player profiles" on public.player_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "players update own profile" on public.player_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "authenticated read tournaments" on public.tournaments for select to authenticated using (true);
create policy "admins manage tournaments" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read divisions" on public.divisions for select to authenticated using (true);
create policy "admins manage divisions" on public.divisions for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read teams" on public.teams for select to authenticated using (true);
create policy "admins manage teams" on public.teams for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read team members" on public.team_members for select to authenticated using (true);
create policy "admins manage team members" on public.team_members for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read division entries" on public.division_entries for select to authenticated using (true);
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
