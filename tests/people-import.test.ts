import assert from "node:assert/strict";
import test from "node:test";
import { parsePeopleImportFile } from "../lib/people-import.ts";

function csvFile(text: string) {
  return new File([text], "people.csv", { type: "text/csv" });
}

test("combines first_name and last_name into the stored full name", async () => {
  const file = csvFile("first_name,last_name,email\nJane,Doe,jane@example.com\n");
  const { rows } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fullName, "Jane Doe");
});

test("falls back to a single full_name column when first/last aren't present", async () => {
  const file = csvFile("full_name,email\nJohn Smith,john@example.com\n");
  const { rows } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fullName, "John Smith");
});

test("first_name alone (no last name) is still a valid name", async () => {
  const file = csvFile("first_name,email\nCher,cher@example.com\n");
  const { rows } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fullName, "Cher");
});

test("a row missing both first/last and full_name is skipped with a reason", async () => {
  const file = csvFile("email\nnoname@example.com\n");
  const { rows, skipped } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /name/i);
});
