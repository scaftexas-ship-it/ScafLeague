/**
 * Sends the weekly points email. Run by .github/workflows/weekly-digest.yml.
 *
 * DRY RUN IS THE DEFAULT. Without SEND=true this prints what it would send and
 * contacts nobody, so the job can be run by hand as often as you like while
 * checking the wording. Only the scheduled run, and a manual run where you
 * deliberately tick "send", actually posts to Resend.
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  read the league
 *   RESEND_API_KEY, DIGEST_FROM              send it
 *   SEND=true                                actually send (default: dry run)
 *   ONLY_EMAIL=someone@example.com           send to just this address, for a live test
 */
import { createClient } from "@supabase/supabase-js";
import { buildDigests } from "../lib/weekly-digest.ts";

const SEND = process.env.SEND === "true";
const ONLY_EMAIL = (process.env.ONLY_EMAIL || "").trim().toLowerCase();
const FROM = process.env.DIGEST_FROM || "SCAF League <league@scaftexas.org>";

/**
 * Accepts either name. The app's own .env.local calls these
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, so copying those
 * names straight into GitHub is the obvious thing to do -- and used to fail
 * with nothing in the log but "Missing SUPABASE_URL".
 */
function required(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  console.error(`Missing ${names[0]}. Looked for: ${names.join(", ")}.`);
  console.error("Set it under Settings -> Secrets and variables -> Actions.");
  process.exit(1);
}

// Printed before anything else so a failed run says what it had, not just that
// it died. Values are never printed, only whether they arrived.
const present = (...names) => (names.some((n) => process.env[n]) ? "set" : "MISSING");
console.log("config:");
console.log(`  SUPABASE_URL ................ ${present("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY ... ${present("SUPABASE_SERVICE_ROLE_KEY")}`);
console.log(`  RESEND_API_KEY .............. ${present("RESEND_API_KEY")}`);
console.log(`  DIGEST_FROM ................. ${process.env.DIGEST_FROM ? process.env.DIGEST_FROM : "MISSING (must be a repo VARIABLE, not a secret)"}`);
console.log(`  SEND ........................ ${process.env.SEND === "true" ? "true (will send)" : "false (dry run)"}`);
console.log("");

const supabase = createClient(
  required("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

// US Central, the same clock the rest of the league runs on.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function loadAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const [players, tournaments, divisions, entries, matches, standings, teamMembers] = await Promise.all([
  // "*" rather than naming weekly_email_enabled, so this runs either side of
  // add-weekly-email-preference.sql instead of dying on a missing column.
  loadAll("player_profiles", "*"),
  loadAll("tournaments", "id, club_id, name, sport, start_date, end_date, logo_url"),
  loadAll("divisions", "id, tournament_id, name"),
  loadAll("division_entries", "id, division_id, label, player_id, team_id"),
  loadAll("matches", "id, division_id, entry_a_id, entry_b_id, round, round_label, status, schedule_week_start, schedule_week_end, extension_week_start, extension_week_end, target_score, number_of_sets, winner_entry_id, forfeit_by_entry_id, restrict_score_updates, score_update_before_days, score_update_after_days"),
  loadAll("standings", "*"),
  loadAll("team_members", "team_id, player_id")
]);

let digests = buildDigests({ players, tournaments, divisions, entries, matches, standings, teamMembers }, today);

const hasPreferenceColumn = players.length === 0 || "weekly_email_enabled" in players[0];
if (!hasPreferenceColumn) {
  console.warn("weekly_email_enabled column not found -- run supabase/add-weekly-email-preference.sql. Treating everyone as opted in.");
}
const optedOut = players.filter((p) => p.weekly_email_enabled === false).length;
console.log(`today (Central): ${today}`);
console.log(`players: ${players.length}   opted out: ${optedOut}   digests built: ${digests.length}`);

if (ONLY_EMAIL) {
  digests = digests.filter((d) => d.email.toLowerCase() === ONLY_EMAIL);
  console.log(`ONLY_EMAIL set -- narrowed to ${digests.length} recipient(s)`);
}

if (digests.length === 0) {
  console.log("Nothing to send.");
  process.exit(0);
}

if (!SEND) {
  console.log("\n--- DRY RUN, nothing sent. Set SEND=true to send for real. ---\n");
  for (const digest of digests.slice(0, 3)) {
    console.log(`To: ${digest.email}`);
    console.log(`Subject: ${digest.subject}`);
    console.log(digest.text);
    console.log("-".repeat(60));
  }
  if (digests.length > 3) console.log(`...and ${digests.length - 3} more.`);
  process.exit(0);
}

const apiKey = required("RESEND_API_KEY");
let sent = 0;
const failures = [];

for (const digest of digests) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [digest.email], subject: digest.subject, html: digest.html, text: digest.text })
  });
  if (response.ok) {
    sent += 1;
  } else {
    const body = (await response.text()).slice(0, 200);
    failures.push(`${digest.email}: ${response.status} ${body}`);
    // A rejected key or an unverified sender fails identically for everyone,
    // so there is nothing to learn from the other 103 attempts.
    if (sent === 0 && (response.status === 401 || response.status === 403 || failures.length >= 3)) {
      console.error(`Stopping after ${failures.length} failure(s) with nothing sent -- this looks like configuration, not addresses.`);
      break;
    }
  }
  // Resend's default rate limit is 2/second; stay well under it.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

console.log(`sent: ${sent}   failed: ${failures.length}`);
failures.forEach((line) => console.error("  " + line));
// One bad address should not mask an otherwise good run, but the job should
// still go red so somebody looks at it.
if (failures.length > 0) process.exit(1);
