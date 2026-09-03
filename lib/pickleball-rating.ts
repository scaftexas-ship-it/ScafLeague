import type { DivisionEntryRow, MatchRow, MatchSetRow, PlayerProfileRow, TeamMemberRow } from "./admin-data";

/**
 * A club rating for pickleball, in the same shape and range as DUPR so the
 * numbers read familiarly -- but computed here from this club's own results.
 * It is NOT a DUPR rating and carries no weight outside this league.
 *
 * How a rating moves, and why:
 *
 *  - Singles and doubles are separate ladders. Someone can be a fine doubles
 *    partner and a poor singles player, and averaging the two would describe
 *    neither.
 *
 *  - Every match is scored on POINTS won, not just who took it. Losing 11-9,
 *    11-9 to a strong pair says something quite different from losing 11-0,
 *    and a rating that only saw "loss" would treat them alike. Winning still
 *    carries half the weight, so grinding out close wins beats losing well.
 *
 *  - What you gain depends on who you played. Beating someone rated well above
 *    you moves you a long way; beating someone far below barely registers, and
 *    losing to them costs you.
 *
 *  - New players move fast, then settle. The first few results should find
 *    roughly the right level quickly without one bad night later undoing a
 *    season's worth of evidence.
 *
 * Matches are replayed in date order every time, so a rating is always a pure
 * function of the results posted -- correcting a score re-derives everything
 * downstream rather than leaving a stale number behind.
 */

/** Where an unrated player starts: mid-range, the same idea as DUPR's provisional. */
export const START_RATING = 3.5;
export const MIN_RATING = 2;
export const MAX_RATING = 8;

/** Rating gap at which the stronger side is expected to take ~91% of the points. */
const GAP_SCALE = 1;

/** How far one match can move a rating, before and after it settles. */
const K_PROVISIONAL = 0.32;
const K_SETTLED = 0.16;

/** Below this many matches a rating is shown as provisional rather than trusted. */
export const PROVISIONAL_MATCHES = 5;

export type RatingFormat = "singles" | "doubles";

export type PlayerRating = {
  playerId: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  provisional: boolean;
};

export type RatingInput = {
  matches: MatchRow[];
  matchSets: MatchSetRow[];
  entries: DivisionEntryRow[];
  teamMembers: TeamMemberRow[];
};

/** Share of the points the stronger side is expected to take, from the rating gap alone. */
export function expectedShare(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / GAP_SCALE));
}

function clamp(value: number) {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, value));
}

function playersForEntry(entry: DivisionEntryRow | undefined, teamMembers: TeamMemberRow[]) {
  if (!entry) return [];
  if (entry.player_id) return [entry.player_id];
  if (!entry.team_id) return [];
  return teamMembers.filter((member) => member.team_id === entry.team_id).map((member) => member.player_id);
}

export function calculateRatings(format: RatingFormat, input: RatingInput): Map<string, PlayerRating> {
  const wanted = format === "singles" ? 1 : 2;
  const table = new Map<string, PlayerRating>();

  const ensure = (playerId: string) => {
    const found = table.get(playerId);
    if (found) return found;
    const created: PlayerRating = {
      playerId,
      rating: START_RATING,
      matches: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      provisional: true
    };
    table.set(playerId, created);
    return created;
  };

  // Replayed oldest first: a rating is the story of the season in order, and
  // the tie-breakers keep two matches on the same day in a fixed sequence so
  // the same results always produce the same numbers.
  const ordered = [...input.matches].sort(
    (a, b) => a.schedule_week_end.localeCompare(b.schedule_week_end) || a.round - b.round || a.id.localeCompare(b.id)
  );

  for (const match of ordered) {
    if (match.status !== "completed" && match.status !== "score_submitted") continue;

    const sideA = playersForEntry(input.entries.find((entry) => entry.id === match.entry_a_id), input.teamMembers);
    const sideB = playersForEntry(input.entries.find((entry) => entry.id === match.entry_b_id), input.teamMembers);
    if (sideA.length !== wanted || sideB.length !== wanted) continue;

    const sets = input.matchSets.filter((set) => set.match_id === match.id);
    if (sets.length === 0) continue; // a forfeit has no games to judge

    const pointsA = sets.reduce((sum, set) => sum + set.entry_a_score, 0);
    const pointsB = sets.reduce((sum, set) => sum + set.entry_b_score, 0);
    const totalPoints = pointsA + pointsB;
    if (totalPoints === 0) continue;

    const setsA = sets.filter((set) => set.entry_a_score > set.entry_b_score).length;
    const setsB = sets.filter((set) => set.entry_b_score > set.entry_a_score).length;
    if (setsA === setsB) continue; // no winner to learn from

    const rowsA = sideA.map(ensure);
    const rowsB = sideB.map(ensure);

    // A pair is rated as the average of its two players -- the team you put on
    // court is what the other team actually faced.
    const teamA = rowsA.reduce((sum, row) => sum + row.rating, 0) / rowsA.length;
    const teamB = rowsB.reduce((sum, row) => sum + row.rating, 0) / rowsB.length;

    const expected = expectedShare(teamA, teamB);
    const pointShareA = pointsA / totalPoints;
    const aWon = setsA > setsB;
    const actual = 0.5 * (aWon ? 1 : 0) + 0.5 * pointShareA;
    const surprise = actual - expected;

    for (const row of rowsA) {
      row.rating = clamp(row.rating + (row.matches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_SETTLED) * surprise);
      row.matches += 1;
      row.provisional = row.matches < PROVISIONAL_MATCHES;
      row.pointsFor += pointsA;
      row.pointsAgainst += pointsB;
      if (aWon) row.wins += 1;
      else row.losses += 1;
    }
    for (const row of rowsB) {
      row.rating = clamp(row.rating - (row.matches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_SETTLED) * surprise);
      row.matches += 1;
      row.provisional = row.matches < PROVISIONAL_MATCHES;
      row.pointsFor += pointsB;
      row.pointsAgainst += pointsA;
      if (aWon) row.losses += 1;
      else row.wins += 1;
    }
  }

  return table;
}

/** Three decimals, the way DUPR shows one. */
export function formatRating(rating: number | undefined) {
  return rating === undefined ? "-" : rating.toFixed(3);
}

export type PlayerRatingRow = {
  player: PlayerProfileRow;
  singles?: PlayerRating;
  doubles?: PlayerRating;
};

/** Everyone who has played a rated pickleball match, best singles rating first. */
export function buildRatingRows(players: PlayerProfileRow[], input: RatingInput): PlayerRatingRow[] {
  const singles = calculateRatings("singles", input);
  const doubles = calculateRatings("doubles", input);
  const playerIds = new Set([...singles.keys(), ...doubles.keys()]);

  return Array.from(playerIds)
    .flatMap((playerId) => {
      const player = players.find((item) => item.id === playerId);
      return player ? [{ player, singles: singles.get(playerId), doubles: doubles.get(playerId) }] : [];
    })
    .sort((a, b) => {
      const best = (row: PlayerRatingRow) => Math.max(row.singles?.rating ?? 0, row.doubles?.rating ?? 0);
      return best(b) - best(a) || a.player.display_name.localeCompare(b.player.display_name);
    });
}
