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
 * Posts (or replaces) one step entry. Upserting on the natural key means
 * re-posting the same day or week corrects the number instead of erroring or
 * stacking a second row on top of the first.
 */
export async function postStepEntry(
  supabase: SupabaseClient,
  input: { walkathonId: string; playerId: string; entryDate: string; coversWeek: boolean; steps: number }
) {
  const row = {
    walkathon_id: input.walkathonId,
    player_id: input.playerId,
    entry_date: input.entryDate,
    covers_week: input.coversWeek,
    steps: input.steps
  };
  const { error } = await supabase
    .from("walkathon_step_entries")
    .upsert(row, { onConflict: input.coversWeek ? "walkathon_id,player_id,week_start" : "walkathon_id,player_id,entry_date" });
  if (error) fail(error, "Could not save those steps.");
}

export async function deleteStepEntry(supabase: SupabaseClient, entryId: string) {
  const { error } = await supabase.from("walkathon_step_entries").delete().eq("id", entryId);
  if (error) fail(error, "Could not remove that entry.");
}
