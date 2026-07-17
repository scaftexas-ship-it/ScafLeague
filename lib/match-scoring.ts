import type { MatchRow } from "./admin-data";
import type { Match, MatchSet, Sport } from "./types";

/** Flat form state for a 3-set score entry grid, shared by the player and admin match editors. */
export type SetScoreForm = {
  set1A: string;
  set1B: string;
  set2A: string;
  set2B: string;
  set3A: string;
  set3B: string;
};

export const emptySetScoreForm = (targetScore = 11): SetScoreForm => ({
  set1A: String(targetScore),
  set1B: "0",
  set2A: String(targetScore),
  set2B: "0",
  set3A: "",
  set3B: ""
});

export function setScoreFormFromSets(sets: MatchSet[]): SetScoreForm {
  const byNumber = new Map(sets.map((set) => [set.setNumber, set]));
  const at = (n: number, key: "entryAScore" | "entryBScore") => {
    const set = byNumber.get(n);
    return set ? String(set[key]) : "";
  };
  return {
    set1A: at(1, "entryAScore"),
    set1B: at(1, "entryBScore"),
    set2A: at(2, "entryAScore"),
    set2B: at(2, "entryBScore"),
    set3A: at(3, "entryAScore"),
    set3B: at(3, "entryBScore")
  };
}

/** Converts the flat form into MatchSet[], skipping any set row left completely blank. */
export function buildSetsFromForm(form: SetScoreForm): MatchSet[] {
  const rawSets: Array<[string, string]> = [
    [form.set1A, form.set1B],
    [form.set2A, form.set2B],
    [form.set3A, form.set3B]
  ];

  return rawSets.flatMap(([a, b], index) => {
    if (a === "" && b === "") return [];
    return [
      {
        setNumber: index + 1,
        entryAScore: Number(a),
        entryBScore: Number(b)
      }
    ];
  });
}

/**
 * Determines the winning entry from a set of scores using a best-of-N
 * majority rule (majority = ceil(numberOfSets / 2), default best-of-3 -> 2).
 * Returns undefined when there's a tie or no side has reached a majority yet.
 */
export function getWinnerEntryId(
  match: { entryAId: string; entryBId: string; numberOfSets?: number },
  sets: MatchSet[]
): string | undefined {
  const wins = sets.reduce(
    (acc, set) => {
      if (set.entryAScore > set.entryBScore) acc.a += 1;
      if (set.entryBScore > set.entryAScore) acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 }
  );

  const majorityNeeded = Math.ceil((match.numberOfSets || 3) / 2);
  if (wins.a === wins.b || Math.max(wins.a, wins.b) < majorityNeeded) return undefined;
  return wins.a > wins.b ? match.entryAId : match.entryBId;
}

/**
 * A finished set requires the winner to reach the target score and lead by
 * at least 2 -- except tennis, which allows one exception: once both sides
 * reach target-1 games (e.g. 6-6), a single tiebreak game decides the set,
 * recorded as target+1 to target-1 games (e.g. 7-6), a 1-game margin. Tennis
 * sets also can't run past target+1 games (no 8-6, 9-7, etc.) since the
 * tiebreak always resolves the set.
 */
export function isValidCompletedSet(entryAScore: number, entryBScore: number, targetScore: number, sport: Sport = "pickleball") {
  if (!Number.isFinite(entryAScore) || !Number.isFinite(entryBScore)) return false;
  const winner = Math.max(entryAScore, entryBScore);
  const loser = Math.min(entryAScore, entryBScore);

  if (sport === "tennis") {
    if (winner === targetScore) return loser <= targetScore - 2;
    if (winner === targetScore + 1) return loser === targetScore - 1 || loser === targetScore;
    return false;
  }

  return winner >= targetScore && winner - loser >= 2;
}

/**
 * Stricter alternative to getWinnerEntryId for score-entry submission: every
 * entered set must be a valid completed set (see isValidCompletedSet), and no
 * set may be entered after the match was already decided by an earlier
 * majority (e.g. a 3rd set in a best-of-3 after a 2-0 result).
 */
export function validateMatchSets(
  sets: MatchSet[],
  match: { entryAId: string; entryBId: string; numberOfSets?: number; targetScore: number; sport?: Sport }
): { ok: true; winnerEntryId: string } | { ok: false; error: string } {
  const majorityNeeded = Math.ceil((match.numberOfSets || 3) / 2);
  const sorted = [...sets].sort((a, b) => a.setNumber - b.setNumber);

  let winsA = 0;
  let winsB = 0;

  for (const set of sorted) {
    if (Math.max(winsA, winsB) >= majorityNeeded) {
      return { ok: false, error: `Set ${set.setNumber} was entered, but the match was already decided after set ${set.setNumber - 1}. Remove the extra set.` };
    }
    if (!isValidCompletedSet(set.entryAScore, set.entryBScore, match.targetScore, match.sport)) {
      const hint =
        match.sport === "tennis"
          ? `the winner needs ${match.targetScore} games with a 2-game lead, or ${match.targetScore + 1}-${match.targetScore - 1} / ${match.targetScore + 1}-${match.targetScore} (tiebreak)`
          : `the winner needs at least ${match.targetScore} points and a 2-point lead`;
      return {
        ok: false,
        error: `Set ${set.setNumber} score (${set.entryAScore}-${set.entryBScore}) isn't a valid finished set -- ${hint}.`
      };
    }
    if (set.entryAScore > set.entryBScore) winsA += 1;
    else winsB += 1;
  }

  if (winsA === winsB || Math.max(winsA, winsB) < majorityNeeded) {
    return { ok: false, error: "Enter a valid score with a clear winner." };
  }

  return { ok: true, winnerEntryId: winsA > winsB ? match.entryAId : match.entryBId };
}

/** Converts a Supabase matches row into the plain lib/league-rules.ts domain shape. */
export function toDomainMatch(match: MatchRow, sets: MatchSet[] = []): Match {
  return {
    id: match.id,
    divisionId: match.division_id,
    round: match.round,
    roundLabel: match.round_label || undefined,
    entryAId: match.entry_a_id,
    entryBId: match.entry_b_id,
    targetScore: match.target_score,
    numberOfSets: match.number_of_sets,
    restrictScoreUpdates: match.restrict_score_updates,
    scoreUpdateBeforeDays: match.score_update_before_days,
    scoreUpdateAfterDays: match.score_update_after_days,
    allowForfeit: match.allow_forfeit,
    forfeitBeforeDays: match.forfeit_before_days,
    forfeitAfterDays: match.forfeit_after_days,
    scheduleWeekStart: match.schedule_week_start,
    scheduleWeekEnd: match.schedule_week_end,
    extensionWeekStart: match.extension_week_start,
    extensionWeekEnd: match.extension_week_end,
    status: match.status,
    sets,
    winnerEntryId: match.winner_entry_id || undefined,
    forfeitByEntryId: match.forfeit_by_entry_id || undefined
  };
}

/** Human-readable reason forfeit isn't currently available for a match, or "" if it is. */
export function getForfeitUnavailableReason(match: MatchRow, today: string) {
  if (match.status === "completed" || match.status === "forfeit") {
    return "Forfeit is locked because a result has already been posted.";
  }
  if (match.status === "cancelled") {
    return "Forfeit is locked because this match is cancelled.";
  }
  if (!match.allow_forfeit) {
    return "Forfeit is disabled for this schedule.";
  }
  return "";
}

/** Whether a score can currently be entered/edited, honoring the optional restrict-updates window. */
export function canSubmitScoreInWindow(match: MatchRow, today: string, addDaysFn: (date: string, days: number) => string) {
  if (!match.restrict_score_updates) return true;
  const start = addDaysFn(match.schedule_week_start, -match.score_update_before_days);
  const end = addDaysFn(match.schedule_week_end, match.score_update_after_days);
  return today >= start && today <= end;
}
