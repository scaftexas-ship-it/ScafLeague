import assert from "node:assert/strict";
import test from "node:test";
import { combineName, splitName } from "../lib/format.ts";

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
