import type { WalkathonStepEntryRow } from "./walkathon-data";

export type StepPeriod = "week" | "month" | "all";

/**
 * Date maths for the walkathon, kept as pure string-in/string-out functions on
 * ISO dates (YYYY-MM-DD) so nothing depends on the viewer's timezone. Using
 * real Date arithmetic on a local timestamp shifts the day for anyone west of
 * UTC, which would file Monday's steps under Sunday.
 */
function toUtc(dateIso: string) {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number) {
  const date = toUtc(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** The Monday on or before this date -- matches the week_start generated column in Postgres. */
export function weekStartIso(dateIso: string) {
  const date = toUtc(dateIso);
  // getUTCDay is 0 for Sunday, so Sunday belongs to the week that began six days earlier.
  const offset = (date.getUTCDay() + 6) % 7;
  return addDaysIso(dateIso, -offset);
}

export function monthStartIso(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

export function monthEndIso(dateIso: string) {
  const start = toUtc(monthStartIso(dateIso));
  start.setUTCMonth(start.getUTCMonth() + 1);
  start.setUTCDate(0);
  return toIso(start);
}

/** Inclusive [start, end] the dashboard is showing. "all" returns null bounds. */
export function periodRange(period: StepPeriod, todayIso: string): { start: string | null; end: string | null } {
  if (period === "week") {
    const start = weekStartIso(todayIso);
    return { start, end: addDaysIso(start, 6) };
  }
  if (period === "month") return { start: monthStartIso(todayIso), end: monthEndIso(todayIso) };
  return { start: null, end: null };
}

export function isWithinRange(dateIso: string, start: string | null, end: string | null) {
  if (start && dateIso < start) return false;
  if (end && dateIso > end) return false;
  return true;
}

/**
 * A weekly entry is dated to its Monday, so it counts toward a period the
 * moment that Monday falls inside it. That keeps a weekly post and seven daily
 * posts behaving the same way for "this week", and avoids splitting a week
 * total across two months, which would need a per-day breakdown nobody gave us.
 */
export function totalSteps(entries: WalkathonStepEntryRow[], start: string | null, end: string | null) {
  return entries.reduce((sum, entry) => (isWithinRange(entry.entry_date, start, end) ? sum + entry.steps : sum), 0);
}

export type StepRanking = {
  playerId: string;
  steps: number;
  entries: number;
  rank: number;
};

/**
 * Ranks players by steps, most first. Equal totals share a rank and the next
 * player skips ahead (1, 2, 2, 4) -- standard competition ranking, so two
 * people on the same steps are never shown one above the other arbitrarily.
 * Players with no steps in the period still appear, on zero.
 */
export function rankBySteps(totalsByPlayer: Array<{ playerId: string; steps: number; entries: number }>): StepRanking[] {
  const sorted = [...totalsByPlayer].sort((a, b) => b.steps - a.steps || a.playerId.localeCompare(b.playerId));
  let lastSteps: number | null = null;
  let lastRank = 0;
  return sorted.map((row, index) => {
    const rank = lastSteps !== null && row.steps === lastSteps ? lastRank : index + 1;
    lastSteps = row.steps;
    lastRank = rank;
    return { ...row, rank };
  });
}

/** Per-player totals over a period, ready for rankBySteps. */
export function buildLeaderboard(playerIds: string[], entries: WalkathonStepEntryRow[], start: string | null, end: string | null) {
  const inRange = entries.filter((entry) => isWithinRange(entry.entry_date, start, end));
  return rankBySteps(
    playerIds.map((playerId) => {
      const mine = inRange.filter((entry) => entry.player_id === playerId);
      return { playerId, steps: mine.reduce((sum, entry) => sum + entry.steps, 0), entries: mine.length };
    })
  );
}

export function formatSteps(steps: number) {
  return steps.toLocaleString("en-US");
}

/** How far back a player may still fill in steps they forgot to log. */
export const STEP_BACKDATE_DAYS = 7;

/**
 * The window a player may still log, narrowed to the walkathon's own dates.
 *
 * A weekly post is filed against its Monday, so the week-mode floor reaches
 * further back than seven days: a week that ENDED within the last seven days
 * began up to thirteen days ago. Judging a weekly post by its Monday alone
 * would mean a Sunday-to-Saturday week became unpostable the day after it
 * finished, which is exactly when people total one up.
 */
export function loggableDateBounds(
  mode: "day" | "week",
  todayIso: string,
  walkathon: { start_date: string; end_date: string }
) {
  const earliest = addDaysIso(todayIso, -(mode === "week" ? STEP_BACKDATE_DAYS + 6 : STEP_BACKDATE_DAYS));
  return {
    min: earliest > walkathon.start_date ? earliest : walkathon.start_date,
    max: todayIso < walkathon.end_date ? todayIso : walkathon.end_date
  };
}

/** Why this date can't be logged, or null when it's fine. Mirrors the trigger in add-walkathon-backdate.sql. */
export function describeDateProblem(
  mode: "day" | "week",
  dateIso: string,
  todayIso: string,
  walkathon: { start_date: string; end_date: string }
) {
  const target = mode === "week" ? weekStartIso(dateIso) : dateIso;
  if (target < walkathon.start_date || target > walkathon.end_date) {
    return `That date is outside the walkathon (${walkathon.start_date} to ${walkathon.end_date}).`;
  }
  if (target > todayIso) return "You can't log steps for a date in the future.";
  // For a week, the clock starts when the week ended rather than when it began.
  const measuredFrom = mode === "week" ? addDaysIso(target, 6) : target;
  if (measuredFrom < addDaysIso(todayIso, -STEP_BACKDATE_DAYS)) {
    return `Steps can only be logged up to ${STEP_BACKDATE_DAYS} days back.`;
  }
  return null;
}
