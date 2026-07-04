import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStandings,
  canClaimForfeit,
  expireUnplayedMatches,
  generateEliminatorSchedule,
  generateRoundRobinSchedule
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

test("forfeit can only be claimed during scheduled week by a match entry", () => {
  const [match] = generateRoundRobinSchedule({
    divisionId: "d-1",
    entries: entries.slice(0, 2),
    startDate: "2026-07-06",
    endDate: "2026-09-30"
  });

  assert.equal(canClaimForfeit(match, match.entryAId, "2026-07-06"), true);
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
