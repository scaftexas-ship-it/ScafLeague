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

test("a row with a malformed email is skipped with a reason instead of importing garbage", async () => {
  const file = csvFile("first_name,last_name,email\nJane,Doe,not-an-email\n");
  const { rows, skipped } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /invalid email/i);
});

test("a row with only first/last name and no other valid data is skipped for missing email", async () => {
  // Exactly the reported case: first_name/last_name present, everything else blank/bad.
  const file = csvFile("first_name,last_name,email,mobile_number,rating\nJane,Doe,,,3.5\n");
  const { rows, skipped } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /missing email/i);
});

test("duplicate emails within the same file: only the first occurrence is kept, the rest are skipped", async () => {
  const file = csvFile(
    "first_name,last_name,email\n" + "Jane,Doe,dup@example.com\n" + "John,Smith,dup@example.com\n" + "Unique,Person,unique@example.com\n"
  );
  const { rows, skipped } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.email),
    ["dup@example.com", "unique@example.com"]
  );
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].rowNumber, 3);
  assert.match(skipped[0].reason, /duplicate email/i);
  assert.match(skipped[0].reason, /row 2/);
});

test("duplicate emails are compared case-insensitively", async () => {
  const file = csvFile("first_name,last_name,email\n" + "Jane,Doe,Dup@Example.com\n" + "John,Smith,dup@example.com\n");
  const { rows, skipped } = await parsePeopleImportFile(file);
  assert.equal(rows.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /duplicate email/i);
});
