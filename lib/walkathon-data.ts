import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data access for the walkathon, in the same shape as admin-data.ts: one
 * Supabase call per function, throwing a plain Error carrying the Postgres
 * message so callers can show it and stop.
 *
 * Writes here look unguarded on purpose -- there is no "am I allowed" check in
 * this file. The rules live in RLS (see add-walkathon.sql): you can only write
 * rows for your own registered player profile, and the database rejects
 * anything that would double count a week. This app is a static export with no
 * server to enforce it in between, so the policy IS the enforcement.
 */

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export type WalkathonRow = {
  id: string;
  club_id: string;
  name: string;
  start_date: string;
  end_date: string;
};

export type WalkathonParticipantRow = {
  id: string;
  walkathon_id: string;
  player_id: string;
};

export type WalkathonStepEntryRow = {
  id: string;
  walkathon_id: string;
  player_id: string;
  entry_date: string;
  covers_week: boolean;
  steps: number;
};

const walkathonSelect = "id, club_id, name, start_date, end_date";
const entrySelect = "id, walkathon_id, player_id, entry_date, covers_week, steps";

export async function listWalkathons(supabase: SupabaseClient, clubId: string) {
  const { data, error } = await supabase
    .from("walkathons")
    .select(walkathonSelect)
    .eq("club_id", clubId)
    .order("start_date", { ascending: false });
  if (error) fail(error, "Could not load walkathons.");
  return (data || []) as WalkathonRow[];
}

export async function createWalkathon(
  supabase: SupabaseClient,
  input: { clubId: string; name: string; startDate: string; endDate: string }
) {
  const { data, error } = await supabase
    .from("walkathons")
    .insert({ club_id: input.clubId, name: input.name.trim(), start_date: input.startDate, end_date: input.endDate })
    .select(walkathonSelect)
    .single();
  if (error) fail(error, "Could not create the walkathon.");
  return data as WalkathonRow;
}

export async function updateWalkathon(
  supabase: SupabaseClient,
  walkathonId: string,
  patch: { name: string; startDate: string; endDate: string }
) {
  const { error } = await supabase
    .from("walkathons")
    .update({ name: patch.name.trim(), start_date: patch.startDate, end_date: patch.endDate })
    .eq("id", walkathonId);
  if (error) fail(error, "Could not update the walkathon.");
}

export async function deleteWalkathon(supabase: SupabaseClient, walkathonId: string) {
  const { error } = await supabase.from("walkathons").delete().eq("id", walkathonId);
  if (error) fail(error, "Could not delete the walkathon.");
}

export async function listParticipants(supabase: SupabaseClient, walkathonId: string) {
  const { data, error } = await supabase
    .from("walkathon_participants")
    .select("id, walkathon_id, player_id")
    .eq("walkathon_id", walkathonId);
  if (error) fail(error, "Could not load who is registered.");
  return (data || []) as WalkathonParticipantRow[];
}

export async function registerParticipants(supabase: SupabaseClient, walkathonId: string, playerIds: string[]) {
  if (playerIds.length === 0) return;
  const { error } = await supabase
    .from("walkathon_participants")
    .upsert(
      playerIds.map((playerId) => ({ walkathon_id: walkathonId, player_id: playerId })),
      { onConflict: "walkathon_id,player_id", ignoreDuplicates: true }
    );
  if (error) fail(error, "Could not register those players.");
}

export async function removeParticipant(supabase: SupabaseClient, walkathonId: string, playerId: string) {
  const { error } = await supabase
    .from("walkathon_participants")
    .delete()
    .eq("walkathon_id", walkathonId)
    .eq("player_id", playerId);
  if (error) fail(error, "Could not remove that player.");
}

export async function listStepEntries(supabase: SupabaseClient, walkathonId: string) {
  const { data, error } = await supabase
    .from("walkathon_step_entries")
    .select(entrySelect)
    .eq("walkathon_id", walkathonId)
    .order("entry_date", { ascending: false });
  if (error) fail(error, "Could not load step entries.");
  return (data || []) as WalkathonStepEntryRow[];
}

/**
 * Posts one step entry, correcting the number if that day or week was already
 * posted rather than stacking a second row on top.
 *
 * Done as look-then-write instead of upsert on purpose. The uniqueness rules
 * are PARTIAL indexes (one per day where not covers_week, one per week where
 * covers_week), and Postgres will not use a partial index for ON CONFLICT
 * unless the statement repeats the index predicate -- which PostgREST gives no
 * way to express. Upserting failed outright with "no unique or exclusion
 * constraint matching the ON CONFLICT specification".
 *
 * The lookup matches covers_week as well as the date, so posting a weekly
 * total for a week that already holds a daily entry falls through to the
 * insert and is refused by the trigger. Matching on date alone would instead
 * find that daily row and quietly rewrite it into a weekly one.
 *
 * The partial indexes still backstop a genuine race between two tabs; the
 * loser sees the duplicate-key error rather than creating a second row.
 */
export async function postStepEntry(
  supabase: SupabaseClient,
  input: { walkathonId: string; playerId: string; entryDate: string; coversWeek: boolean; steps: number }
) {
  const existing = await supabase
    .from("walkathon_step_entries")
    .select("id")
    .eq("walkathon_id", input.walkathonId)
    .eq("player_id", input.playerId)
    .eq("entry_date", input.entryDate)
    .eq("covers_week", input.coversWeek)
    .maybeSingle();
  if (existing.error) fail(existing.error, "Could not check for an existing entry.");

  if (existing.data) {
    const { error } = await supabase.from("walkathon_step_entries").update({ steps: input.steps }).eq("id", existing.data.id);
    if (error) fail(error, "Could not update those steps.");
    return;
  }

  const { error } = await supabase.from("walkathon_step_entries").insert({
    walkathon_id: input.walkathonId,
    player_id: input.playerId,
    entry_date: input.entryDate,
    covers_week: input.coversWeek,
    steps: input.steps
  });
  if (error) fail(error, "Could not save those steps.");
}

export async function deleteStepEntry(supabase: SupabaseClient, entryId: string) {
  const { error } = await supabase.from("walkathon_step_entries").delete().eq("id", entryId);
  if (error) fail(error, "Could not remove that entry.");
}
