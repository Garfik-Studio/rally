import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmail } from "@/lib/mailer";

test("buildEmail", async (t) => {
  await t.test("renders heading and paragraphs into both html and text", () => {
    const { html, text } = buildEmail({ heading: "Reset your password", paragraphs: ["Line one.", "Line two."] });
    assert.ok(html.includes("<!doctype html>"));
    assert.ok(html.includes("Reset your password"));
    assert.ok(html.includes("Line one.") && html.includes("Line two."));
    assert.ok(text.startsWith("Reset your password"));
    assert.ok(text.includes("Line one.") && text.includes("Line two."));
  });

  await t.test("escapes HTML in caller-supplied content", () => {
    const { html } = buildEmail({ heading: "Hi <b>x</b>", paragraphs: ["<script>alert(1)</script>"] });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes("Hi &lt;b&gt;x&lt;/b&gt;"));
  });

  await t.test("includes the CTA link and a copy-paste fallback when a cta is given", () => {
    const { html, text } = buildEmail({
      heading: "You're invited",
      paragraphs: ["Join us."],
      cta: { label: "Accept invite", url: "https://rally.test/invite/abc" },
    });
    assert.ok(html.includes('href="https://rally.test/invite/abc"'));
    assert.ok(html.includes("Or copy this link"));
    assert.ok(text.includes("Accept invite: https://rally.test/invite/abc"));
  });

  await t.test("omits CTA and footer markup when not provided", () => {
    const { html } = buildEmail({ heading: "H", paragraphs: ["P"] });
    assert.ok(!html.includes("Or copy this link"));
  });

  await t.test("renders the footer when provided", () => {
    const { html, text } = buildEmail({ heading: "H", paragraphs: ["P"], footer: "Expires in 1 hour." });
    assert.ok(html.includes("Expires in 1 hour."));
    assert.ok(text.includes("Expires in 1 hour."));
  });
});
