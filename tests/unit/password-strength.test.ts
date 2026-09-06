import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasRequiredCharacterMix,
  isEntirelyNumeric,
  isTooSimilarToAttributes,
  scorePassword,
} from "@/lib/password-strength";

test("password strength heuristics", async (t) => {
  await t.test("isEntirelyNumeric", () => {
    assert.equal(isEntirelyNumeric("19283746"), true);
    assert.equal(isEntirelyNumeric("1928a746"), false);
    assert.equal(isEntirelyNumeric(""), false);
  });

  await t.test("hasRequiredCharacterMix needs a letter, a number, and a symbol", () => {
    assert.equal(hasRequiredCharacterMix("Ab1defg!"), true);
    assert.equal(hasRequiredCharacterMix("Ab1defgh"), false); // no symbol
    assert.equal(hasRequiredCharacterMix("Abcdefg!"), false); // no digit
    assert.equal(hasRequiredCharacterMix("1234567!"), false); // no letter
  });

  await t.test("isTooSimilarToAttributes catches substrings and near-matches of name/email parts", () => {
    assert.equal(isTooSimilarToAttributes("jordantran1", ["Jordan Tran", "jordan.tran@example.com"]), true);
    assert.equal(isTooSimilarToAttributes("jordn", ["Jordan Tran"]), true); // levenshtein within threshold
    assert.equal(isTooSimilarToAttributes("Tr0ubl3-Kayak!", ["Jordan Tran", "jordan.tran@example.com"]), false);
  });

  await t.test("isTooSimilarToAttributes ignores attribute parts shorter than 3 chars", () => {
    assert.equal(isTooSimilarToAttributes("ab", ["a b c"]), false);
  });

  await t.test("scorePassword floors weak passwords and labels them", () => {
    const numeric = scorePassword("12345678");
    assert.equal(numeric.score, 0);
    assert.equal(numeric.label, "Very weak");
    assert.ok(numeric.hints.includes("Can't be only numbers"));
  });

  await t.test("scorePassword caps score when too similar to attributes", () => {
    const result = scorePassword("jordantran99!A", ["Jordan Tran"]);
    assert.ok(result.score <= 1);
    assert.ok(result.hints.includes("Too similar to your name or email"));
  });

  await t.test("scorePassword gives a strong password the top score", () => {
    const result = scorePassword("Tr0ubl3-Kayak!Xz");
    assert.equal(result.score, 4);
    assert.equal(result.label, "Strong");
    assert.deepEqual(result.hints, []);
  });

  await t.test("scorePassword collects actionable hints for a mediocre password", () => {
    const result = scorePassword("abcdefg"); // short, no upper, no digit, no symbol
    assert.ok(result.hints.includes("At least 8 characters"));
    assert.ok(result.hints.includes("Mix upper and lower case"));
    assert.ok(result.hints.includes("Include a number"));
    assert.ok(result.hints.includes("Include a symbol"));
  });
});
