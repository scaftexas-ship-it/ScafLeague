import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DUPR_DOUBLES_HEADER, DUPR_SINGLES_HEADER, buildDuprCsv, duprIdOf } from "../lib/dupr-export.ts";
import type { DuprExportInput } from "../lib/dupr-export.ts";
import type { DivisionEntryRow, MatchRow, MatchSetRow, PlayerProfileRow, TeamMemberRow } from "../lib/admin-data.ts";

function player(id: string, name: string, dupr: string | null = null): PlayerProfileRow {
  return { id, user_id: null, club_id: "c-1", display_name: name, email: null, mobile_number: null, rating: null, dupr_rating: dupr } as PlayerProfileRow;
}

function match(id: string, a: string, b: string, status = "completed"): MatchRow {
  return {
    id, division_id: "d-1", entry_a_id: a, entry_b_id: b, round: 1, round_label: null,
    status, schedule_week_start: "2026-08-03", schedule_week_end: "2026-08-09",
    extension_week_start: "2026-08-10", extension_week_end: "2026-08-16",
    target_score: 11, number_of_sets: 3, winner_entry_id: null, forfeit_by_entry_id: null,
    restrict_score_updates: false, score_update_before_days: 0, score_update_after_days: 0
  } as MatchRow;
}

function set(matchId: string, n: number, a: number, b: number): MatchSetRow {
  return { id: `${matchId}-${n}`, match_id: matchId, set_number: n, entry_a_score: a, entry_b_score: b } as MatchSetRow;
}

test("the headers match the templates DUPR supplied, byte for byte", () => {
  // Checked against copies of the real templates committed under fixtures --
  // reading them from a Downloads folder passed locally and failed in CI,
  // where that folder does not exist.
  const header = (file: string) =>
    fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)[0].trim();
  assert.equal(DUPR_SINGLES_HEADER, header("dupr-singles-template.csv"));
  assert.equal(DUPR_DOUBLES_HEADER, header("dupr-doubles-template.csv"));
});

test("a DUPR id is six alphanumerics -- a rating or a placeholder is not one", () => {
  assert.equal(duprIdOf(player("p", "A", "76M5O9")), "76M5O9");
  assert.equal(duprIdOf(player("p", "A", "Z9WRPW")), "Z9WRPW");
  assert.equal(duprIdOf(player("p", "A", "4.25")), "", "a real rating is not an id");
  assert.equal(duprIdOf(player("p", "A", "No")), "", "a placeholder is not an id");
  assert.equal(duprIdOf(player("p", "A", null)), "");
  assert.equal(duprIdOf(undefined), "");
});

const players = [player("p1", "Ann Lee", "76M5O9"), player("p2", "Bob Ray"), player("p3", "Cy Dorn", "Z9WRPW"), player("p4", "Di Fox", "4.25")];
const entries: DivisionEntryRow[] = [
  { id: "e1", division_id: "d-1", label: "Ann Lee", player_id: "p1", team_id: null },
  { id: "e2", division_id: "d-1", label: "Bob Ray", player_id: "p2", team_id: null },
  { id: "e3", division_id: "d-1", label: "Ann Lee / Bob Ray", player_id: null, team_id: "t1" },
  { id: "e4", division_id: "d-1", label: "Cy Dorn / Di Fox", player_id: null, team_id: "t2" }
];
const teamMembers: TeamMemberRow[] = [
  { team_id: "t1", player_id: "p1" }, { team_id: "t1", player_id: "p2" },
  { team_id: "t2", player_id: "p3" }, { team_id: "t2", player_id: "p4" }
];

function input(matches: MatchRow[], sets: MatchSetRow[]): DuprExportInput {
  return { matches, matchSets: sets, entries, players, teamMembers };
}

test("singles rows carry the two names, their ids, and up to three games", () => {
  const result = buildDuprCsv("singles", input([match("m1", "e1", "e2")], [set("m1", 1, 11, 5), set("m1", 2, 11, 7)]));
  const lines = result.csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], DUPR_SINGLES_HEADER);
  // Bob has no id, and the three stray columns stay empty. Only two games were
  // played, so the third pair is blank rather than zero.
  assert.equal(lines[1], "2026-08-09,Ann Lee,76M5O9,Bob Ray,,,,,11,5,11,7,,");
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.missingDuprIds, ["Bob Ray"]);
});

test("doubles rows carry all four players, and singles matches stay out of the file", () => {
  const both = [match("m1", "e1", "e2"), match("m2", "e3", "e4")];
  const sets = [set("m1", 1, 11, 5), set("m2", 1, 11, 9), set("m2", 2, 8, 11), set("m2", 3, 11, 6)];
  const result = buildDuprCsv("doubles", input(both, sets));
  const lines = result.csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], DUPR_DOUBLES_HEADER);
  assert.equal(lines.length, 2, "the singles match is not in the doubles file");
  // Di Fox's "4.25" is a rating, so her id column is left empty.
  assert.equal(lines[1], "2026-08-09,Ann Lee,76M5O9,Bob Ray,,Cy Dorn,Z9WRPW,Di Fox,,11,9,8,11,11,6");
  assert.deepEqual(result.missingDuprIds, ["Bob Ray", "Di Fox"]);

  // ...and the singles file leaves the doubles match out.
  assert.equal(buildDuprCsv("singles", input(both, sets)).rowCount, 1);
});

test("matches without a usable result are reported rather than silently dropped", () => {
  const scheduled = match("m3", "e1", "e2", "scheduled");
  const forfeited = match("m4", "e1", "e2", "forfeit");
  const scoreless = match("m5", "e1", "e2");
  const result = buildDuprCsv("singles", input([scheduled, forfeited, scoreless], []));
  assert.equal(result.rowCount, 0);
  assert.deepEqual(result.skipped.map((s) => s.reason).sort(), [
    "no result yet (scheduled)",
    "result has no game scores",
    "won by forfeit, no games played"
  ]);
});

test("names with a comma are quoted so the columns do not shift", () => {
  const odd = [player("p1", "Lee, Ann", "76M5O9"), player("p2", "Bob Ray")];
  const result = buildDuprCsv("singles", { ...input([match("m1", "e1", "e2")], [set("m1", 1, 11, 5)]), players: odd });
  assert.match(result.csv, /"Lee, Ann"/);
});
