import type { SupabaseClient } from "@supabase/supabase-js";
import { matchSelect, matchSetSelect } from "./match-queries";
import type { DivisionFormat, MatchStatus, Sport, UserRole } from "./types";

/**
 * Thin, typed data-access layer for the admin workspace. Every function here
 * does exactly one Supabase call (or one obviously-related group of calls)
 * and throws a plain Error with the Postgres/PostgREST message on failure --
 * callers show `error.message` to the admin and stop, instead of the old
 * pattern of hand-rolling a `{data, error}` destructure at every call site.
 *
 * This file intentionally has zero React in it, so it's easy to test and easy
 * to read independent of any component.
 */

export type ClubRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

export type TournamentRow = {
  id: string;
  club_id: string;
  name: string;
  sport: Sport;
  start_date: string;
  end_date: string;
};

export type DivisionRow = {
  id: string;
  tournament_id: string;
  name: string;
  skill_level: string;
  format: DivisionFormat;
};

export type PlayerProfileRow = {
  id: string;
  club_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  mobile_number: string | null;
  rating: string | null;
  dupr_rating: string | null;
};

export type AppUserRow = {
  id: string;
  club_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  access_disabled: boolean;
};

export type TeamRow = {
  id: string;
  club_id: string;
  name: string;
};

export type TeamMemberRow = {
  team_id: string;
  player_id: string;
};

export type DivisionEntryRow = {
  id: string;
  division_id: string;
  label: string;
  player_id: string | null;
  team_id: string | null;
};

export type MatchRow = {
  id: string;
  division_id: string;
  round: number;
  round_label: string | null;
  entry_a_id: string;
  entry_b_id: string;
  target_score: number;
  number_of_sets: number;
  restrict_score_updates: boolean;
  score_update_before_days: number;
  score_update_after_days: number;
  allow_forfeit: boolean;
  forfeit_before_days: number;
  forfeit_after_days: number;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_start: string;
  extension_week_end: string;
  status: MatchStatus;
  winner_entry_id: string | null;
  forfeit_by_entry_id: string | null;
};

export type MatchSetRow = {
  id: string;
  match_id: string;
  set_number: number;
  entry_a_score: number;
  entry_b_score: number;
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function getCurrentAppUser(supabase: SupabaseClient) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, club_id, role, full_name, email, access_disabled")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error) fail(error, "Could not load your account.");
  return data as AppUserRow | null;
}

/**
 * Auto-activates a self-signed-up login: if the signed-in user's email
 * matches a player_profiles row an admin already added (unclaimed, or one
 * they're re-claiming after a partial failure), attaches it and creates
 * their public.users row -- no admin "Link Existing Login" step needed.
 * Entirely gated by RLS ("players claim own profile by email" and "players
 * self-provision after claiming a profile"): this can't grant access to
 * anyone the admin hasn't already pre-added by email, it's just doing from
 * the client what the database would allow anyway. Returns the resulting
 * account, or null if there's no matching profile to claim.
 */
export async function claimPlayerProfileIfEligible(supabase: SupabaseClient): Promise<AppUserRow | null> {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser?.email) return null;

  const { data: profile } = await supabase
    .from("player_profiles")
    .select("id, club_id, display_name, user_id")
    .eq("email", authUser.email)
    .or(`user_id.is.null,user_id.eq.${authUser.id}`)
    .maybeSingle();
  if (!profile) return null;

  // The users row must exist before player_profiles.user_id (a foreign key into
  // it) can be set, so create it first.
  let appUser = await getCurrentAppUser(supabase);
  if (!appUser) {
    const { data: created, error: insertError } = await supabase
      .from("users")
      .insert({
        id: authUser.id,
        club_id: profile.club_id,
        role: "player",
        full_name: profile.display_name,
        email: authUser.email,
        access_disabled: false
      })
      .select("id, club_id, role, full_name, email, access_disabled")
      .single();
    if (insertError) return null;
    appUser = created as AppUserRow;
  }

  if (!profile.user_id) {
    await supabase.from("player_profiles").update({ user_id: authUser.id }).eq("id", profile.id);
  }

  return appUser;
}

export async function getClub(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase.from("clubs").select("id, name, logo_url").eq("id", clubId).maybeSingle();
  if (error) fail(error, "Could not load the club.");
  return data as ClubRow | null;
}

const LOGO_BUCKET = "club-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Uploads a logo image to the public club-logos bucket and points clubs.logo_url at it, cache-busted so the header picks up the change immediately. */
export async function uploadClubLogo(supabase: SupabaseClient, clubId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, SVG, or WebP).");
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be under 2 MB.");

  const extension = file.name.split(".").pop() || "png";
  const path = `${clubId}/logo.${extension}`;

  const upload = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upload.error) fail(upload.error, "Could not upload the logo.");

  const { data: publicUrlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase.from("clubs").update({ logo_url: logoUrl }).eq("id", clubId);
  if (error) fail(error, "Could not save the logo.");

  return logoUrl;
}

export async function listTournaments(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, club_id, name, sport, start_date, end_date")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  if (error) fail(error, "Could not load tournaments.");
  return (data || []) as TournamentRow[];
}

/** Single tournament by id, not scoped to a club -- used by the public leaderboard page, which only has a tournament id from the URL. */
export async function getTournament(supabase: SupabaseClient, tournamentId: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, club_id, name, sport, start_date, end_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) fail(error, "Could not load the tournament.");
  return data as TournamentRow | null;
}

export async function createTournament(
  supabase: SupabaseClient,
  input: { clubId: string; name: string; sport: Sport; startDate: string; endDate: string; createdBy: string }
) {
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      club_id: input.clubId,
      name: input.name,
      sport: input.sport,
      start_date: input.startDate,
      end_date: input.endDate,
      created_by: input.createdBy
    })
    .select("id, club_id, name, sport, start_date, end_date")
    .single();
  if (error) fail(error, "Could not create the tournament.");
  return data as TournamentRow;
}

/** Deletes a tournament and everything under it (divisions, entries, matches, sets, forfeit claims cascade via the schema's FKs). */
export async function deleteTournament(supabase: SupabaseClient, tournamentId: string) {
  const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);
  if (error) fail(error, "Could not delete the tournament.");
}

export async function listDivisions(supabase: SupabaseClient, tournamentId: string) {
  const { data, error } = await supabase
    .from("divisions")
    .select("id, tournament_id, name, skill_level, format")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });
  if (error) fail(error, "Could not load divisions.");
  return (data || []) as DivisionRow[];
}

/** Same as listDivisions but across every tournament given -- used by the player workspace, since a player can be entered in divisions across multiple tournaments (different sports) at once. */
export async function listDivisionsForTournaments(supabase: SupabaseClient, tournamentIds: string[]) {
  if (tournamentIds.length === 0) return [] as DivisionRow[];
  const { data, error } = await supabase
    .from("divisions")
    .select("id, tournament_id, name, skill_level, format")
    .in("tournament_id", tournamentIds)
    .order("created_at", { ascending: true });
  if (error) fail(error, "Could not load divisions.");
  return (data || []) as DivisionRow[];
}

export async function createDivision(
  supabase: SupabaseClient,
  input: { tournamentId: string; name: string; skillLevel: string; format: DivisionFormat }
) {
  const { data, error } = await supabase
    .from("divisions")
    .insert({ tournament_id: input.tournamentId, name: input.name, skill_level: input.skillLevel, format: input.format })
    .select("id, tournament_id, name, skill_level, format")
    .single();
  if (error) fail(error, "Could not create the division.");
  return data as DivisionRow;
}

/** Deletes a division and everything under it (entries, matches, sets, forfeit claims cascade via the schema's FKs). */
export async function deleteDivision(supabase: SupabaseClient, divisionId: string) {
  const { error } = await supabase.from("divisions").delete().eq("id", divisionId);
  if (error) fail(error, "Could not delete the division.");
}

export async function listPlayers(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase
    .from("player_profiles")
    .select("id, club_id, user_id, display_name, email, mobile_number, rating, dupr_rating")
    .eq("club_id", clubId)
    .order("display_name", { ascending: true });
  if (error) fail(error, "Could not load players.");
  return (data || []) as PlayerProfileRow[];
}

export async function addPlayer(
  supabase: SupabaseClient,
  input: { clubId: string; displayName: string; email?: string; mobileNumber: string; rating: string; duprRating?: string }
) {
  const { data, error } = await supabase
    .from("player_profiles")
    .insert({
      club_id: input.clubId,
      display_name: input.displayName,
      email: input.email?.trim() || null,
      mobile_number: input.mobileNumber.trim() || null,
      rating: input.rating.trim() || null,
      dupr_rating: input.duprRating?.trim() || null
    })
    .select("id, club_id, user_id, display_name, email, mobile_number, rating, dupr_rating")
    .single();
  if (error) fail(error, "Could not add the player.");
  return data as PlayerProfileRow;
}

export async function updatePlayer(
  supabase: SupabaseClient,
  playerId: string,
  patch: { displayName: string; email?: string; mobileNumber: string; rating: string; duprRating?: string }
) {
  const { data, error } = await supabase
    .from("player_profiles")
    .update({
      display_name: patch.displayName,
      email: patch.email?.trim() || null,
      mobile_number: patch.mobileNumber.trim() || null,
      rating: patch.rating.trim() || null,
      dupr_rating: patch.duprRating?.trim() || null
    })
    .eq("id", playerId)
    .select("id, club_id, user_id, display_name, email, mobile_number, rating, dupr_rating")
    .single();
  if (error) fail(error, "Could not update the player.");
  return data as PlayerProfileRow;
}

/** True if the player currently holds a singles division entry or a doubles team seat anywhere in the club (not just the currently-loaded tournament), since deleting them would cascade-delete those entries and their matches. */
export async function isPlayerInUse(supabase: SupabaseClient, playerId: string) {
  const [entries, members] = await Promise.all([
    supabase.from("division_entries").select("id", { count: "exact", head: true }).eq("player_id", playerId),
    supabase.from("team_members").select("team_id", { count: "exact", head: true }).eq("player_id", playerId)
  ]);
  if (entries.error) fail(entries.error, "Could not check the player's division entries.");
  if (members.error) fail(members.error, "Could not check the player's team membership.");
  return (entries.count || 0) > 0 || (members.count || 0) > 0;
}

/** Deletes a player profile. Blocked by isPlayerInUse in the UI first -- division_entries.player_id and team_members.player_id both cascade-delete, which would silently wipe matches if the player is still on an active roster. */
export async function deletePlayer(supabase: SupabaseClient, playerId: string) {
  const { error } = await supabase.from("player_profiles").delete().eq("id", playerId);
  if (error) fail(error, "Could not delete the player.");
}

export async function listAppUsers(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, club_id, role, full_name, email, access_disabled")
    .eq("club_id", clubId)
    .order("full_name", { ascending: true });
  if (error) fail(error, "Could not load user accounts.");
  return (data || []) as AppUserRow[];
}

export async function updateUserRole(supabase: SupabaseClient, userId: string, role: UserRole) {
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);
  if (error) fail(error, "Could not update the role.");
}

export async function toggleUserAccess(supabase: SupabaseClient, userId: string, accessDisabled: boolean) {
  const { error } = await supabase.from("users").update({ access_disabled: accessDisabled }).eq("id", userId);
  if (error) fail(error, "Could not update account access.");
}

export async function linkUserToPlayer(supabase: SupabaseClient, input: { userId: string; playerProfileId: string; clubId: string }) {
  // Enforce a 1:1 user<->player-profile link by clearing any existing link first.
  const unlink = await supabase.from("player_profiles").update({ user_id: null }).eq("user_id", input.userId);
  if (unlink.error) fail(unlink.error, "Could not update the existing profile link.");

  const relink = await supabase
    .from("player_profiles")
    .update({ user_id: input.userId })
    .eq("id", input.playerProfileId)
    .eq("club_id", input.clubId);
  if (relink.error) fail(relink.error, "Could not link the profile.");
}

export async function listTeams(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase.from("teams").select("id, club_id, name").eq("club_id", clubId).order("name", { ascending: true });
  if (error) fail(error, "Could not load teams.");
  return (data || []) as TeamRow[];
}

/**
 * Creates a doubles team and its two members as one logical operation. If the
 * member insert fails after the team row was created, we best-effort delete
 * the orphaned team row instead of leaving it dangling (the old app left
 * these orphans on partial failure).
 */
export async function createTeam(supabase: SupabaseClient, input: { clubId: string; name: string; playerAId: string; playerBId: string }) {
  const team = await supabase.from("teams").insert({ club_id: input.clubId, name: input.name }).select("id, club_id, name").single();
  if (team.error) fail(team.error, "Could not create the team.");

  const teamRow = team.data as TeamRow;
  const members = await supabase.from("team_members").insert([
    { team_id: teamRow.id, player_id: input.playerAId },
    { team_id: teamRow.id, player_id: input.playerBId }
  ]);

  if (members.error) {
    await supabase.from("teams").delete().eq("id", teamRow.id);
    fail(members.error, "Could not add players to the team.");
  }

  return teamRow;
}

export async function listTeamMembers(supabase: SupabaseClient, teamIds: string[]) {
  if (teamIds.length === 0) return [] as TeamMemberRow[];
  const { data, error } = await supabase.from("team_members").select("team_id, player_id").in("team_id", teamIds);
  if (error) fail(error, "Could not load team rosters.");
  return (data || []) as TeamMemberRow[];
}

/** Swaps one player out of a doubles team for another (e.g. an injury replacement mid-tournament). The team id -- and every division entry / match that references it -- stays the same. */
export async function replaceTeamMember(supabase: SupabaseClient, teamId: string, oldPlayerId: string, newPlayerId: string) {
  const insert = await supabase.from("team_members").insert({ team_id: teamId, player_id: newPlayerId });
  if (insert.error) fail(insert.error, "Could not add the replacement player to the team.");

  const remove = await supabase.from("team_members").delete().eq("team_id", teamId).eq("player_id", oldPlayerId);
  if (remove.error) fail(remove.error, "Could not remove the outgoing player from the team.");
}

export async function listDivisionEntries(supabase: SupabaseClient, divisionIds: string[]) {
  if (divisionIds.length === 0) return [] as DivisionEntryRow[];
  const { data, error } = await supabase
    .from("division_entries")
    .select("id, division_id, label, player_id, team_id")
    .in("division_id", divisionIds)
    .order("label", { ascending: true });
  if (error) fail(error, "Could not load division entries.");
  return (data || []) as DivisionEntryRow[];
}

export async function insertDivisionEntries(
  supabase: SupabaseClient,
  rows: Array<{ division_id: string; label: string; player_id?: string; team_id?: string }>
) {
  if (rows.length === 0) return [] as DivisionEntryRow[];
  const { data, error } = await supabase.from("division_entries").insert(rows).select("id, division_id, label, player_id, team_id");
  if (error) fail(error, "Could not save division entries.");
  return (data || []) as DivisionEntryRow[];
}

/** Swaps the player behind a singles division entry (e.g. an injury replacement mid-tournament). Existing and future matches for this entry carry over unchanged since they reference the entry id, not the player id. */
export async function replaceDivisionEntryPlayer(supabase: SupabaseClient, entryId: string, newPlayerId: string, newLabel: string) {
  const { error } = await supabase.from("division_entries").update({ player_id: newPlayerId, label: newLabel }).eq("id", entryId);
  if (error) fail(error, "Could not replace the player.");
}

export async function listMatches(supabase: SupabaseClient, divisionIds: string[]) {
  if (divisionIds.length === 0) return [] as MatchRow[];
  const { data, error } = await supabase
    .from("matches")
    .select(matchSelect)
    .in("division_id", divisionIds)
    .order("schedule_week_start", { ascending: true })
    .order("round", { ascending: true });
  if (error) fail(error, "Could not load matches.");
  return (data || []) as unknown as MatchRow[];
}

/**
 * Auto-cancels matches that were never played once their extension week has
 * ended, using each match's own admin-configured schedule dates. This app
 * has no server-side cron, so this runs opportunistically whenever matches
 * are loaded (admin workspace, player schedule) instead. A bulk update with
 * RLS is safe to call from either context: rows the caller isn't allowed to
 * touch are silently excluded rather than erroring, so a player triggers it
 * only for their own matches while an admin covers everything loaded.
 */
export async function reconcileExpiredMatches(supabase: SupabaseClient, matches: MatchRow[], today: string) {
  const expiredIds = matches
    .filter((match) => (match.status === "scheduled" || match.status === "score_submitted") && match.extension_week_end < today)
    .map((match) => match.id);
  if (expiredIds.length === 0) return matches;

  const { data, error } = await supabase.from("matches").update({ status: "cancelled" }).in("id", expiredIds).select(matchSelect);
  if (error || !data) return matches;

  const updatedById = new Map((data as unknown as MatchRow[]).map((match) => [match.id, match]));
  return matches.map((match) => updatedById.get(match.id) || match);
}

export async function listMatchSets(supabase: SupabaseClient, matchIds: string[]) {
  if (matchIds.length === 0) return [] as MatchSetRow[];
  const { data, error } = await supabase.from("match_sets").select(matchSetSelect).in("match_id", matchIds).order("set_number", { ascending: true });
  if (error) fail(error, "Could not load match scores.");
  return (data || []) as unknown as MatchSetRow[];
}

export type NewMatchRow = {
  division_id: string;
  round: number;
  round_label?: string;
  entry_a_id: string;
  entry_b_id: string;
  target_score: number;
  number_of_sets: number;
  restrict_score_updates: boolean;
  score_update_before_days: number;
  score_update_after_days: number;
  allow_forfeit: boolean;
  forfeit_before_days: number;
  forfeit_after_days: number;
  schedule_week_start: string;
  schedule_week_end: string;
  extension_week_start: string;
  extension_week_end: string;
  status: "scheduled";
};

export async function insertMatches(supabase: SupabaseClient, rows: NewMatchRow[]) {
  const { data, error } = await supabase.from("matches").insert(rows).select(matchSelect);
  if (error) fail(error, "Could not save the generated schedule.");
  return (data || []) as unknown as MatchRow[];
}

export async function deleteMatches(supabase: SupabaseClient, matchIds: string[]) {
  if (matchIds.length === 0) return;
  const { error } = await supabase.from("matches").delete().in("id", matchIds);
  if (error) fail(error, "Schedule was saved, but the previous matches could not be removed.");
}

/** Bulk-corrects target score / number of sets across every match already generated for a division, e.g. fixing a typo made while setting up the schedule -- without touching entries, dates, status, or any already-recorded scores. */
export async function updateDivisionMatchSettings(
  supabase: SupabaseClient,
  divisionId: string,
  patch: Partial<{ target_score: number; number_of_sets: number }>
) {
  const { error } = await supabase.from("matches").update(patch).eq("division_id", divisionId);
  if (error) fail(error, "Could not update the match settings.");
}

export async function replaceMatchSets(supabase: SupabaseClient, matchId: string, sets: Array<{ setNumber: number; entryAScore: number; entryBScore: number }>) {
  const cleared = await supabase.from("match_sets").delete().eq("match_id", matchId);
  if (cleared.error) fail(cleared.error, "Could not clear the previous score.");

  if (sets.length === 0) return;
  const inserted = await supabase.from("match_sets").insert(
    sets.map((set) => ({ match_id: matchId, set_number: set.setNumber, entry_a_score: set.entryAScore, entry_b_score: set.entryBScore }))
  );
  if (inserted.error) fail(inserted.error, "Could not save the score.");
}

export async function updateMatch(
  supabase: SupabaseClient,
  matchId: string,
  patch: Partial<{
    round_label: string | null;
    target_score: number;
    schedule_week_start: string;
    schedule_week_end: string;
    extension_week_start: string;
    extension_week_end: string;
    status: MatchStatus;
    winner_entry_id: string | null;
    forfeit_by_entry_id: string | null;
  }>
) {
  const { data, error } = await supabase.from("matches").update(patch).eq("id", matchId).select(matchSelect).single();
  if (error) fail(error, "Could not save the match.");
  return data as unknown as MatchRow;
}

export async function insertForfeitClaim(
  supabase: SupabaseClient,
  input: { matchId: string; claimedByEntryId: string; opponentEntryId: string; createdBy: string }
) {
  const { error } = await supabase.from("forfeit_claims").insert({
    match_id: input.matchId,
    claimed_by_entry_id: input.claimedByEntryId,
    opponent_entry_id: input.opponentEntryId,
    created_by: input.createdBy
  });
  if (error) fail(error, "Could not record the forfeit.");
}

export type StandingRow = {
  division_id: string;
  entry_id: string;
  played: number;
  wins: number;
  losses: number;
  forfeits_won: number;
  forfeits_lost: number;
  cancelled: number;
  points: number;
};

export async function listStandings(supabase: SupabaseClient, divisionIds: string[]) {
  if (divisionIds.length === 0) return [] as StandingRow[];
  const { data, error } = await supabase
    .from("standings")
    .select("division_id, entry_id, played, wins, losses, forfeits_won, forfeits_lost, cancelled, points")
    .in("division_id", divisionIds);
  if (error) fail(error, "Could not load standings.");
  return (data || []) as StandingRow[];
}
