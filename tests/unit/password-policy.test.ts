import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePassword } from "@/lib/password-policy";

function rejects(password: string, attributes: string[] = []) {
  assert.throws(() => validatePassword(password, attributes));
}

test("password policy", async (t) => {
  await t.test("rejects passwords shorter than the minimum length", () => {
    rejects("Ab1defg");
  });

  await t.test("rejects entirely numeric passwords", () => {
    rejects("19283746");
  });

  await t.test("rejects passwords that are only letters", () => {
    rejects("abcdefgh");
  });

  await t.test("rejects passwords missing a special character", () => {
    rejects("Ab1defgh");
  });

  await t.test("rejects common breached passwords", () => {
    rejects("password1");
    rejects("iloveyou1");
  });

  await t.test("rejects passwords too similar to the user's name or email", () => {
    rejects("jordantran1", ["Jordan Tran", "jordan.tran@example.com"]);
    rejects("chitresh99", ["Chitresh", "chitresh@example.com"]);
  });

  await t.test("accepts a password that clears every rule", () => {
    assert.doesNotThrow(() => validatePassword("Tr0ubl3-Kayak!", ["Jordan Tran", "jordan.tran@example.com"]));
  });
});
