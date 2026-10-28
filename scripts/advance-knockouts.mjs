/**
 * Builds the next round of every knockout bracket whose current round is
 * finished. Run hourly by .github/workflows/advance-knockouts.yml.
 *
 * Why this exists: the app builds the next round the moment an admin saves a
 * result or opens the admin workspace. A player's own client can't do it -- the
 * database only lets admins create matches -- so a result a player posts would
 * otherwise wait for the next admin visit. This runs the very same code
 * (lib/knockout.ts) with the service role key, so it needs no database changes.
 * It is safe to run as often as you like: when nothing is due it writes nothing.
 *
 * Environment: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { KNOCKOUT_ROUND_LABELS, advanceKnockoutBrackets } from "../lib/knockout.ts";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  // Not a failure: this repo may not have the secrets set. Say so, loudly enough
  // to find, without emailing the owner a red X every hour.
  console.log("::warning::Knockout advance skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set as Actions secrets.");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// US Central, the same clock the rest of the league runs on.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const { data, error } = await supabase.from("matches").select("division_id").in("round_label", [...KNOCKOUT_ROUND_LABELS]);
if (error) {
  console.error(`Could not list knockout matches: ${error.message}`);
  process.exit(1);
}

// KNOCKOUT_DIVISION_IDS (comma separated) narrows a manual run to those divisions.
const only = (process.env.KNOCKOUT_DIVISION_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
const divisionIds = [...new Set((data || []).map((row) => row.division_id))].filter((id) => only.length === 0 || only.includes(id));
console.log(`${divisionIds.length} knockout division${divisionIds.length === 1 ? "" : "s"} to check (today is ${today}).`);

const results = await advanceKnockoutBrackets(supabase, divisionIds, today);
let failed = 0;
for (const result of results) {
  if (result.outcome === "created") console.log(`${result.divisionId}: created ${result.roundLabel} (${result.created} matches)`);
  else if (result.outcome === "waiting") console.log(`${result.divisionId}: ${result.roundLabel} still has ${result.pending} to play`);
  else if (result.outcome === "complete") console.log(`${result.divisionId}: bracket finished`);
  else if (result.outcome === "blocked") console.log(`::warning::${result.divisionId}: ${result.message}`);
  else {
    failed += 1;
    console.error(`${result.divisionId}: ${result.message}`);
  }
}
if (failed > 0) process.exit(1);
