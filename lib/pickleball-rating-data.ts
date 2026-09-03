import type { SupabaseClient } from "@supabase/supabase-js";
import { matchSelect } from "./match-queries";
import type { RatingInput } from "./pickleball-rating";

/**
 * Loads every pickleball result in the club, which is what a rating has to be
 * built from -- one tournament in isolation would rate a player only against
 * whoever happened to be in that draw, and the number would move the moment a
 * new season started.
 *
 * Readable by any signed-in member (see the "authenticated read" policies), so
 * players see the same ratings as admins.
 */
export async function loadPickleballRatingInput(supabase: SupabaseClient, clubId: string): Promise<RatingInput> {
  const empty: RatingInput = { matches: [], matchSets: [], entries: [], teamMembers: [] };

  const tournaments = await supabase.from("tournaments").select("id").eq("club_id", clubId).eq("sport", "pickleball");
  if (tournaments.error) throw new Error(tournaments.error.message);
  const tournamentIds = (tournaments.data || []).map((row) => row.id as string);
  if (tournamentIds.length === 0) return empty;

  const divisions = await supabase.from("divisions").select("id").in("tournament_id", tournamentIds);
  if (divisions.error) throw new Error(divisions.error.message);
  const divisionIds = (divisions.data || []).map((row) => row.id as string);
  if (divisionIds.length === 0) return empty;

  const [matches, entries] = await Promise.all([
    supabase.from("matches").select(matchSelect).in("division_id", divisionIds),
    supabase.from("division_entries").select("id, division_id, label, player_id, team_id").in("division_id", divisionIds)
  ]);
  if (matches.error) throw new Error(matches.error.message);
  if (entries.error) throw new Error(entries.error.message);

  const matchRows = (matches.data || []) as unknown as RatingInput["matches"];
  const matchIds = matchRows.map((row) => row.id);

  const [matchSets, teamMembers] = await Promise.all([
    matchIds.length > 0
      ? supabase.from("match_sets").select("id, match_id, set_number, entry_a_score, entry_b_score").in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("team_members").select("team_id, player_id")
  ]);
  if (matchSets.error) throw new Error(matchSets.error.message);
  if (teamMembers.error) throw new Error(teamMembers.error.message);

  return {
    matches: matchRows,
    matchSets: (matchSets.data || []) as unknown as RatingInput["matchSets"],
    entries: (entries.data || []) as unknown as RatingInput["entries"],
    teamMembers: (teamMembers.data || []) as unknown as RatingInput["teamMembers"]
  };
}
