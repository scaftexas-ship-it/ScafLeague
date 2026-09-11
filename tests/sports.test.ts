import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { SPORTS, sportLabel } from "../lib/types.ts";
import type { Sport } from "../lib/types.ts";
import { isValidCompletedSet } from "../lib/match-scoring.ts";

test("every sport has a label, and none of them leak the stored value", () => {
  for (const sport of SPORTS) {
    const label = sportLabel(sport);
    assert.ok(label.length > 0, sport);
    assert.ok(!label.includes("_"), `${sport} renders as "${label}" -- underscores should not reach the screen`);
    assert.equal(label[0], label[0].toUpperCase(), `${sport} should be capitalised`);
  }
  assert.equal(sportLabel("ping_pong"), "Ping Pong");
});

test("the app's sport list matches the database enum", () => {
  // These drift apart silently: a sport added to one and not the other either
  // vanishes from the menus or fails on insert with a cryptic enum error.
  const schema = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const line = schema.split("\n").find((l) => l.includes("create type public.sport_type"));
  assert.ok(line, "sport_type enum not found in schema.sql");
  const inEnum = [...line!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inEnum, [...SPORTS].sort());
});

test("ping pong scores to 11, win by two, with deuce running on", () => {
  const pp = (a: number, b: number) => isValidCompletedSet(a, b, 11, "ping_pong" as Sport);
  assert.ok(pp(11, 5), "a routine game");
  assert.ok(pp(11, 9), "won by two at the target");
  assert.ok(!pp(11, 10), "one point clear is not a finished game");
  assert.ok(pp(12, 10), "deuce, taken by two");
  assert.ok(pp(18, 16), "a long deuce is still legal -- there is no cap");
  assert.ok(!pp(10, 5), "nobody reached 11");
});

test("badminton still caps where ping pong does not", () => {
  // Guards the fall-through: ping pong must not pick up badminton's cap.
  assert.ok(!isValidCompletedSet(31, 29, 21, "badminton" as Sport), "badminton caps at 30");
  assert.ok(isValidCompletedSet(31, 29, 11, "ping_pong" as Sport), "ping pong has no such cap");
});
