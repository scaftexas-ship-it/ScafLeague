import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStandings,
  canClaimForfeit,
  expireUnplayedMatches,
  generateEliminatorSchedule,
  generateRoundRobinSchedule,
  rankEntriesByStandings
} from "../lib/league-rules.ts";
import type { DivisionEntry, Match } from "../lib/types.ts";

const entries: DivisionEntry[] = [
  { id: "e-1", divisionId: "d-1", label: "A", playerIds: ["p-1"] },
  { id: "e-2", divisionId: "d-1", label: "B", playerIds: ["p-2"] },
  { id: "e-3", divisionId: "d-1", label: "C", playerIds: ["p-3"] },
  { id: "e-4", divisionId: "d-1", label: "D", playerIds: ["p-4"] }
];

test("generates even round robin with one match per entry per week", () => {
  const matches = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries,
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(matches.length, 6);
  assert.equal(new Set(matches.map((match) => [match.entryAId, match.entryBId].sort().join(":"))).size, 6);

  for (const round of new Set(matches.map((match) => match.round))) {
    const used = new Set<string>();
    for (const match of matches.filter((item) => item.round === round)) {
      assert.equal(used.has(match.entryAId), false);
      assert.equal(used.has(match.entryBId), false);
      used.add(match.entryAId);
      used.add(match.entryBId);
    }
  }
});

test("generates odd round robin with byes", () => {
  const matches = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries: entries.slice(0, 3),
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(matches.length, 3);
  assert.equal(new Set(matches.map((match) => [match.entryAId, match.entryBId].sort().join(":"))).size, 3);
});

test("schedules round robin rounds every week", () => {
  const matches = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries,
    startDate: "2026-07-06",
    endDate: "2026-07-20"
  });

  const roundStarts = Array.from(new Set(matches.map((match) => match.scheduleWeekStart)));
  assert.deepEqual(roundStarts, ["2026-07-06", "2026-07-13", "2026-07-20"]);
});

test("generates quarterfinal eliminator matches for eight entries", () => {
  const matches = generateEliminatorSchedule({
    divisionId: "d-1",
    entries: [
      ...entries,
      { id: "e-5", divisionId: "d-1", label: "E", playerIds: ["p-5"] },
      { id: "e-6", divisionId: "d-1", label: "F", playerIds: ["p-6"] },
      { id: "e-7", divisionId: "d-1", label: "G", playerIds: ["p-7"] },
      { id: "e-8", divisionId: "d-1", label: "H", playerIds: ["p-8"] }
    ],
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(matches.length, 4);
  assert.equal(matches.every((match) => match.roundLabel === "Quarterfinal"), true);
  assert.equal(new Set(matches.flatMap((match) => [match.entryAId, match.entryBId])).size, 8);
});

test("generates pre-quarter eliminator play-in matches when entries need byes", () => {
  const twelveEntries = Array.from({ length: 12 }, (_, index) => ({
    id: `e-${index + 1}`,
    divisionId: "d-1",
    label: String.fromCharCode(65 + index),
    playerIds: [`p-${index + 1}`]
  }));
  const matches = generateEliminatorSchedule({
    divisionId: "d-1",
    entries: twelveEntries,
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(matches.length, 4);
  assert.equal(matches.every((match) => match.roundLabel === "Pre Quarterfinal"), true);
});

test("generateEliminatorSchedule seeds by input order (best plays worst), not alphabetically", () => {
  // Deliberately out of alphabetical order: entries[0] is the top seed.
  const seeded: DivisionEntry[] = [
    { id: "e-4", divisionId: "d-1", label: "D (seed 1)", playerIds: [] },
    { id: "e-3", divisionId: "d-1", label: "C (seed 2)", playerIds: [] },
    { id: "e-2", divisionId: "d-1", label: "B (seed 3)", playerIds: [] },
    { id: "e-1", divisionId: "d-1", label: "A (seed 4)", playerIds: [] }
  ];
  const matches = generateEliminatorSchedule({ divisionId: "d-1", entries: seeded, startDate: "2026-07-06", endDate: "2026-09-30" });

  assert.equal(matches.length, 2);
  // Seed 1 vs seed 4, seed 2 vs seed 3 -- classic bracket seeding, not "A vs B" alphabetical.
  const pairs = matches.map((match) => [match.entryAId, match.entryBId].sort());
  assert.deepEqual(pairs, [
    ["e-1", "e-4"],
    ["e-2", "e-3"]
  ]);
});

test("rankEntriesByStandings orders entries best-to-worst by current results", () => {
  const played: Match = {
    id: "m-1",
    divisionId: "d-1",
    round: 1,
    entryAId: "e-1",
    entryBId: "e-2",
    scheduleWeekStart: "2026-07-06",
    scheduleWeekEnd: "2026-07-12",
    extensionWeekStart: "2026-07-13",
    extensionWeekEnd: "2026-07-19",
    status: "completed",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 5 },
      { setNumber: 2, entryAScore: 11, entryBScore: 7 }
    ]
  };
  const ranked = rankEntriesByStandings(entries, [played]);
  // e-1 won (4 points), e-2 lost with no sets won (1 point); e-3/e-4 haven't
  // played yet and sort after anyone with a standings row.
  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ["e-1", "e-2", "e-3", "e-4"]
  );
});

test("cross-group seeding: concatenating two divisions' ranked top-N gives an all-cross-division first round", () => {
  // Two divisions, top 2 from each, ranked best-to-worst within their own group.
  const groupA: DivisionEntry[] = [
    { id: "a-1", divisionId: "div-a", label: "A1", playerIds: [] },
    { id: "a-2", divisionId: "div-a", label: "A2", playerIds: [] }
  ];
  const groupB: DivisionEntry[] = [
    { id: "b-1", divisionId: "div-b", label: "B1", playerIds: [] },
    { id: "b-2", divisionId: "div-b", label: "B2", playerIds: [] }
  ];
  // Exactly what QualifierPicker builds: division A's ranked block, then division B's ranked block.
  const seeded = [...groupA, ...groupB];
  const matches = generateEliminatorSchedule({ divisionId: "qf-division", entries: seeded, startDate: "2026-07-06", endDate: "2026-09-30" });

  assert.equal(matches.length, 2);
  for (const match of matches) {
    const aIsGroupA = match.entryAId.startsWith("a-");
    const bIsGroupA = match.entryBId.startsWith("a-");
    assert.notEqual(aIsGroupA, bIsGroupA, `expected a cross-group match, got ${match.entryAId} vs ${match.entryBId}`);
  }
});

test("forfeit can only be claimed during scheduled week by a match entry", () => {
  const [match] = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries: entries.slice(0, 2),
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(canClaimForfeit(match, match.entryAId, "2026-07-06"), true);
  assert.equal(canClaimForfeit({ ...match, allowForfeit: false }, match.entryAId, "2026-07-06"), false);
  assert.equal(canClaimForfeit(match, "other", "2026-07-06"), false);
  assert.equal(canClaimForfeit(match, match.entryAId, "2026-07-14"), false);
  assert.equal(canClaimForfeit({ ...match, status: "completed" }, match.entryAId, "2026-07-06"), false);
});

test("unplayed matches cancel after extension week", () => {
  const [match] = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries: entries.slice(0, 2),
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(expireUnplayedMatches([match], "2026-07-19")[0].status, "scheduled");
  assert.equal(expireUnplayedMatches([match], "2026-07-20")[0].status, "cancelled");
});

test("scores 2-0, 2-1, forfeit, and cancelled matches", () => {
  const played20: Match = {
    id: "m-1",
    divisionId: "d-1",
    round: 1,
    entryAId: "e-1",
    entryBId: "e-2",
    scheduleWeekStart: "2026-07-06",
    scheduleWeekEnd: "2026-07-12",
    extensionWeekStart: "2026-07-13",
    extensionWeekEnd: "2026-07-19",
    status: "completed",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 5 },
      { setNumber: 2, entryAScore: 11, entryBScore: 7 }
    ]
  };
  const played21: Match = {
    ...played20,
    id: "m-2",
    entryAId: "e-3",
    entryBId: "e-4",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 4 },
      { setNumber: 2, entryAScore: 7, entryBScore: 11 },
      { setNumber: 3, entryAScore: 11, entryBScore: 8 }
    ]
  };
  const forfeit: Match = {
    ...played20,
    id: "m-3",
    entryAId: "e-1",
    entryBId: "e-3",
    status: "forfeit",
    winnerEntryId: "e-1",
    forfeitByEntryId: "e-1",
    sets: []
  };
  const cancelled: Match = {
    ...played20,
    id: "m-4",
    entryAId: "e-2",
    entryBId: "e-4",
    status: "cancelled",
    sets: []
  };

  const standings = calculateStandings(entries, [played20, played21, forfeit, cancelled]);
  const byId = Object.fromEntries(standings.map((standing) => [standing.entryId, standing]));

  assert.equal(byId["e-1"].points, 8);
  assert.equal(byId["e-2"].points, 1);
  assert.equal(byId["e-3"].points, 4);
  assert.equal(byId["e-4"].points, 2);
  assert.equal(byId["e-2"].cancelled, 1);
  assert.equal(byId["e-4"].cancelled, 1);
});

test("bonus points: played gets 1, winning at least one set adds 1 more, matching the admin's spec examples", () => {
  const pair: DivisionEntry[] = [
    { id: "a", divisionId: "d-1", label: "A", playerIds: ["p-a"] },
    { id: "b", divisionId: "d-1", label: "B", playerIds: ["p-b"] }
  ];
  const base = {
    divisionId: "d-1",
    round: 1,
    entryAId: "a",
    entryBId: "b",
    scheduleWeekStart: "2026-07-06",
    scheduleWeekEnd: "2026-07-12",
    extensionWeekStart: "2026-07-13",
    extensionWeekEnd: "2026-07-19"
  } as const;

  // Example 1: A wins 11-5, 6-11, 11-7 (2-1) -- A gets 4 for the win, B gets
  // 1 for playing plus 1 more for winning a set (set 2) = 2.
  const threeSetWin: Match = {
    ...base,
    id: "m-1",
    status: "completed",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 5 },
      { setNumber: 2, entryAScore: 6, entryBScore: 11 },
      { setNumber: 3, entryAScore: 11, entryBScore: 7 }
    ]
  };
  const threeSetStandings = calculateStandings(pair, [threeSetWin]);
  const threeSetById = Object.fromEntries(threeSetStandings.map((s) => [s.entryId, s]));
  assert.equal(threeSetById.a.points, 4);
  assert.equal(threeSetById.b.points, 2);

  // Example 2: A wins 11-5, 11-7 (straight sets) -- A gets 4, B gets just
  // the 1 played point since B won zero sets.
  const straightSetWin: Match = {
    ...base,
    id: "m-2",
    status: "completed",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 5 },
      { setNumber: 2, entryAScore: 11, entryBScore: 7 }
    ]
  };
  const straightSetStandings = calculateStandings(pair, [straightSetWin]);
  const straightSetById = Object.fromEntries(straightSetStandings.map((s) => [s.entryId, s]));
  assert.equal(straightSetById.a.points, 4);
  assert.equal(straightSetById.b.points, 1);

  // Forfeit: the forfeiting player gets 0, the winner gets 4.
  const forfeited: Match = { ...base, id: "m-3", status: "forfeit", winnerEntryId: "a", forfeitByEntryId: "b", sets: [] };
  const forfeitStandings = calculateStandings(pair, [forfeited]);
  const forfeitById = Object.fromEntries(forfeitStandings.map((s) => [s.entryId, s]));
  assert.equal(forfeitById.a.points, 4);
  assert.equal(forfeitById.b.points, 0);

  // Cancelled (deadline passed): both players get 0.
  const cancelledMatch: Match = { ...base, id: "m-4", status: "cancelled", sets: [] };
  const cancelledStandings = calculateStandings(pair, [cancelledMatch]);
  const cancelledById = Object.fromEntries(cancelledStandings.map((s) => [s.entryId, s]));
  assert.equal(cancelledById.a.points, 0);
  assert.equal(cancelledById.b.points, 0);
});

test("calculateStandings uses a club's custom scoring rules instead of the 4/1/1 default when given one", () => {
  const pair: DivisionEntry[] = [
    { id: "a", divisionId: "d-1", label: "A", playerIds: ["p-a"] },
    { id: "b", divisionId: "d-1", label: "B", playerIds: ["p-b"] }
  ];
  // A wins 2-1 (won 2 sets, lost 1) -- with custom rules (3 for a win, 0 for
  // a played loss, 2 bonus for winning a set while losing), B should get
  // just the 2-point set-win bonus and nothing for merely playing.
  const match: Match = {
    divisionId: "d-1",
    round: 1,
    id: "m-1",
    entryAId: "a",
    entryBId: "b",
    scheduleWeekStart: "2026-07-06",
    scheduleWeekEnd: "2026-07-12",
    extensionWeekStart: "2026-07-13",
    extensionWeekEnd: "2026-07-19",
    status: "completed",
    sets: [
      { setNumber: 1, entryAScore: 11, entryBScore: 5 },
      { setNumber: 2, entryAScore: 6, entryBScore: 11 },
      { setNumber: 3, entryAScore: 11, entryBScore: 7 }
    ]
  };

  const standings = calculateStandings(pair, [match], { pointsPerWin: 3, pointsPerPlayedLoss: 0, bonusPointPerSetWonWhenLost: 2 });
  const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
  assert.equal(byId.a.points, 3);
  assert.equal(byId.b.points, 2);
});
