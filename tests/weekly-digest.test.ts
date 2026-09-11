import assert from "node:assert/strict";
import test from "node:test";
import { buildDigests, buildPlayerDigest, ordinal } from "../lib/weekly-digest.ts";
import type { DigestInput } from "../lib/weekly-digest.ts";
import type { PlayerProfileRow, StandingRow } from "../lib/admin-data.ts";

const TODAY = "2026-09-11";

function player(id: string, name: string, email: string | null, enabled = true) {
  return { id, club_id: "c", user_id: null, display_name: name, email, mobile_number: null, rating: null, dupr_rating: null, weekly_email_enabled: enabled } as PlayerProfileRow;
}
function standing(entryId: string, points: number, wins = 0, losses = 0, gw = 0, gl = 0): StandingRow {
  return { division_id: "d1", entry_id: entryId, played: wins + losses, wins, losses, forfeits_won: 0, forfeits_lost: 0, cancelled: 0, games_won: gw, games_lost: gl, points };
}

const base: DigestInput = {
  players: [player("pA", "Ann Lee", "ann@example.com"), player("pB", "Bob Ray", "bob@example.com")],
  tournaments: [{ id: "t1", club_id: "c", name: "SCAF S35", sport: "ping_pong", start_date: "2026-09-01", end_date: "2026-12-01", logo_url: null }],
  divisions: [{ id: "d1", tournament_id: "t1", name: "Division 1" }] as DigestInput["divisions"],
  entries: [
    { id: "eA", division_id: "d1", label: "Ann Lee", player_id: "pA", team_id: null },
    { id: "eB", division_id: "d1", label: "Bob Ray", player_id: "pB", team_id: null },
    { id: "eC", division_id: "d1", label: "Cy Dorn", player_id: "pC", team_id: null }
  ],
  matches: [
    {
      id: "m1", division_id: "d1", entry_a_id: "eA", entry_b_id: "eB", round: 1, round_label: null, status: "scheduled",
      schedule_week_start: "2026-09-14", schedule_week_end: "2026-09-20", extension_week_start: "2026-09-21", extension_week_end: "2026-09-27",
      target_score: 11, number_of_sets: 3, winner_entry_id: null, forfeit_by_entry_id: null, restrict_score_updates: false,
      score_update_before_days: 0, score_update_after_days: 0
    }
  ] as DigestInput["matches"],
  standings: [standing("eA", 9, 2, 1, 60, 40), standing("eB", 12, 3, 0, 70, 30), standing("eC", 4, 1, 2, 30, 60)],
  teamMembers: []
};

test("a player sees their rank, their points, and who is above them", () => {
  const digest = buildPlayerDigest(base.players[0], base, TODAY)!;
  assert.equal(digest.email, "ann@example.com");
  const s = digest.standings[0];
  assert.equal(s.rank, 2, "Ann has 9 points to Bob's 12");
  assert.equal(s.outOf, 3);
  assert.equal(s.points, 9);
  assert.deepEqual(s.top.map((r) => [r.label, r.isMe]), [["Bob Ray", false], ["Ann Lee", true], ["Cy Dorn", false]]);
  assert.match(digest.subject, /2nd in Division 1/);
});

test("the email names the next match and which side of it they are on", () => {
  const digest = buildPlayerDigest(base.players[0], base, TODAY)!;
  assert.equal(digest.upcoming.length, 1);
  assert.equal(digest.upcoming[0].opponent, "Bob Ray");
  assert.equal(digest.upcoming[0].isHome, true, "Ann is entry A");
  assert.match(digest.text, /vs Bob Ray \(home\) - play by 2026-09-20/);

  // And from the other side of the same match.
  const bob = buildPlayerDigest(base.players[1], base, TODAY)!;
  assert.equal(bob.upcoming[0].opponent, "Ann Lee");
  assert.equal(bob.upcoming[0].isHome, false);
});

test("matches already past their window are left out", () => {
  const stale = { ...base, matches: [{ ...base.matches[0], schedule_week_end: "2026-08-01", extension_week_end: "2026-08-08" }] } as DigestInput;
  const digest = buildPlayerDigest(base.players[0], stale, TODAY)!;
  assert.equal(digest.upcoming.length, 0, "a deadline that has passed is not upcoming");
  assert.ok(digest.standings.length > 0, "but the standings still go out");
});

test("opting out stops the email, and is the only thing that does", () => {
  const optedOut = { ...base, players: [player("pA", "Ann Lee", "ann@example.com", false), base.players[1]] } as DigestInput;
  const sent = buildDigests(optedOut, TODAY);
  assert.deepEqual(sent.map((d) => d.email), ["bob@example.com"]);
  assert.equal(buildDigests(base, TODAY).length, 2, "both go out when nobody has opted out");
});

test("nobody is emailed without an address, an entry, or anything to say", () => {
  const noEmail = { ...base, players: [player("pA", "Ann Lee", null)] } as DigestInput;
  assert.equal(buildDigests(noEmail, TODAY).length, 0, "no address");

  const notEntered = { ...base, players: [player("pZ", "Zoe Ng", "zoe@example.com")] } as DigestInput;
  assert.equal(buildDigests(notEntered, TODAY).length, 0, "not in any division");

  // Entered, but the season is over and there is no standing for them either.
  const nothingToSay = { ...base, players: [player("pA", "Ann Lee", "ann@example.com")], standings: [], matches: [] } as DigestInput;
  assert.equal(buildDigests(nothingToSay, TODAY).length, 0, "an empty email is worse than none");
});

test("a doubles player is reached through their team", () => {
  const doubles = {
    ...base,
    entries: [
      { id: "tAB", division_id: "d1", label: "Ann Lee / Bob Ray", player_id: null, team_id: "t1" },
      { id: "eC", division_id: "d1", label: "Cy Dorn", player_id: "pC", team_id: null }
    ],
    standings: [standing("tAB", 8, 2, 0, 40, 20), standing("eC", 4, 1, 1, 20, 40)],
    matches: [],
    teamMembers: [{ team_id: "t1", player_id: "pA" }, { team_id: "t1", player_id: "pB" }]
  } as DigestInput;
  const digest = buildPlayerDigest(doubles.players[0], doubles, TODAY)!;
  assert.equal(digest.standings[0].rank, 1);
  assert.equal(digest.standings[0].top[0].label, "Ann Lee / Bob Ray");
  assert.ok(digest.standings[0].top[0].isMe, "their own team is marked as theirs");
});

test("names with markup cannot break out of the HTML", () => {
  const nasty = { ...base, players: [player("pA", '<script>alert("x")</script>', "x@example.com")] } as DigestInput;
  const entries = nasty.entries.map((e) => (e.id === "eA" ? { ...e, label: '<img src=x onerror=1>' } : e));
  const digest = buildPlayerDigest(nasty.players[0], { ...nasty, entries }, TODAY)!;
  assert.ok(!digest.html.includes("<script>"), "script tag escaped");
  assert.ok(!digest.html.includes("<img src=x"), "entry label escaped");
  assert.ok(digest.html.includes("&lt;script&gt;"));
});

test("every email says how to stop getting it", () => {
  for (const digest of buildDigests(base, TODAY)) {
    assert.match(digest.text, /turn this email off/);
    assert.match(digest.html, /turn this email off/);
  }
});

test("ordinals read correctly, including the teens", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["st", "nd", "rd", "th", "th", "th", "th", "st", "nd"]);
});

test("one point is not '1 points'", () => {
  const onePoint = { ...base, standings: [standing("eA", 1, 0, 1, 10, 20), standing("eB", 12, 3, 0, 70, 30)] } as DigestInput;
  const digest = buildPlayerDigest(base.players[0], onePoint, TODAY)!;
  assert.match(digest.text, /1 point \(/);
  assert.ok(!digest.text.includes("1 points"), digest.text);
  assert.ok(!digest.html.includes("1 points"));
  // The abbreviated form in the top-three list has the same trap.
  assert.ok(!digest.text.includes("1 pts"), digest.text);
  assert.ok(!digest.html.includes("1 pts"));
  assert.match(digest.text, /1 pt\b/);
});

test("a season that has finished stops appearing", () => {
  const over = {
    ...base,
    tournaments: [{ ...base.tournaments[0], end_date: "2026-09-01" }],
    matches: []
  } as DigestInput;
  assert.equal(buildDigests(over, TODAY).length, 0, "ended 2026-09-01, and today is 2026-09-11");

  // Ending today still counts as running.
  const endsToday = { ...over, tournaments: [{ ...base.tournaments[0], end_date: TODAY }] } as DigestInput;
  assert.equal(buildDigests(endsToday, TODAY).length, 2);
});

test("someone in many divisions gets a readable email, not a wall of them", () => {
  const divisions = Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, tournament_id: "t1", name: `Division ${i}` })) as DigestInput["divisions"];
  const entries = divisions.map((d, i) => ({ id: `e${i}`, division_id: d.id, label: "Ann Lee", player_id: "pA", team_id: null }));
  const standings = divisions.map((d, i) => ({ ...standing(`e${i}`, 10 - i, 2, 1, 40, 30), division_id: d.id }));
  const many = { ...base, divisions, entries, standings, matches: [] } as DigestInput;

  const digest = buildPlayerDigest(base.players[0], many, TODAY)!;
  assert.equal(digest.standings.length, 4, "capped");
  assert.equal(digest.standings[0].rank, 1, "best placing leads");
  assert.match(digest.text, /3 more divisions/);
  assert.match(digest.html, /3 more divisions/);
});
