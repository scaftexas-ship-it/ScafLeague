import assert from "node:assert/strict";
import test from "node:test";
import { advanceKnockoutBrackets, describeKnockoutAdvance, drawOrderTimestamps, isKnockoutLabel, planNextKnockoutRound } from "../lib/knockout.ts";
import type { KnockoutMatch } from "../lib/knockout.ts";
import { generateEliminatorSchedule } from "../lib/league-rules.ts";
import { validateMatchSets } from "../lib/match-scoring.ts";
import type { DivisionEntry } from "../lib/types.ts";

const TODAY = "2026-08-05";

function entries(count: number): DivisionEntry[] {
  return Array.from({ length: count }, (_, index) => ({ id: `e${index + 1}`, divisionId: "d", label: `Seed ${index + 1}`, playerIds: [] }));
}

/** A round-one bracket exactly as the schedule builder creates it, as the knockout planner sees it. */
function drawBracket(count: number, overrides: Partial<KnockoutMatch> = {}) {
  const generated = generateEliminatorSchedule({ divisionId: "d", entries: entries(count), startDate: "2026-07-27", endDate: "2026-09-30" });
  return generated.map(
    (match, index): KnockoutMatch => ({
      id: `m-r1-${index + 1}`,
      round: match.round,
      roundLabel: match.roundLabel || null,
      entryAId: match.entryAId,
      entryBId: match.entryBId,
      status: "scheduled",
      winnerEntryId: null,
      targetScore: 11,
      numberOfSets: 3,
      restrictScoreUpdates: false,
      scoreUpdateBeforeDays: 0,
      scoreUpdateAfterDays: 0,
      allowForfeit: true,
      forfeitBeforeDays: 7,
      forfeitAfterDays: 0,
      scheduleWeekStart: match.scheduleWeekStart,
      scheduleWeekEnd: match.scheduleWeekEnd,
      extensionWeekStart: match.extensionWeekStart,
      extensionWeekEnd: match.extensionWeekEnd,
      ...overrides
    })
  );
}

function decide(match: KnockoutMatch, winner: "a" | "b"): KnockoutMatch {
  return { ...match, status: "completed", winnerEntryId: winner === "a" ? match.entryAId : match.entryBId };
}

const ids = (count: number) => entries(count).map((entry) => entry.id);

test("knockout labels are recognised, manual matchups are not", () => {
  assert.equal(isKnockoutLabel("Quarterfinal"), true);
  assert.equal(isKnockoutLabel("Semifinal"), true);
  assert.equal(isKnockoutLabel("Final"), true);
  assert.equal(isKnockoutLabel("Manual"), false);
  assert.equal(isKnockoutLabel(null), false);
});

test("a division with no knockout matches is left alone", () => {
  assert.deepEqual(planNextKnockoutRound(ids(8), [], TODAY), { kind: "not-a-bracket" });
});

test("quarterfinals aren't advanced while any match is still to play", () => {
  const quarters = drawBracket(8);
  assert.equal(quarters.length, 4);
  const threeDone = [decide(quarters[0], "a"), decide(quarters[1], "a"), decide(quarters[2], "b"), quarters[3]];
  const plan = planNextKnockoutRound(ids(8), threeDone, TODAY);
  assert.deepEqual(plan, { kind: "waiting", round: 1, roundLabel: "Quarterfinal", pending: 1 });
});

test("finished quarterfinals build semifinals: top half of the draw stays on one side", () => {
  // Seeds 1-8 -> 1v8, 2v7, 3v6, 4v5. Every higher seed wins.
  const quarters = drawBracket(8).map((match) => decide(match, "a"));
  assert.deepEqual(
    quarters.map((match) => [match.entryAId, match.entryBId]),
    [["e1", "e8"], ["e2", "e7"], ["e3", "e6"], ["e4", "e5"]]
  );
  const plan = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.equal(plan.round, 2);
  assert.equal(plan.roundLabel, "Semifinal");
  // Winner of 1v8 meets winner of 4v5; winner of 2v7 meets winner of 3v6.
  assert.deepEqual(plan.pairs, [["e1", "e4"], ["e2", "e3"]]);
});

test("an upset moves the bracket, not the seeding: the semifinal follows whoever actually won", () => {
  const quarters = drawBracket(8).map((match, index) => decide(match, index === 0 ? "b" : "a")); // 8 beats 1
  const plan = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.deepEqual(plan.pairs, [["e8", "e4"], ["e2", "e3"]]);
});

test("finished semifinals build the final, and a finished final crowns the champion", () => {
  const quarters = drawBracket(8).map((match) => decide(match, "a"));
  const semiPlan = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(semiPlan.kind, "advance");
  if (semiPlan.kind !== "advance") return;

  const semis: KnockoutMatch[] = semiPlan.pairs.map(([a, b], index) => ({
    ...quarters[0],
    id: `m-r2-${index + 1}`,
    round: 2,
    roundLabel: semiPlan.roundLabel,
    entryAId: a,
    entryBId: b,
    status: "scheduled",
    winnerEntryId: null
  }));
  const bracket = [...quarters, ...semis.map((match) => decide(match, "a"))];
  const finalPlan = planNextKnockoutRound(ids(8), bracket, TODAY);
  assert.equal(finalPlan.kind, "advance");
  if (finalPlan.kind !== "advance") return;
  assert.equal(finalPlan.round, 3);
  assert.equal(finalPlan.roundLabel, "Final");
  assert.deepEqual(finalPlan.pairs, [["e1", "e2"]]);

  const final: KnockoutMatch = { ...semis[0], id: "m-r3-1", round: 3, roundLabel: "Final", entryAId: "e1", entryBId: "e2", status: "scheduled", winnerEntryId: null };
  assert.deepEqual(planNextKnockoutRound(ids(8), [...bracket, final], TODAY), { kind: "waiting", round: 3, roundLabel: "Final", pending: 1 });
  assert.deepEqual(planNextKnockoutRound(ids(8), [...bracket, decide(final, "b")], TODAY), { kind: "complete", championEntryId: "e2" });
});

test("a field that isn't a power of two gives the top seeds a bye, then seats them against the winners", () => {
  // 6 players: seeds 3-6 play round one (3v6, 4v5); seeds 1 and 2 have byes.
  const roundOne = drawBracket(6);
  assert.deepEqual(
    roundOne.map((match) => [match.entryAId, match.entryBId]),
    [["e3", "e6"], ["e4", "e5"]]
  );
  const plan = planNextKnockoutRound(ids(6), roundOne.map((match) => decide(match, "a")), TODAY);
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.equal(plan.roundLabel, "Semifinal");
  // Entrants in draw order: e1, e2 (byes), e3, e4 (winners). Seed 1 meets the winner of 4v5, seed 2 the winner of 3v6.
  assert.deepEqual(plan.pairs, [["e1", "e4"], ["e2", "e3"]]);
});

test("twelve players: four byes, a Pre Quarterfinal, then the Quarterfinal", () => {
  const roundOne = drawBracket(12);
  assert.equal(roundOne.length, 4);
  assert.equal(roundOne[0].roundLabel, "Pre Quarterfinal");
  const plan = planNextKnockoutRound(ids(12), roundOne.map((match) => decide(match, "a")), TODAY);
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.equal(plan.roundLabel, "Quarterfinal");
  assert.equal(plan.pairs.length, 4);
  // Every bye seed (1-4) is seated against a different round-one winner, and nobody is dropped.
  assert.deepEqual(plan.pairs.map(([a]) => a), ["e1", "e2", "e3", "e4"]);
  assert.equal(new Set(plan.pairs.flat()).size, 8);
});

test("a cancelled match with no winner stops the bracket and says why", () => {
  const quarters = drawBracket(8).map((match, index) => (index === 2 ? { ...match, status: "cancelled" } : decide(match, "a")));
  const plan = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(plan.kind, "blocked");
  if (plan.kind !== "blocked") return;
  assert.match(plan.reason, /cancelled with no winner/);
  assert.match(plan.reason, /Match Management/);
});

test("an admin who scores the cancelled match unblocks it", () => {
  const quarters = drawBracket(8).map((match, index) => (index === 2 ? { ...match, status: "cancelled" } : match)).map((match) => decide(match, "a"));
  // decide() sets status completed + a winner, which is what the editor does when an admin scores a cancelled match.
  assert.equal(planNextKnockoutRound(ids(8), quarters, TODAY).kind, "advance");
});

test("a forfeit counts as a result", () => {
  const quarters = drawBracket(8).map((match) => ({ ...match, status: "forfeit", winnerEntryId: match.entryAId }));
  assert.equal(planNextKnockoutRound(ids(8), quarters, TODAY).kind, "advance");
});

test("the next round inherits the winning score, sets and forfeit rules of the round before", () => {
  const quarters = drawBracket(8, { targetScore: 15, numberOfSets: 1, allowForfeit: false, forfeitBeforeDays: 0, restrictScoreUpdates: true, scoreUpdateBeforeDays: 2, scoreUpdateAfterDays: 3 }).map((match) =>
    decide(match, "a")
  );
  const plan = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.deepEqual(plan.settings, {
    targetScore: 15,
    numberOfSets: 1,
    restrictScoreUpdates: true,
    scoreUpdateBeforeDays: 2,
    scoreUpdateAfterDays: 3,
    allowForfeit: false,
    forfeitBeforeDays: 0,
    forfeitAfterDays: 0
  });
});

test("a round that finishes early starts the day after the last one ends, not sooner", () => {
  // Quarterfinals ran 27 Jul - 2 Aug; today is 29 Jul, so the semifinal week opens 3 Aug.
  const quarters = drawBracket(8).map((match) => decide(match, "a"));
  assert.equal(quarters[0].scheduleWeekEnd, "2026-08-02");
  const plan = planNextKnockoutRound(ids(8), quarters, "2026-07-29");
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.equal(plan.scheduleWeekStart, "2026-08-03");
  assert.equal(plan.scheduleWeekEnd, "2026-08-09");
});

test("a round that finishes late doesn't open in the past", () => {
  const quarters = drawBracket(8).map((match) => decide(match, "a"));
  const plan = planNextKnockoutRound(ids(8), quarters, "2026-08-12");
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") return;
  assert.equal(plan.scheduleWeekStart, "2026-08-12");
  assert.equal(plan.scheduleWeekEnd, "2026-08-18");
});

test("knockout rounds keep having no extension week; one that had an extension week passes it on", () => {
  const without = drawBracket(8).map((match) => decide(match, "a"));
  const planWithout = planNextKnockoutRound(ids(8), without, TODAY);
  assert.equal(planWithout.kind, "advance");
  if (planWithout.kind !== "advance") return;
  // The schema needs the extension to start after the schedule week; "none" is the single day after.
  // Quarterfinals ended 2 Aug and today is 5 Aug, so the semifinal week is 5-11 Aug.
  assert.equal(planWithout.scheduleWeekEnd, "2026-08-11");
  assert.equal(planWithout.extensionWeekStart, "2026-08-12");
  assert.equal(planWithout.extensionWeekEnd, "2026-08-12");

  const withExtension = generateEliminatorSchedule({ divisionId: "d", entries: entries(8), startDate: "2026-07-27", endDate: "2026-09-30", extensionWeek: true });
  const quarters = withExtension.map((match, index) =>
    decide(
      {
        id: `m${index}`,
        round: 1,
        roundLabel: "Quarterfinal",
        entryAId: match.entryAId,
        entryBId: match.entryBId,
        status: "scheduled",
        winnerEntryId: null,
        targetScore: 11,
        numberOfSets: 3,
        restrictScoreUpdates: false,
        scoreUpdateBeforeDays: 0,
        scoreUpdateAfterDays: 0,
        allowForfeit: true,
        forfeitBeforeDays: 7,
        forfeitAfterDays: 0,
        scheduleWeekStart: match.scheduleWeekStart,
        scheduleWeekEnd: match.scheduleWeekEnd,
        extensionWeekStart: match.extensionWeekStart,
        extensionWeekEnd: match.extensionWeekEnd
      },
      "a"
    )
  );
  const planWith = planNextKnockoutRound(ids(8), quarters, TODAY);
  assert.equal(planWith.kind, "advance");
  if (planWith.kind !== "advance") return;
  assert.equal(planWith.scheduleWeekEnd, "2026-08-11");
  assert.equal(planWith.extensionWeekStart, "2026-08-12");
  assert.equal(planWith.extensionWeekEnd, "2026-08-18");
});

test("draw-order timestamps are strictly increasing, so a batch insert keeps the order it was drawn in", () => {
  const stamps = drawOrderTimestamps(5, Date.UTC(2026, 7, 5));
  assert.equal(new Set(stamps).size, 5);
  assert.deepEqual([...stamps].sort(), stamps);
});

// ---------------------------------------------------------------------------
// Whole tournaments, played the way the app plays them: a score is entered,
// validated for the sport, and its winner decides the bracket.
// ---------------------------------------------------------------------------

type SetScore = [number, number];

/** Enter a score the way the match editor does, and report the winner it produces -- or fail the test if the sport's rules reject it. */
function winnerFromScore(match: KnockoutMatch, sets: SetScore[], sport: "pickleball" | "tennis") {
  const result = validateMatchSets(
    sets.map(([entryAScore, entryBScore], index) => ({ setNumber: index + 1, entryAScore, entryBScore })),
    { entryAId: match.entryAId, entryBId: match.entryBId, numberOfSets: match.numberOfSets, targetScore: match.targetScore, sport }
  );
  assert.equal(result.ok, true, result.ok ? "" : `${sport} score ${JSON.stringify(sets)} rejected: ${result.error}`);
  return result.ok ? result.winnerEntryId : "";
}

function playRound(bracket: KnockoutMatch[], round: number, scores: SetScore[][], sport: "pickleball" | "tennis") {
  let index = 0;
  return bracket.map((match) => {
    if (match.round !== round) return match;
    const sets = scores[index];
    index += 1;
    // No score supplied: this match is still to be played.
    if (!sets) return match;
    return { ...match, status: "completed", winnerEntryId: winnerFromScore(match, sets, sport) };
  });
}

function addRound(bracket: KnockoutMatch[], plan: ReturnType<typeof planNextKnockoutRound>) {
  assert.equal(plan.kind, "advance");
  if (plan.kind !== "advance") throw new Error("expected an advance");
  const template = bracket[0];
  const created: KnockoutMatch[] = plan.pairs.map(([a, b], index) => ({
    ...template,
    id: `m-r${plan.round}-${index + 1}`,
    round: plan.round,
    roundLabel: plan.roundLabel,
    entryAId: a,
    entryBId: b,
    status: "scheduled",
    winnerEntryId: null,
    targetScore: plan.settings.targetScore,
    numberOfSets: plan.settings.numberOfSets,
    scheduleWeekStart: plan.scheduleWeekStart,
    scheduleWeekEnd: plan.scheduleWeekEnd,
    extensionWeekStart: plan.extensionWeekStart,
    extensionWeekEnd: plan.extensionWeekEnd
  }));
  return { bracket: [...bracket, ...created], plan };
}

test("pickleball: eight players play quarterfinals, semifinals and the final, each round appearing on its own", () => {
  let bracket = drawBracket(8, { targetScore: 11, numberOfSets: 3 });

  // Quarterfinals. 1v8 8 wins in three, 2v7 straight sets, 3v6 straight sets, 4v5 in three.
  bracket = playRound(
    bracket,
    1,
    [
      [[8, 11], [11, 9], [9, 11]],
      [[11, 5], [11, 7]],
      [[11, 3], [12, 10]],
      [[7, 11], [11, 6], [11, 8]]
    ],
    "pickleball"
  );
  let step = addRound(bracket, planNextKnockoutRound(ids(8), bracket, TODAY));
  bracket = step.bracket;
  assert.equal(step.plan.kind === "advance" && step.plan.roundLabel, "Semifinal");
  // Winners: e8, e2, e3, e4 -> e8 v e4 (top half of the draw), e2 v e3.
  assert.deepEqual(
    bracket.filter((match) => match.round === 2).map((match) => [match.entryAId, match.entryBId]),
    [["e8", "e4"], ["e2", "e3"]]
  );
  // Nothing more is built until both semifinals are in.
  assert.equal(planNextKnockoutRound(ids(8), bracket, TODAY).kind, "waiting");

  // Semifinals: a one-semifinal-in-hand state is still waiting.
  const oneSemi = playRound(bracket, 2, [[[11, 6], [11, 8]]], "pickleball");
  assert.equal(planNextKnockoutRound(ids(8), oneSemi, TODAY).kind, "waiting");

  bracket = playRound(
    bracket,
    2,
    [
      [[11, 6], [11, 8]],
      [[9, 11], [11, 4], [13, 11]]
    ],
    "pickleball"
  );
  step = addRound(bracket, planNextKnockoutRound(ids(8), bracket, TODAY));
  bracket = step.bracket;
  assert.equal(step.plan.kind === "advance" && step.plan.roundLabel, "Final");
  assert.deepEqual(
    bracket.filter((match) => match.round === 3).map((match) => [match.entryAId, match.entryBId]),
    [["e8", "e2"]] // e8 beat e4; e2 beat e3 in three (9-11, 11-4, 13-11)
  );

  // The final decides the tournament.
  bracket = playRound(bracket, 3, [[[11, 9], [11, 7]]], "pickleball");
  assert.deepEqual(planNextKnockoutRound(ids(8), bracket, TODAY), { kind: "complete", championEntryId: "e8" });
});

test("tennis: six players with two byes play a play-in, semifinals and the final; sets can end 7-6", () => {
  let bracket = drawBracket(6, { targetScore: 6, numberOfSets: 3 });
  assert.equal(bracket.length, 2);

  // Round one (3v6, 4v5). 3 wins in straight sets including a 7-6 tiebreak, 5 wins in three.
  bracket = playRound(
    bracket,
    1,
    [
      [[6, 3], [7, 6]],
      [[4, 6], [6, 3], [3, 6]]
    ],
    "tennis"
  );
  let step = addRound(bracket, planNextKnockoutRound(ids(6), bracket, TODAY));
  bracket = step.bracket;
  assert.equal(step.plan.kind === "advance" && step.plan.roundLabel, "Semifinal");
  // Byes e1 and e2 now meet the winners: e1 v winner of 4v5 (e5), e2 v winner of 3v6 (e3).
  assert.deepEqual(
    bracket.filter((match) => match.round === 2).map((match) => [match.entryAId, match.entryBId]),
    [["e1", "e5"], ["e2", "e3"]]
  );

  bracket = playRound(
    bracket,
    2,
    [
      [[6, 4], [6, 2]],
      [[7, 5], [3, 6], [7, 6]]
    ],
    "tennis"
  );
  step = addRound(bracket, planNextKnockoutRound(ids(6), bracket, TODAY));
  bracket = step.bracket;
  assert.equal(step.plan.kind === "advance" && step.plan.roundLabel, "Final");
  assert.deepEqual(
    bracket.filter((match) => match.round === 3).map((match) => [match.entryAId, match.entryBId]),
    [["e1", "e2"]]
  );
  assert.equal(step.plan.kind === "advance" && step.plan.settings.targetScore, 6);

  bracket = playRound(bracket, 3, [[[6, 7], [6, 4], [4, 6]]], "tennis");
  assert.deepEqual(planNextKnockoutRound(ids(6), bracket, TODAY), { kind: "complete", championEntryId: "e2" });
});

test("tennis rejects an impossible set, so a bad score can never decide a bracket", () => {
  const match = drawBracket(8, { targetScore: 6 })[0];
  const result = validateMatchSets(
    [
      { setNumber: 1, entryAScore: 8, entryBScore: 6 },
      { setNumber: 2, entryAScore: 6, entryBScore: 2 }
    ],
    { entryAId: match.entryAId, entryBId: match.entryBId, numberOfSets: 3, targetScore: 6, sport: "tennis" }
  );
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// The database side, against an in-memory stand-in for the two tables it reads.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Just enough of supabase-js's query builder for advanceKnockoutBrackets: eq / in / order / limit, awaited, plus insert. */
function fakeSupabase(store: { matches: Row[]; division_entries: Row[] }, options: { failInsert?: boolean } = {}) {
  let nextId = 1000;
  function query(table: "matches" | "division_entries") {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limit = Infinity;
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      order: (column: string, opts: { ascending: boolean }) => (orders.push({ column, ascending: opts.ascending }), builder),
      limit: (count: number) => ((limit = count), builder),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        let rows = store[table].filter((row) => filters.every((filter) => filter(row)));
        rows = [...rows].sort((a, b) => {
          for (const { column, ascending } of orders) {
            const left = String(a[column]);
            const right = String(b[column]);
            if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return resolve({ data: rows.slice(0, limit), error: null });
      }
    };
    return builder;
  }
  return {
    from(table: "matches" | "division_entries") {
      return {
        ...query(table),
        insert: async (rows: Row[]) => {
          if (options.failInsert) return { error: { message: "new row violates row-level security policy" } };
          for (const row of rows) store[table].push({ id: `id-${nextId++}`, winner_entry_id: null, ...row });
          return { error: null };
        }
      };
    }
  } as never;
}

function seedDivision(count: number, sport: { target: number; sets: number }) {
  const store = { matches: [] as Row[], division_entries: [] as Row[] };
  const stamps = drawOrderTimestamps(count, Date.UTC(2026, 6, 20));
  entries(count).forEach((entry, index) => store.division_entries.push({ id: entry.id, division_id: "d", created_at: stamps[index] }));
  const matchStamps = drawOrderTimestamps(8, Date.UTC(2026, 6, 20, 1));
  drawBracket(count, { targetScore: sport.target, numberOfSets: sport.sets }).forEach((match, index) =>
    store.matches.push({
      id: match.id,
      division_id: "d",
      round: match.round,
      round_label: match.roundLabel,
      entry_a_id: match.entryAId,
      entry_b_id: match.entryBId,
      status: match.status,
      winner_entry_id: null,
      target_score: sport.target,
      number_of_sets: sport.sets,
      restrict_score_updates: false,
      score_update_before_days: 0,
      score_update_after_days: 0,
      allow_forfeit: true,
      forfeit_before_days: 7,
      forfeit_after_days: 0,
      schedule_week_start: match.scheduleWeekStart,
      schedule_week_end: match.scheduleWeekEnd,
      extension_week_start: match.extensionWeekStart,
      extension_week_end: match.extensionWeekEnd,
      created_at: matchStamps[index]
    })
  );
  return store;
}

function finish(store: { matches: Row[] }, round: number, winners: Array<"a" | "b">) {
  const roundRows = store.matches.filter((row) => row.round === round).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  roundRows.forEach((row, index) => {
    row.status = "completed";
    row.winner_entry_id = winners[index] === "a" ? row.entry_a_id : row.entry_b_id;
  });
}

test("the database pass builds each round only once the last one is finished, then stops", async () => {
  const store = seedDivision(8, { target: 11, sets: 3 });

  // Nothing decided yet: nothing created.
  let results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.deepEqual(results, [{ divisionId: "d", outcome: "waiting", roundLabel: "Quarterfinal", pending: 4 }]);
  assert.equal(store.matches.length, 4);

  // Quarterfinals finish -> exactly two semifinals appear.
  finish(store, 1, ["a", "a", "a", "a"]);
  results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.deepEqual(results.map((result) => result.outcome), ["created", "waiting"]);
  assert.equal(store.matches.length, 6);
  const semis = store.matches.filter((row) => row.round === 2);
  assert.deepEqual(semis.map((row) => [row.entry_a_id, row.entry_b_id]), [["e1", "e4"], ["e2", "e3"]]);
  assert.ok(semis.every((row) => row.round_label === "Semifinal" && row.status === "scheduled"));

  // Running it again with nothing new does nothing -- no duplicate semifinals.
  await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.equal(store.matches.length, 6);

  // Semifinals finish -> one final.
  finish(store, 2, ["a", "b"]);
  results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.equal(describeKnockoutAdvance(results), "Final created (1 match).");
  const final = store.matches.filter((row) => row.round === 3);
  assert.equal(final.length, 1);
  assert.deepEqual([final[0].entry_a_id, final[0].entry_b_id], ["e1", "e3"]);

  // The final finishes -> champion, nothing more built.
  finish(store, 3, ["b"]);
  results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.deepEqual(results, [{ divisionId: "d", outcome: "complete", championEntryId: "e3" }]);
  assert.equal(store.matches.length, 7);
});

test("the database pass carries tennis scoring rules into every round it builds", async () => {
  const store = seedDivision(6, { target: 6, sets: 3 });
  finish(store, 1, ["a", "b"]);
  await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  const semis = store.matches.filter((row) => row.round === 2);
  assert.equal(semis.length, 2);
  assert.ok(semis.every((row) => row.target_score === 6 && row.number_of_sets === 3));
  // Byes e1/e2 are seated against the round-one winners (e3, e5).
  assert.deepEqual(semis.map((row) => [row.entry_a_id, row.entry_b_id]), [["e1", "e5"], ["e2", "e3"]]);
});

test("the database pass can finish a back-filled bracket in a single call", async () => {
  // Quarterfinals are in, and so are semifinals that an admin typed in by hand-edit.
  const store = seedDivision(8, { target: 11, sets: 3 });
  finish(store, 1, ["a", "a", "a", "a"]);
  await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  finish(store, 2, ["a", "a"]);
  const results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.deepEqual(results.map((result) => result.outcome), ["created", "waiting"]);
  assert.equal(store.matches.filter((row) => row.round === 3).length, 1);
});

test("a database failure comes back as an error result instead of throwing", async () => {
  const store = seedDivision(8, { target: 11, sets: 3 });
  finish(store, 1, ["a", "a", "a", "a"]);
  const results = await advanceKnockoutBrackets(fakeSupabase(store, { failInsert: true }), ["d"], TODAY);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, "error");
  assert.equal(store.matches.length, 4);
});

test("a cancelled quarterfinal is reported as blocked, and nothing is built", async () => {
  const store = seedDivision(8, { target: 11, sets: 3 });
  finish(store, 1, ["a", "a", "a", "a"]);
  store.matches[1].status = "cancelled";
  store.matches[1].winner_entry_id = null;
  const results = await advanceKnockoutBrackets(fakeSupabase(store), ["d"], TODAY);
  assert.equal(results[0].outcome, "blocked");
  assert.match(describeKnockoutAdvance(results), /cancelled with no winner/);
  assert.equal(store.matches.length, 4);
});

test("round-robin divisions are never touched", async () => {
  const store = { matches: [{ id: "rr1", division_id: "league", round: 1, round_label: null, status: "completed" }] as Row[], division_entries: [] as Row[] };
  const results = await advanceKnockoutBrackets(fakeSupabase(store), ["league"], TODAY);
  assert.deepEqual(results, []);
  assert.equal(store.matches.length, 1);
});
