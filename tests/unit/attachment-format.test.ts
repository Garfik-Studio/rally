import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes } from "@/lib/attachment-format";

test("formatBytes", async (t) => {
  await t.test("bytes below 1KiB stay in B", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1023), "1023 B");
  });

  await t.test("KiB range is one decimal place", () => {
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(1536), "1.5 KB");
  });

  await t.test("MiB range is one decimal place", () => {
    assert.equal(formatBytes(1024 * 1024), "1.0 MB");
    assert.equal(formatBytes(2 * 1024 * 1024 + 512 * 1024), "2.5 MB");
  });
});
