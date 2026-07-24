import { SCORING_RULES } from "./types.ts";
import type { DivisionEntry, Match, MatchSet, ScoringRules, Standing } from "./types.ts";

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function isWithinInclusive(date: string, start: string, end: string) {
  const current = new Date(`${date}T00:00:00.000Z`).getTime();
  return current >= new Date(`${start}T00:00:00.000Z`).getTime() && current <= new Date(`${end}T00:00:00.000Z`).getTime();
}

export function canClaimForfeit(match: Match, entryId: string, today = new Date().toISOString().slice(0, 10)) {
  if (match.allowForfeit === false) return false;
  if (match.status !== "scheduled" && match.status !== "score_submitted") return false;
  if (match.entryAId !== entryId && match.entryBId !== entryId) return false;
  const forfeitStart = addDays(match.scheduleWeekStart, -(match.forfeitBeforeDays || 0));
  const forfeitEnd = addDays(match.scheduleWeekEnd, match.forfeitAfterDays || 0);
  return isWithinInclusive(today, forfeitStart, forfeitEnd);
}

export function expireUnplayedMatches(matches: Match[], today = new Date().toISOString().slice(0, 10)) {
  return matches.map((match) => {
    if (match.status !== "scheduled" && match.status !== "score_submitted") return match;
    if (new Date(`${today}T00:00:00.000Z`).getTime() <= new Date(`${match.extensionWeekEnd}T00:00:00.000Z`).getTime()) return match;
    return { ...match, status: "cancelled" as const };
  });
}

export function getSetWinner(set: MatchSet) {
  if (set.entryAScore === set.entryBScore) return undefined;
  return set.entryAScore > set.entryBScore ? "A" : "B";
}

export function getMatchWinner(match: Pick<Match, "entryAId" | "entryBId" | "sets" | "winnerEntryId" | "status">) {
  if (match.winnerEntryId) return match.winnerEntryId;
  if (match.status === "forfeit" || match.status === "cancelled") return undefined;
  const wins = match.sets.reduce(
    (acc, set) => {
      const winner = getSetWinner(set);
      if (winner === "A") acc.a += 1;
      if (winner === "B") acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 }
  );
  if (wins.a === wins.b) return undefined;
  return wins.a > wins.b ? match.entryAId : match.entryBId;
}

/**
 * Standings math lives here, and nowhere else. The old app duplicated a
 * hard-coded "4 / 1 / 1" summary as static copy in the admin UI, which could
 * silently drift from this function. UI components should import
 * SCORING_RULES from lib/types instead of hard-coding numbers.
 *
 * `rules` defaults to SCORING_RULES but a club can override the actual
 * values (clubs.points_per_win etc.) -- pass those through when known so
 * this preview math (used for bracket seeding) matches what the real
 * standings view computes. The standings view itself has its own copy of
 * this logic in SQL, kept in sync manually -- see add-scoring-rules.sql.
 */
export function calculateStandings(entries: DivisionEntry[], matches: Match[], rules: ScoringRules = SCORING_RULES): Standing[] {
  const standings = new Map<string, Standing>();
  for (const entry of entries) {
    standings.set(entry.id, {
      entryId: entry.id,
      played: 0,
      wins: 0,
      losses: 0,
      forfeitsWon: 0,
      forfeitsLost: 0,
      cancelled: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0
    });
  }

  for (const match of matches) {
    const a = standings.get(match.entryAId);
    const b = standings.get(match.entryBId);
    if (!a || !b) continue;

    if (match.status === "cancelled") {
      a.cancelled += 1;
      b.cancelled += 1;
      continue;
    }

    if (match.status === "forfeit" && match.winnerEntryId) {
      const winner = match.winnerEntryId === match.entryAId ? a : b;
      const loser = match.winnerEntryId === match.entryAId ? b : a;
      winner.wins += 1;
      winner.forfeitsWon += 1;
      winner.points += rules.pointsPerWin;
      loser.losses += 1;
      loser.forfeitsLost += 1;
      continue;
    }

    if (match.status !== "completed" && match.status !== "score_submitted") continue;

    const winnerEntryId = getMatchWinner(match);
    if (!winnerEntryId) continue;
    const winner = winnerEntryId === match.entryAId ? a : b;
    const loser = winnerEntryId === match.entryAId ? b : a;

    a.played += 1;
    b.played += 1;
    winner.wins += 1;
    loser.losses += 1;
    winner.points += rules.pointsPerWin;
    loser.points += rules.pointsPerPlayedLoss;

    let loserSetWins = 0;
    for (const set of match.sets) {
      const setWinner = getSetWinner(set);
      if (setWinner === "A") {
        a.setsWon += 1;
        b.setsLost += 1;
        if (loser.entryId === match.entryAId) loserSetWins += 1;
      }
      if (setWinner === "B") {
        b.setsWon += 1;
        a.setsLost += 1;
        if (loser.entryId === match.entryBId) loserSetWins += 1;
      }
    }
    if (loserSetWins > 0) loser.points += rules.bonusPointPerSetWonWhenLost;
  }

  return Array.from(standings.values()).sort((a, b) => b.points - a.points || b.wins - a.wins || b.setsWon - a.setsWon);
}

/** Reorders entries best-to-worst by current standings, for seeding a playoff bracket off group results (top-4 to semifinals, top-N from two divisions combined into cross-group quarterfinals, etc). Entries with no standings row yet (haven't played) sort last, in their original order. */
export function rankEntriesByStandings(entries: DivisionEntry[], matches: Match[], rules: ScoringRules = SCORING_RULES): DivisionEntry[] {
  const standings = calculateStandings(entries, matches, rules);
  const rank = new Map(standings.map((standing, index) => [standing.entryId, index]));
  return [...entries].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

export function generateRoundRobinSchedule(params: {
  divisionId: string;
  entries: DivisionEntry[];
  startDate: string;
  endDate: string;
}): Match[] {
  const entries = [...params.entries].sort((a, b) => a.label.localeCompare(b.label));
  if (entries.length < 2) return [];

  const hasBye = entries.length % 2 === 1;
  const competitors: Array<DivisionEntry | null> = hasBye ? [...entries, null] : entries;
  const rounds = competitors.length - 1;
  const half = competitors.length / 2;
  const rotating = competitors.slice(1);
  const matches: Match[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const current = [competitors[0], ...rotating];
    const scheduleWeekStart = addDays(params.startDate, round * 7);
    const scheduleWeekEnd = addDays(scheduleWeekStart, 6);
    const extensionWeekStart = addDays(scheduleWeekStart, 7);
    const extensionWeekEnd = addDays(scheduleWeekStart, 13);

    if (new Date(`${scheduleWeekStart}T00:00:00.000Z`).getTime() > new Date(`${params.endDate}T00:00:00.000Z`).getTime()) break;

    for (let index = 0; index < half; index += 1) {
      const left = current[index];
      const right = current[current.length - 1 - index];
      if (!left || !right) continue;
      const homeFirst = round % 2 === 0;
      const entryA = homeFirst ? left : right;
      const entryB = homeFirst ? right : left;
      matches.push({
        id: `${params.divisionId}-r${round + 1}-${entryA.id}-${entryB.id}`,
        divisionId: params.divisionId,
        round: round + 1,
        entryAId: entryA.id,
        entryBId: entryB.id,
        scheduleWeekStart,
        scheduleWeekEnd,
        extensionWeekStart,
        extensionWeekEnd,
        status: "scheduled",
        sets: []
      });
    }

    rotating.unshift(rotating.pop()!);
  }

  return matches;
}

function nextPowerOfTwo(value: number) {
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

function getEliminatorRoundLabel(bracketSize: number) {
  if (bracketSize >= 16) return "Pre Quarterfinal";
  if (bracketSize === 8) return "Quarterfinal";
  if (bracketSize === 4) return "Semifinal";
  return "Final";
}

export function generateEliminatorSchedule(params: {
  divisionId: string;
  entries: DivisionEntry[];
  startDate: string;
  endDate: string;
}): Match[] {
  // Seed order matters: entries[0] pairs with entries[n-1], entries[1] with
  // entries[n-2], and so on (standard bracket seeding), and whoever's first
  // gets any bye when the field isn't a power of two. Callers control this
  // order deliberately (e.g. rankEntriesByStandings for a playoff bracket,
  // or manual pick order) -- it's no longer forced alphabetical here.
  const entries = params.entries;
  if (entries.length < 2) return [];

  const scheduleWeekStart = params.startDate;
  if (new Date(`${scheduleWeekStart}T00:00:00.000Z`).getTime() > new Date(`${params.endDate}T00:00:00.000Z`).getTime()) return [];

  const bracketSize = nextPowerOfTwo(entries.length);
  const firstRoundEntrantCount = entries.length === bracketSize ? entries.length : (entries.length - bracketSize / 2) * 2;
  const entrants = entries.length === bracketSize ? entries : entries.slice(entries.length - firstRoundEntrantCount);
  const roundLabel = getEliminatorRoundLabel(bracketSize);
  const scheduleWeekEnd = addDays(scheduleWeekStart, 6);
  const extensionWeekStart = addDays(scheduleWeekStart, 7);
  const extensionWeekEnd = addDays(scheduleWeekStart, 13);
  const matches: Match[] = [];

  for (let index = 0; index < entrants.length / 2; index += 1) {
    const entryA = entrants[index];
    const entryB = entrants[entrants.length - 1 - index];
    matches.push({
      id: `${params.divisionId}-elim-r1-${entryA.id}-${entryB.id}`,
      divisionId: params.divisionId,
      round: 1,
      roundLabel,
      entryAId: entryA.id,
      entryBId: entryB.id,
      scheduleWeekStart,
      scheduleWeekEnd,
      extensionWeekStart,
      extensionWeekEnd,
      status: "scheduled",
      sets: []
    });
  }

  return matches;
}
