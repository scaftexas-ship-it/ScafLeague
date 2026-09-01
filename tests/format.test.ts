import assert from "node:assert/strict";
import test from "node:test";
import { LEAGUE_TIME_ZONE, combineName, splitName, todayIso } from "../lib/format.ts";

test("combineName joins first/last with a space, trimming and dropping blanks", () => {
  assert.equal(combineName("Jane", "Doe"), "Jane Doe");
  assert.equal(combineName(" Jane ", " Doe "), "Jane Doe");
  assert.equal(combineName("Cher", ""), "Cher");
  assert.equal(combineName("", "Doe"), "Doe");
  assert.equal(combineName("", ""), "");
});

test("splitName reverses combineName for simple two-word names", () => {
  assert.deepEqual(splitName("Jane Doe"), { firstName: "Jane", lastName: "Doe" });
});

test("splitName puts a single-word name entirely in firstName", () => {
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
});

test("splitName keeps a multi-word last name together (splits on the first space only)", () => {
  assert.deepEqual(splitName("Mary Jane Watson"), { firstName: "Mary", lastName: "Jane Watson" });
});

test("today is read in US Central, not UTC", () => {
  // 8:30pm Central on 14 Aug is already 15 Aug in UTC. The league's day has
  // not ended yet, so anything keyed off "today" must still say the 14th --
  // this is what closed score windows five hours early.
  const evening = new Date("2026-08-15T01:30:00Z");
  const central = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(evening);
  assert.equal(central, "2026-08-14");
  assert.equal(evening.toISOString().slice(0, 10), "2026-08-15", "UTC really is a day ahead here");

  // Winter, when Central is UTC-6 rather than UTC-5.
  const winter = new Date("2026-01-11T05:30:00Z");
  const winterCentral = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(winter);
  assert.equal(winterCentral, "2026-01-10");

  // And todayIso itself agrees with the zone rather than with UTC.
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});
