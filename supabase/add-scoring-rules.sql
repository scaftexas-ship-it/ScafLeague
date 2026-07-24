-- Makes the standings scoring rules (points for a win / played loss / bonus
-- point for winning a set while losing) editable per club instead of the
-- hardcoded 4 / 1 / 1 baked into the standings view. Run once in the
-- Supabase SQL Editor. Safe to re-run (every statement is idempotent).
--
-- The public.standings view is what every leaderboard/standings display
-- actually reads (see schema.sql) -- lib/league-rules.ts's calculateStandings
-- is a separate client-side copy used only for bracket-seeding preview, kept
-- in sync by threading the same club rules through as a parameter.

alter table public.clubs add column if not exists points_per_win integer not null default 4;
alter table public.clubs add column if not exists points_per_played_loss integer not null default 1;
alter table public.clubs add column if not exists bonus_point_per_set_won_when_lost integer not null default 1;

create or replace view public.standings as
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
