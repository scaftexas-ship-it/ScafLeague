import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaderboard, monthEndIso, periodRange, rankBySteps, totalSteps, weekStartIso } from "../lib/walkathon.ts";
import type { WalkathonStepEntryRow } from "../lib/walkathon-data.ts";

function entry(playerId: string, entryDate: string, steps: number, coversWeek = false): WalkathonStepEntryRow {
  return { id: `${playerId}-${entryDate}`, walkathon_id: "w-1", player_id: playerId, entry_date: entryDate, covers_week: coversWeek, steps };
}

test("a week starts on Monday, and Sunday belongs to the week that already began", () => {
  // 2026-08-10 is a Monday.
  assert.equal(weekStartIso("2026-08-10"), "2026-08-10");
  assert.equal(weekStartIso("2026-08-13"), "2026-08-10");
  // Sunday the 16th closes that same week rather than opening a new one.
  assert.equal(weekStartIso("2026-08-16"), "2026-08-10");
  assert.equal(weekStartIso("2026-08-17"), "2026-08-17");
});

test("month end lands on the real last day, including a leap February", () => {
  assert.equal(monthEndIso("2026-08-13"), "2026-08-31");
  assert.equal(monthEndIso("2026-02-05"), "2026-02-28");
  assert.equal(monthEndIso("2028-02-05"), "2028-02-29");
});

test("period ranges cover the whole week and month, and 'all' is unbounded", () => {
  assert.deepEqual(periodRange("week", "2026-08-13"), { start: "2026-08-10", end: "2026-08-16" });
  assert.deepEqual(periodRange("month", "2026-08-13"), { start: "2026-08-01", end: "2026-08-31" });
  assert.deepEqual(periodRange("all", "2026-08-13"), { start: null, end: null });
});

test("a weekly post and seven daily posts total the same for that week", () => {
  const { start, end } = periodRange("week", "2026-08-13");
  const weekly = [entry("p-1", "2026-08-10", 70000, true)];
  const daily = ["10", "11", "12", "13", "14", "15", "16"].map((d) => entry("p-2", `2026-08-${d}`, 10000));
  assert.equal(totalSteps(weekly, start, end), 70000);
  assert.equal(totalSteps(daily, start, end), 70000);
});

test("steps outside the period are excluded", () => {
  const { start, end } = periodRange("week", "2026-08-13");
  const entries = [entry("p-1", "2026-08-09", 5000), entry("p-1", "2026-08-13", 8000), entry("p-1", "2026-08-17", 9000)];
  assert.equal(totalSteps(entries, start, end), 8000);
  // All time keeps every one of them.
  assert.equal(totalSteps(entries, null, null), 22000);
});

test("equal totals share a rank and the next player skips ahead", () => {
  const ranked = rankBySteps([
    { playerId: "a", steps: 50000, entries: 5 },
    { playerId: "b", steps: 30000, entries: 3 },
    { playerId: "c", steps: 30000, entries: 4 },
    { playerId: "d", steps: 10000, entries: 1 }
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.playerId, r.rank]),
    [
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 4]
    ]
  );
});

test("registered players with nothing logged still appear, on zero", () => {
  const board = buildLeaderboard(["p-1", "p-2"], [entry("p-1", "2026-08-13", 12000)], null, null);
  assert.deepEqual(
    board.map((r) => [r.playerId, r.steps, r.rank]),
    [
      ["p-1", 12000, 1],
      ["p-2", 0, 2]
    ]
  );
});

test("leaderboard totals only count the selected period", () => {
  const entries = [entry("p-1", "2026-08-03", 40000), entry("p-1", "2026-08-13", 5000), entry("p-2", "2026-08-12", 9000)];
  const { start, end } = periodRange("week", "2026-08-13");
  const board = buildLeaderboard(["p-1", "p-2"], entries, start, end);
  // p-2 leads this week even though p-1 has far more steps overall.
  assert.deepEqual(
    board.map((r) => [r.playerId, r.steps, r.rank]),
    [
      ["p-2", 9000, 1],
      ["p-1", 5000, 2]
    ]
  );
  assert.equal(buildLeaderboard(["p-1"], entries, null, null)[0].steps, 45000);
});
