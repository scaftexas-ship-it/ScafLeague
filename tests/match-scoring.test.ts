import assert from "node:assert/strict";
import test from "node:test";
import { buildSetsFromForm, getWinnerEntryId, isValidCompletedSet, validateMatchSets } from "../lib/match-scoring.ts";

test("buildSetsFromForm skips blank set rows and parses the rest", () => {
  const sets = buildSetsFromForm({ set1A: "11", set1B: "5", set2A: "11", set2B: "7", set3A: "", set3B: "" });
  assert.deepEqual(sets, [
    { setNumber: 1, entryAScore: 11, entryBScore: 5 },
    { setNumber: 2, entryAScore: 11, entryBScore: 7 }
  ]);
});

test("getWinnerEntryId requires a majority of sets", () => {
  const match = { entryAId: "a", entryBId: "b", numberOfSets: 3 };
  const straightSets = [
    { setNumber: 1, entryAScore: 11, entryBScore: 5 },
    { setNumber: 2, entryAScore: 11, entryBScore: 7 }
  ];
  assert.equal(getWinnerEntryId(match, straightSets), "a");

  const oneSetOnly = [{ setNumber: 1, entryAScore: 11, entryBScore: 5 }];
  assert.equal(getWinnerEntryId(match, oneSetOnly), undefined);

  const tied = [
    { setNumber: 1, entryAScore: 11, entryBScore: 5 },
    { setNumber: 2, entryAScore: 5, entryBScore: 11 }
  ];
  assert.equal(getWinnerEntryId(match, tied), undefined);
});

test("isValidCompletedSet requires target score and a 2-point margin", () => {
  assert.equal(isValidCompletedSet(11, 0, 11), true);
  assert.equal(isValidCompletedSet(11, 9, 11), true);
  assert.equal(isValidCompletedSet(13, 11, 11), true);
  assert.equal(isValidCompletedSet(11, 10, 11), false);
  assert.equal(isValidCompletedSet(9, 6, 11), false);
  assert.equal(isValidCompletedSet(5, 6, 11), false);
});

test("validateMatchSets rejects a 3rd set entered after a 2-0 majority", () => {
  const match = { entryAId: "a", entryBId: "b", numberOfSets: 3, targetScore: 11 };
  const decidedThenExtraSet = [
    { setNumber: 1, entryAScore: 11, entryBScore: 0 },
    { setNumber: 2, entryAScore: 11, entryBScore: 0 },
    { setNumber: 3, entryAScore: 5, entryBScore: 6 }
  ];
  const result = validateMatchSets(decidedThenExtraSet, match);
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", /already decided/);
});

test("validateMatchSets rejects an invalid (not-yet-finished) set score", () => {
  const match = { entryAId: "a", entryBId: "b", numberOfSets: 3, targetScore: 11 };
  const invalidSet = [
    { setNumber: 1, entryAScore: 11, entryBScore: 0 },
    { setNumber: 2, entryAScore: 5, entryBScore: 6 }
  ];
  const result = validateMatchSets(invalidSet, match);
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", /valid finished set/);
});

test("validateMatchSets accepts a clean 2-0 result", () => {
  const match = { entryAId: "a", entryBId: "b", numberOfSets: 3, targetScore: 11 };
  const straightSets = [
    { setNumber: 1, entryAScore: 11, entryBScore: 5 },
    { setNumber: 2, entryAScore: 11, entryBScore: 7 }
  ];
  const result = validateMatchSets(straightSets, match);
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.winnerEntryId : undefined, "a");
});

test("isValidCompletedSet handles tennis's tiebreak exception at target+1 games", () => {
  // Normal games: reach 6 with a 2-game lead.
  assert.equal(isValidCompletedSet(6, 0, 6, "tennis"), true);
  assert.equal(isValidCompletedSet(6, 4, 6, "tennis"), true);
  assert.equal(isValidCompletedSet(6, 5, 6, "tennis"), false); // must continue past 6-5

  // Extended set: 7-5 (2-game lead reached at 7).
  assert.equal(isValidCompletedSet(7, 5, 6, "tennis"), true);

  // Tiebreak set: 7-6 (1-game lead only valid at the tiebreak score).
  assert.equal(isValidCompletedSet(7, 6, 6, "tennis"), true);
  assert.equal(isValidCompletedSet(6, 7, 6, "tennis"), true);

  // Never valid: games can't run past target+1 (tiebreak always resolves the set).
  assert.equal(isValidCompletedSet(8, 6, 6, "tennis"), false);
  assert.equal(isValidCompletedSet(9, 7, 6, "tennis"), false);

  // Pickleball's plain win-by-2 rule must still apply when sport is omitted/non-tennis.
  assert.equal(isValidCompletedSet(11, 9, 11), true);
  assert.equal(isValidCompletedSet(11, 9, 11, "pickleball"), true);
});

test("validateMatchSets accepts a tennis 7-6 tiebreak set and rejects an invalid 8-6", () => {
  const match = { entryAId: "a", entryBId: "b", numberOfSets: 3, targetScore: 6, sport: "tennis" as const };

  const tiebreakWin = validateMatchSets(
    [
      { setNumber: 1, entryAScore: 6, entryBScore: 3 },
      { setNumber: 2, entryAScore: 7, entryBScore: 6 }
    ],
    match
  );
  assert.equal(tiebreakWin.ok, true);
  assert.equal(tiebreakWin.ok ? tiebreakWin.winnerEntryId : undefined, "a");

  const invalidEightSix = validateMatchSets(
    [
      { setNumber: 1, entryAScore: 6, entryBScore: 3 },
      { setNumber: 2, entryAScore: 8, entryBScore: 6 }
    ],
    match
  );
  assert.equal(invalidEightSix.ok, false);
});
