import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, noExtensionWindow } from "./league-rules.ts";
import { matchSelect } from "./match-queries.ts";

/**
 * Knockout brackets: once every match in a round has a winner, build the next
 * round from the winners -- quarterfinals into semifinals into the final.
 *
 * Sport-agnostic on purpose. A winner is a winner (winner_entry_id), however the
 * score got there -- pickleball games to 11, tennis sets with a 7-6 tiebreak,
 * badminton to 21 -- so the same rule serves every sport. Scoring validity is
 * enforced when the score is entered (lib/match-scoring.ts), not here.
 *
 * This file imports only with ".ts" extensions and takes its Supabase client as
 * a parameter, so the nightly/hourly GitHub workflow (scripts/advance-knockouts.mjs)
 * can run exactly the same code as the app.
 */

/** The round labels generateEliminatorSchedule gives a bracket. "Manual" matchups are deliberately not here: an admin drew those by hand. */
export const KNOCKOUT_ROUND_LABELS = ["Pre Quarterfinal", "Quarterfinal", "Semifinal", "Final"] as const;

export function isKnockoutLabel(label: string | null | undefined) {
  return Boolean(label) && (KNOCKOUT_ROUND_LABELS as readonly string[]).includes(label as string);
}

export type KnockoutMatch = {
  id: string;
  round: number;
  roundLabel: string | null;
  entryAId: string;
  entryBId: string;
  status: string;
  winnerEntryId: string | null;
  targetScore: number;
  numberOfSets: number;
  restrictScoreUpdates: boolean;
  scoreUpdateBeforeDays: number;
  scoreUpdateAfterDays: number;
  allowForfeit: boolean;
  forfeitBeforeDays: number;
  forfeitAfterDays: number;
  scheduleWeekStart: string;
  scheduleWeekEnd: string;
  extensionWeekStart: string;
  extensionWeekEnd: string;
};

export type NextKnockoutRound = {
  round: number;
  roundLabel: string;
  /** Entry ids, home side first. In bracket order -- the order they're created in is the order the next round reads them in. */
  pairs: Array<[string, string]>;
  scheduleWeekStart: string;
  scheduleWeekEnd: string;
  extensionWeekStart: string;
  extensionWeekEnd: string;
  settings: Pick<
    KnockoutMatch,
    | "targetScore"
    | "numberOfSets"
    | "restrictScoreUpdates"
    | "scoreUpdateBeforeDays"
    | "scoreUpdateAfterDays"
    | "allowForfeit"
    | "forfeitBeforeDays"
    | "forfeitAfterDays"
  >;
};

export type KnockoutPlan =
  | { kind: "not-a-bracket" }
  | { kind: "waiting"; round: number; roundLabel: string; pending: number }
  | { kind: "blocked"; round: number; roundLabel: string; reason: string }
  | { kind: "complete"; championEntryId: string }
  | ({ kind: "advance" } & NextKnockoutRound);

const DECIDED_STATUSES = ["completed", "score_submitted", "forfeit"];

function isDecided(match: KnockoutMatch) {
  return DECIDED_STATUSES.includes(match.status) && Boolean(match.winnerEntryId);
}

function nextPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

/** The label a round of this many entrants carries. Mirrors getEliminatorRoundLabel in league-rules.ts. */
function labelForEntrants(entrantCount: number) {
  const size = nextPowerOfTwo(entrantCount);
  if (size >= 16) return "Pre Quarterfinal";
  if (size === 8) return "Quarterfinal";
  if (size === 4) return "Semifinal";
  return "Final";
}

function dayGap(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000);
}

/**
 * Decides what a bracket needs next. Pure: it never touches the database.
 *
 * @param entryIdsInDrawOrder every entry in the division, in the order they were drawn (seed 1 first). Only used to
 *   work out who had a first-round bye, and to seat byes ahead of the winners.
 * @param matches the division's knockout matches in draw order (round, then the order the round was created in).
 * @param today the league's date (US Central), used so a round that finishes late doesn't open in the past.
 */
export function planNextKnockoutRound(entryIdsInDrawOrder: string[], matches: KnockoutMatch[], today: string): KnockoutPlan {
  if (matches.length === 0) return { kind: "not-a-bracket" };

  const firstRound = Math.min(...matches.map((match) => match.round));
  const latestRound = Math.max(...matches.map((match) => match.round));
  const latest = matches.filter((match) => match.round === latestRound);
  const roundLabel = latest[0].roundLabel || labelForEntrants(latest.length * 2);

  // A cancelled match has no winner and nothing in the app will give it one on
  // its own -- the bracket can't continue until an admin scores it or decides it.
  const cancelled = latest.filter((match) => match.status === "cancelled" && !match.winnerEntryId);
  if (cancelled.length > 0) {
    return {
      kind: "blocked",
      round: latestRound,
      roundLabel,
      reason: `${cancelled.length} ${roundLabel} match${cancelled.length === 1 ? " was" : "es were"} cancelled with no winner. Score or decide ${cancelled.length === 1 ? "it" : "them"} in Match Management so the bracket can continue.`
    };
  }

  const pending = latest.filter((match) => !isDecided(match));
  if (pending.length > 0) return { kind: "waiting", round: latestRound, roundLabel, pending: pending.length };

  // One match left, played: that's the final.
  if (latest.length === 1) return { kind: "complete", championEntryId: latest[0].winnerEntryId as string };

  const winners = latest.map((match) => match.winnerEntryId as string);

  // Byes exist only going from the first round to the second: when the field
  // isn't a power of two, the top seeds sit out round one and join the winners.
  let entrants = winners;
  if (latestRound === firstRound) {
    const playedRoundOne = new Set(latest.flatMap((match) => [match.entryAId, match.entryBId]));
    const byes = entryIdsInDrawOrder.filter((id) => !playedRoundOne.has(id));
    entrants = [...byes, ...winners];
  }

  if (entrants.length < 2 || entrants.length % 2 !== 0) {
    return {
      kind: "blocked",
      round: latestRound,
      roundLabel,
      reason: `Can't pair the ${roundLabel} winners: ${entrants.length} players left, which isn't an even number. Check the division's entries.`
    };
  }

  // Standard bracket seating: first with last, second with second-last. Fed the
  // winners in match order, that keeps the top half of the draw on one side.
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < entrants.length / 2; index += 1) pairs.push([entrants[index], entrants[entrants.length - 1 - index]]);

  const template = latest[0];
  // The round after one that had no extension week doesn't get one either; one
  // that did, does. Keep the window the same size.
  const hadExtension = dayGap(template.scheduleWeekEnd, template.extensionWeekEnd) > 1;
  const earliestStart = addDays(template.scheduleWeekEnd, 1);
  const scheduleWeekStart = today > earliestStart ? today : earliestStart;
  const scheduleWeekEnd = addDays(scheduleWeekStart, 6);
  const extension = hadExtension
    ? { extensionWeekStart: addDays(scheduleWeekEnd, 1), extensionWeekEnd: addDays(scheduleWeekEnd, 7) }
    : noExtensionWindow(scheduleWeekEnd);

  return {
    kind: "advance",
    round: latestRound + 1,
    roundLabel: labelForEntrants(entrants.length),
    pairs,
    scheduleWeekStart,
    scheduleWeekEnd,
    ...extension,
    settings: {
      targetScore: template.targetScore,
      numberOfSets: template.numberOfSets,
      restrictScoreUpdates: template.restrictScoreUpdates,
      scoreUpdateBeforeDays: template.scoreUpdateBeforeDays,
      scoreUpdateAfterDays: template.scoreUpdateAfterDays,
      allowForfeit: template.allowForfeit,
      forfeitBeforeDays: template.forfeitBeforeDays,
      forfeitAfterDays: template.forfeitAfterDays
    }
  };
}

/**
 * Timestamps one millisecond apart, ascending. Rows inserted in one statement all
 * get the same now(), which would erase the order a bracket was drawn in -- and
 * that order is the only record of who sits where (seed order for entries,
 * bracket position for matches). Giving each row its own created_at keeps it,
 * without needing a column of its own.
 */
export function drawOrderTimestamps(count: number, start = Date.now()) {
  return Array.from({ length: count }, (_, index) => new Date(start + index).toISOString());
}

type MatchDbRow = {
  id: string;
  division_id: string;
  round: number;
  round_label: string | null;
  entry_a_id: string;
  entry_b_id: string;
  status: string;
  winner_entry_id: string | null;
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
};

function toKnockoutMatch(row: MatchDbRow): KnockoutMatch {
  return {
    id: row.id,
    round: row.round,
    roundLabel: row.round_label,
    entryAId: row.entry_a_id,
    entryBId: row.entry_b_id,
    status: row.status,
    winnerEntryId: row.winner_entry_id,
    targetScore: row.target_score,
    numberOfSets: row.number_of_sets,
    restrictScoreUpdates: row.restrict_score_updates,
    scoreUpdateBeforeDays: row.score_update_before_days,
    scoreUpdateAfterDays: row.score_update_after_days,
    allowForfeit: row.allow_forfeit,
    forfeitBeforeDays: row.forfeit_before_days,
    forfeitAfterDays: row.forfeit_after_days,
    scheduleWeekStart: row.schedule_week_start,
    scheduleWeekEnd: row.schedule_week_end,
    extensionWeekStart: row.extension_week_start,
    extensionWeekEnd: row.extension_week_end
  };
}

export type KnockoutAdvance =
  | { divisionId: string; outcome: "created"; round: number; roundLabel: string; created: number }
  | { divisionId: string; outcome: "waiting"; roundLabel: string; pending: number }
  | { divisionId: string; outcome: "blocked"; roundLabel: string; message: string }
  | { divisionId: string; outcome: "complete"; championEntryId: string }
  | { divisionId: string; outcome: "error"; message: string };

/** Divisions being advanced right now in this tab, so overlapping triggers (a save and a reload, say) can't both build the same round. */
const inFlight = new Set<string>();

/** Most rounds a bracket can have is 5 (32 players); the cap just guarantees the loop ends. */
const MAX_ROUNDS_PER_PASS = 6;

async function advanceOneDivision(supabase: SupabaseClient, divisionId: string, today: string): Promise<KnockoutAdvance[]> {
  const results: KnockoutAdvance[] = [];

  for (let pass = 0; pass < MAX_ROUNDS_PER_PASS; pass += 1) {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(matchSelect)
      .eq("division_id", divisionId)
      .in("round_label", [...KNOCKOUT_ROUND_LABELS])
      .order("round", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (matchError) return [...results, { divisionId, outcome: "error", message: matchError.message }];

    const { data: entryRows, error: entryError } = await supabase
      .from("division_entries")
      .select("id")
      .eq("division_id", divisionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (entryError) return [...results, { divisionId, outcome: "error", message: entryError.message }];

    const matches = ((matchRows || []) as unknown as MatchDbRow[]).map(toKnockoutMatch);
    const plan = planNextKnockoutRound(
      ((entryRows || []) as Array<{ id: string }>).map((row) => row.id),
      matches,
      today
    );

    if (plan.kind === "not-a-bracket") return results;
    if (plan.kind === "waiting") return [...results, { divisionId, outcome: "waiting", roundLabel: plan.roundLabel, pending: plan.pending }];
    if (plan.kind === "blocked") return [...results, { divisionId, outcome: "blocked", roundLabel: plan.roundLabel, message: plan.reason }];
    if (plan.kind === "complete") return [...results, { divisionId, outcome: "complete", championEntryId: plan.championEntryId }];

    const stamps = drawOrderTimestamps(plan.pairs.length);
    const rows = plan.pairs.map(([entryAId, entryBId], index) => ({
      division_id: divisionId,
      round: plan.round,
      round_label: plan.roundLabel,
      entry_a_id: entryAId,
      entry_b_id: entryBId,
      target_score: plan.settings.targetScore,
      number_of_sets: plan.settings.numberOfSets,
      restrict_score_updates: plan.settings.restrictScoreUpdates,
      score_update_before_days: plan.settings.scoreUpdateBeforeDays,
      score_update_after_days: plan.settings.scoreUpdateAfterDays,
      allow_forfeit: plan.settings.allowForfeit,
      forfeit_before_days: plan.settings.forfeitBeforeDays,
      forfeit_after_days: plan.settings.forfeitAfterDays,
      schedule_week_start: plan.scheduleWeekStart,
      schedule_week_end: plan.scheduleWeekEnd,
      extension_week_start: plan.extensionWeekStart,
      extension_week_end: plan.extensionWeekEnd,
      status: "scheduled",
      created_at: stamps[index]
    }));

    // Last look before writing: a second tab may have built this round since
    // the read above. Not atomic, but it narrows the window to milliseconds.
    const { data: already } = await supabase
      .from("matches")
      .select("id")
      .eq("division_id", divisionId)
      .eq("round", plan.round)
      .in("round_label", [...KNOCKOUT_ROUND_LABELS])
      .limit(1);
    if (already && already.length > 0) return results;

    const { error: insertError } = await supabase.from("matches").insert(rows);
    if (insertError) return [...results, { divisionId, outcome: "error", message: insertError.message }];
    results.push({ divisionId, outcome: "created", round: plan.round, roundLabel: plan.roundLabel, created: rows.length });
    // Loop: if the round just built is somehow already decided (it can't be, it's brand new) the next pass would say so.
  }

  return results;
}

/**
 * Builds the next round for every knockout bracket among `divisionIds` whose
 * current round is finished. Safe to call as often as you like -- when there's
 * nothing to do it writes nothing -- and it never throws: a failure comes back
 * as an "error" outcome so a hiccup here can't break the page that called it.
 */
export async function advanceKnockoutBrackets(supabase: SupabaseClient, divisionIds: string[], today: string): Promise<KnockoutAdvance[]> {
  const all: KnockoutAdvance[] = [];
  for (const divisionId of divisionIds) {
    if (inFlight.has(divisionId)) continue;
    inFlight.add(divisionId);
    try {
      all.push(...(await advanceOneDivision(supabase, divisionId, today)));
    } catch (error) {
      all.push({ divisionId, outcome: "error", message: error instanceof Error ? error.message : "Could not advance the bracket." });
    } finally {
      inFlight.delete(divisionId);
    }
  }
  return all;
}

/** One line an admin can read after a save: what got built, or what's stopping the bracket. Empty when there's nothing worth saying. */
export function describeKnockoutAdvance(results: KnockoutAdvance[]) {
  const lines: string[] = [];
  for (const result of results) {
    if (result.outcome === "created") lines.push(`${result.roundLabel} created (${result.created} match${result.created === 1 ? "" : "es"}).`);
    if (result.outcome === "blocked") lines.push(result.message);
  }
  return lines.join(" ");
}
