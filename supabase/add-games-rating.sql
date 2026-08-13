-- Adds games won / games lost to the standings view so the leaderboard's
-- rating column can be "games won / games played" instead of "matches won /
-- matches played". Run once in the Supabase SQL Editor. Safe to re-run.
--
-- A "game" here is the number typed into a set column: 6-4 in tennis is six
-- games to four, 11-5 in pickleball is eleven points to five. Expressing the
-- rating as a ratio keeps the four sports comparable even though their raw
-- numbers differ wildly -- 6-4, 6-4 and 11-5, 11-7 both land near .60.
--
-- NOTHING about scoring changes. points_per_win, points_per_played_loss and
-- bonus_point_per_set_won_when_lost still drive the points column exactly as
-- before; this only adds two new columns alongside it.

create or replace view public.standings as
with set_counts as (
  select
    m.id as match_id,
    sum(case when ms.entry_a_score > ms.entry_b_score then 1 else 0 end) as a_sets,
    sum(case when ms.entry_b_score > ms.entry_a_score then 1 else 0 end) as b_sets,
    coalesce(sum(ms.entry_a_score), 0) as a_games,
    coalesce(sum(ms.entry_b_score), 0) as b_games
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
    -- A forfeit has no set scores, so it contributes no games either way. The
    -- rating stays a measure of what was actually played on court.
    case
      when m.status in ('completed', 'score_submitted') then
        case when e.id = m.entry_a_id then sc.a_games else sc.b_games end
      else 0
    end as games_won,
    case
      when m.status in ('completed', 'score_submitted') then
        case when e.id = m.entry_a_id then sc.b_games else sc.a_games end
      else 0
    end as games_lost,
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
  sum(games_won)::integer as games_won,
  sum(games_lost)::integer as games_lost,
  sum(points)::integer as points
from match_points
group by division_id, entry_id;
