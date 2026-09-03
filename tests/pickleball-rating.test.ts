import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RATING,
  MIN_RATING,
  PROVISIONAL_MATCHES,
  START_RATING,
  buildRatingRows,
  calculateRatings,
  expectedShare,
  formatRating
} from "../lib/pickleball-rating.ts";
import type { RatingInput } from "../lib/pickleball-rating.ts";
import type { DivisionEntryRow, MatchRow, MatchSetRow, PlayerProfileRow, TeamMemberRow } from "../lib/admin-data.ts";

const entries: DivisionEntryRow[] = [
  { id: "eA", division_id: "d", label: "A", player_id: "pA", team_id: null },
  { id: "eB", division_id: "d", label: "B", player_id: "pB", team_id: null },
  { id: "eC", division_id: "d", label: "C", player_id: "pC", team_id: null },
  { id: "tAB", division_id: "d", label: "A / B", player_id: null, team_id: "t1" },
  { id: "tCD", division_id: "d", label: "C / D", player_id: null, team_id: "t2" }
];
const teamMembers: TeamMemberRow[] = [
  { team_id: "t1", player_id: "pA" }, { team_id: "t1", player_id: "pB" },
  { team_id: "t2", player_id: "pC" }, { team_id: "t2", player_id: "pD" }
];

let seq = 0;
function match(a: string, b: string, date = "2026-08-09"): MatchRow {
  seq += 1;
  return {
    id: `m${seq}`, division_id: "d", entry_a_id: a, entry_b_id: b, round: seq, round_label: null,
    status: "completed", schedule_week_start: date, schedule_week_end: date,
    extension_week_start: date, extension_week_end: date, target_score: 11, number_of_sets: 3,
    winner_entry_id: null, forfeit_by_entry_id: null, restrict_score_updates: false,
    score_update_before_days: 0, score_update_after_days: 0
  } as MatchRow;
}
function sets(matchId: string, pairs: Array<[number, number]>): MatchSetRow[] {
  return pairs.map(([a, b], i) => ({ id: `${matchId}-${i}`, match_id: matchId, set_number: i + 1, entry_a_score: a, entry_b_score: b }) as MatchSetRow);
}
function input(ms: MatchRow[], ss: MatchSetRow[]): RatingInput {
  return { matches: ms, matchSets: ss, entries, teamMembers };
}

test("everyone starts level, so an even match barely moves anyone", () => {
  const m = match("eA", "eB");
  const r = calculateRatings("singles", input([m], sets(m.id, [[11, 9], [9, 11], [11, 9]])));
  // A won, so A is up and B is down, but a three-game squeaker is a small move.
  assert.ok(r.get("pA")!.rating > START_RATING);
  assert.ok(r.get("pB")!.rating < START_RATING);
  assert.ok(r.get("pA")!.rating - START_RATING < 0.1, "a close win is a small move");
});

test("the margin matters, not just the win", () => {
  const close = match("eA", "eB");
  const rout = match("eA", "eB");
  const closeWin = calculateRatings("singles", input([close], sets(close.id, [[11, 9], [11, 9]]))).get("pA")!.rating;
  const bigWin = calculateRatings("singles", input([rout], sets(rout.id, [[11, 0], [11, 0]]))).get("pA")!.rating;
  assert.ok(bigWin > closeWin, "an 11-0, 11-0 win should count for more than 11-9, 11-9");
});

test("losing narrowly costs less than losing badly", () => {
  const close = match("eA", "eB");
  const heavy = match("eA", "eB");
  const closeLoss = calculateRatings("singles", input([close], sets(close.id, [[9, 11], [9, 11]]))).get("pA")!.rating;
  const heavyLoss = calculateRatings("singles", input([heavy], sets(heavy.id, [[0, 11], [0, 11]]))).get("pA")!.rating;
  assert.ok(closeLoss > heavyLoss);
  assert.ok(closeLoss < START_RATING, "a loss is still a loss");
});

test("who you beat decides what it is worth", () => {
  // Build C up first, then compare beating strong C against beating fresh B.
  const climb = [1, 2, 3, 4, 5, 6].map(() => match("eC", "eB"));
  const climbSets = climb.flatMap((m) => sets(m.id, [[11, 0], [11, 0]]));
  const beatStrong = match("eA", "eC");
  const beatFresh = match("eA", "eB");

  const withStrong = calculateRatings("singles", input([...climb, beatStrong], [...climbSets, ...sets(beatStrong.id, [[11, 5], [11, 5]])]));
  const withFresh = calculateRatings("singles", input([beatFresh], sets(beatFresh.id, [[11, 5], [11, 5]])));

  assert.ok(withStrong.get("pC")!.rating > START_RATING + 0.3, "C really did climb");
  assert.ok(withStrong.get("pA")!.rating > withFresh.get("pA")!.rating, "beating the stronger player is worth more");
});

test("singles and doubles are kept apart", () => {
  const s = match("eA", "eB");
  const d = match("tAB", "tCD");
  const all = input([s, d], [...sets(s.id, [[11, 0], [11, 0]]), ...sets(d.id, [[0, 11], [0, 11]])]);

  const singles = calculateRatings("singles", all);
  const doubles = calculateRatings("doubles", all);

  // A swept in singles and was swept in doubles -- the two must not cancel out.
  assert.ok(singles.get("pA")!.rating > START_RATING);
  assert.ok(doubles.get("pA")!.rating < START_RATING);
  assert.equal(singles.get("pD"), undefined, "a doubles-only player has no singles rating");
  assert.equal(doubles.get("pA")!.matches, 1);
});

test("both partners move together on a doubles result", () => {
  const d = match("tAB", "tCD");
  const r = calculateRatings("doubles", input([d], sets(d.id, [[11, 4], [11, 6]])));
  assert.equal(r.get("pA")!.rating, r.get("pB")!.rating);
  assert.ok(r.get("pC")!.rating < START_RATING && r.get("pC")!.rating === r.get("pD")!.rating);
});

test("a rating is provisional until enough matches back it up", () => {
  const played = Array.from({ length: PROVISIONAL_MATCHES }, () => match("eA", "eB"));
  const r = calculateRatings("singles", input(played, played.flatMap((m) => sets(m.id, [[11, 5], [11, 5]]))));
  assert.equal(r.get("pA")!.matches, PROVISIONAL_MATCHES);
  assert.equal(r.get("pA")!.provisional, false);

  const one = match("eA", "eB");
  const rOne = calculateRatings("singles", input([one], sets(one.id, [[11, 5], [11, 5]])));
  assert.equal(rOne.get("pA")!.provisional, true);
});

test("ratings stay inside the scale however lopsided the season", () => {
  const sweeps = Array.from({ length: 60 }, () => match("eA", "eB"));
  const r = calculateRatings("singles", input(sweeps, sweeps.flatMap((m) => sets(m.id, [[11, 0], [11, 0]]))));
  assert.ok(r.get("pA")!.rating <= MAX_RATING && r.get("pA")!.rating >= MIN_RATING);
  assert.ok(r.get("pB")!.rating >= MIN_RATING);
  assert.equal(r.get("pA")!.wins, 60);
  assert.equal(r.get("pB")!.losses, 60);
});

test("forfeits and unplayed matches are not rated", () => {
  const forfeit = { ...match("eA", "eB"), status: "forfeit" } as MatchRow;
  const scheduled = { ...match("eA", "eB"), status: "scheduled" } as MatchRow;
  const scoreless = match("eA", "eB");
  const r = calculateRatings("singles", input([forfeit, scheduled, scoreless], []));
  assert.equal(r.size, 0, "nothing to learn from a match with no games");
});

test("the same results always give the same numbers, whatever order they arrive in", () => {
  const a = match("eA", "eB", "2026-08-09");
  const b = match("eB", "eC", "2026-08-16");
  const s = [...sets(a.id, [[11, 7], [11, 8]]), ...sets(b.id, [[11, 6], [9, 11], [11, 7]])];
  const forwards = calculateRatings("singles", input([a, b], s));
  const backwards = calculateRatings("singles", input([b, a], s));
  for (const id of ["pA", "pB", "pC"]) {
    assert.equal(forwards.get(id)!.rating, backwards.get(id)!.rating, id);
  }
});

test("expected share follows the rating gap", () => {
  assert.equal(expectedShare(4, 4), 0.5);
  assert.ok(expectedShare(5, 4) > 0.9, "a full point of rating is a heavy favourite");
  assert.ok(expectedShare(3, 4) < 0.1);
  assert.equal(formatRating(3.5), "3.500");
  assert.equal(formatRating(undefined), "-");
});

test("rows list each player's two ratings, best first", () => {
  const players = [
    { id: "pA", display_name: "Ann" }, { id: "pB", display_name: "Bob" },
    { id: "pC", display_name: "Cy" }, { id: "pD", display_name: "Di" }
  ] as PlayerProfileRow[];
  const s = match("eA", "eB");
  const d = match("tAB", "tCD");
  const rows = buildRatingRows(players, input([s, d], [...sets(s.id, [[11, 2], [11, 3]]), ...sets(d.id, [[11, 4], [11, 5]])]));
  assert.equal(rows[0].player.display_name, "Ann", "Ann won both, so she leads");
  assert.ok(rows[0].singles && rows[0].doubles);
  const di = rows.find((r) => r.player.display_name === "Di")!;
  assert.equal(di.singles, undefined, "Di only played doubles");
  assert.ok(di.doubles);
});
