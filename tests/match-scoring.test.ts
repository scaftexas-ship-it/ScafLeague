import assert from "node:assert/strict";
import test from "node:test";
import { buildSetsFromForm, getWinnerEntryId } from "../lib/match-scoring.ts";

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
