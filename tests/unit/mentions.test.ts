import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMentionQuery, mentionToken, mentionedUserIds, parseMentions } from "@/lib/mentions";

test("mentions", async (t) => {
  await t.test("mentionToken round-trips through parseMentions", () => {
    const text = `hey ${mentionToken("Jordan Tran", "u1")} look`;
    assert.deepEqual(parseMentions(text), [
      { type: "text", value: "hey " },
      { type: "mention", name: "Jordan Tran", userId: "u1" },
      { type: "text", value: " look" },
    ]);
  });

  await t.test("plain text with no mention is one text segment", () => {
    assert.deepEqual(parseMentions("nothing here"), [{ type: "text", value: "nothing here" }]);
  });

  await t.test("a stray '@[' that never closes is kept as literal text", () => {
    assert.deepEqual(parseMentions("email me @[ later"), [
      { type: "text", value: "email me " },
      { type: "text", value: "@[" },
      { type: "text", value: " later" },
    ]);
  });

  await t.test("mentionedUserIds dedupes repeated mentions and drops text", () => {
    const text = `${mentionToken("A", "u1")} ${mentionToken("B", "u2")} ${mentionToken("A again", "u1")}`;
    assert.deepEqual(mentionedUserIds(text), ["u1", "u2"]);
  });

  await t.test("mentionedUserIds is empty when there are no mentions", () => {
    assert.deepEqual(mentionedUserIds("just talking"), []);
  });

  await t.test("activeMentionQuery detects an in-progress @query at the caret", () => {
    assert.deepEqual(activeMentionQuery("hi @jor", 6), { start: 3, query: "jo" });
  });

  await t.test("activeMentionQuery requires the @ to start a word", () => {
    assert.equal(activeMentionQuery("email@jor", 9), null);
  });

  await t.test("activeMentionQuery stops once the query contains a space", () => {
    assert.equal(activeMentionQuery("hi @jordan tran", 15), null);
  });

  await t.test("activeMentionQuery returns null when there is no @ before the caret", () => {
    assert.equal(activeMentionQuery("hello world", 5), null);
  });
});
