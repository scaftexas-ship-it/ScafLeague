import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerProfileRow } from "./admin-data";

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

/** All player_profiles linked to a given auth user (normally zero or one). */
export async function listPlayerProfilesForUser(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("player_profiles")
    .select("id, club_id, user_id, display_name, email, mobile_number, rating")
    .eq("user_id", userId);
  if (error) fail(error, "Could not load your player profile.");
  return (data || []) as PlayerProfileRow[];
}

/** Every division_entries row whose player_id is one of the given player-profile ids. */
export async function listEntriesForPlayerIds(supabase: SupabaseClient, playerIds: string[]) {
  if (playerIds.length === 0) return [] as Array<{ id: string; division_id: string; label: string; player_id: string | null; team_id: string | null }>;
  const { data, error } = await supabase.from("division_entries").select("id, division_id, label, player_id, team_id").in("player_id", playerIds);
  if (error) fail(error, "Could not load your division entries.");
  return data || [];
}

/** Team ids that any of the given player-profile ids belong to. */
export async function listTeamIdsForPlayerIds(supabase: SupabaseClient, playerIds: string[]) {
  if (playerIds.length === 0) return [] as string[];
  const { data, error } = await supabase.from("team_members").select("team_id").in("player_id", playerIds);
  if (error) fail(error, "Could not load your team memberships.");
  return Array.from(new Set((data || []).map((row) => row.team_id as string)));
}

/** Every division_entries row for the given team ids. */
export async function listEntriesForTeamIds(supabase: SupabaseClient, teamIds: string[]) {
  if (teamIds.length === 0) return [] as Array<{ id: string; division_id: string; label: string; player_id: string | null; team_id: string | null }>;
  const { data, error } = await supabase.from("division_entries").select("id, division_id, label, player_id, team_id").in("team_id", teamIds);
  if (error) fail(error, "Could not load your team's division entries.");
  return data || [];
}

/** All player profiles in a club, used to resolve opponent contact info. */
export async function listAllPlayersInClub(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase.from("player_profiles").select("id, club_id, user_id, display_name, email, mobile_number, rating").eq("club_id", clubId);
  if (error) fail(error, "Could not load the player directory.");
  return (data || []) as PlayerProfileRow[];
}
