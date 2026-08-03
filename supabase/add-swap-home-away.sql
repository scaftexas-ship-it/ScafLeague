-- Lets an admin swap which side of a match is home. Run once in the Supabase
-- SQL Editor. Safe to re-run.
--
-- Why an RPC and not two client updates: swapping entry_a_id/entry_b_id also
-- has to swap match_sets.entry_a_score/entry_b_score, because set scores are
-- stored positionally. Done as two separate PostgREST calls, a failure between
-- them would leave the sides swapped but the scores not -- silently inverting
-- a recorded result. Inside one function it is a single transaction.
--
-- winner_entry_id and forfeit_by_entry_id deliberately are NOT touched: they
-- reference the division entry itself, not the side it sits on, so they stay
-- correct through a swap.

create or replace function public.swap_match_home_away(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_home uuid;
  old_away uuid;
  match_club uuid;
  caller_club uuid;
begin
  if not public.is_admin() then
    raise exception 'Only enabled admins can change home and away.';
  end if;

  select m.entry_a_id, m.entry_b_id, t.club_id
    into old_home, old_away, match_club
    from public.matches m
    join public.divisions d on d.id = m.division_id
    join public.tournaments t on t.id = d.tournament_id
   where m.id = target_match_id;

  if old_home is null then
    raise exception 'Match not found.';
  end if;

  select club_id into caller_club from public.users where id = auth.uid();
  if match_club is distinct from caller_club then
    raise exception 'That match is not in your club.';
  end if;

  update public.matches
     set entry_a_id = old_away, entry_b_id = old_home
   where id = target_match_id;

  -- Postgres evaluates the right-hand sides against the pre-update row, so this
  -- genuinely exchanges the two columns rather than copying one over the other.
  update public.match_sets
     set entry_a_score = entry_b_score,
         entry_b_score = entry_a_score
   where match_id = target_match_id;
end;
$$;

revoke all on function public.swap_match_home_away(uuid) from public;
revoke all on function public.swap_match_home_away(uuid) from anon;
grant execute on function public.swap_match_home_away(uuid) to authenticated;
