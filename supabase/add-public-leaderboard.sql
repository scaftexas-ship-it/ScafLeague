-- Allows anyone with a tournament's leaderboard link to view it without
-- signing in. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- The public.standings view already bypasses RLS on its underlying tables
-- (matches/match_sets) because it's owned by a role with BYPASSRLS, so it's
-- already readable by the anon role today -- these policies only add the
-- missing piece: tournament names, division names, and entry labels
-- (player/team display names, never emails or phone numbers) so the
-- standings numbers can actually be shown with names attached.
--
-- Deliberately NOT touched: player_profiles, users, matches, match_sets,
-- teams, team_members, registrations, forfeit_claims -- none of those are
-- needed to render a leaderboard, and some contain contact info that must
-- stay behind authentication.

drop policy if exists "anyone can read tournaments for the public leaderboard" on public.tournaments;
create policy "anyone can read tournaments for the public leaderboard" on public.tournaments for select to anon using (true);

drop policy if exists "anyone can read divisions for the public leaderboard" on public.divisions;
create policy "anyone can read divisions for the public leaderboard" on public.divisions for select to anon using (true);

drop policy if exists "anyone can read division entries for the public leaderboard" on public.division_entries;
create policy "anyone can read division entries for the public leaderboard" on public.division_entries for select to anon using (true);
