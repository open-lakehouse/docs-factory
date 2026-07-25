// Normalization drift test. normalizeText/fingerprint/hashLineSync are the one
// contract the render side, the manifest, the browser comment client
// (content-ref.ts), and the review server (anchor.ts) all depend on. These
// assert content-core agrees with each of the OTHER copies' formulas, so the
// "must match" comments are enforced by CI rather than by hope.
import { test, expect } from "bun:test";
import { normalizeText, fingerprint } from "../normalize.mjs";
import { hashLineSync } from "../hash.mjs";
import { createHash } from "node:crypto";

// The exact formulas the other copies use (kept inline here so this test fails
// if content-core ever diverges from them).
const serverNormalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clientFingerprint = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const serverHashLine = (line) =>
  createHash("sha256").update(line.replace(/\s+$/, "")).digest("hex").slice(0, 16);

/** The browser's async SubtleCrypto hashLine, replicated to assert parity. */
async function browserHashLine(line) {
  const data = new TextEncoder().encode(line.replace(/\s+$/, ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const SAMPLES = [
  "  Hello   World  ",
  "Read a Delta Table",
  "MixedCASE\twith\ttabs\nand newlines",
  "trailing spaces   ",
];

test("normalizeText matches the server anchor.ts normalize()", () => {
  for (const s of SAMPLES) expect(normalizeText(s)).toBe(serverNormalize(s));
});

test("fingerprint matches the client content-ref.ts fingerprint()", () => {
  for (const s of SAMPLES) expect(fingerprint(s)).toBe(clientFingerprint(s));
});

test("hashLineSync matches the server anchor.ts hashLine()", () => {
  for (const s of SAMPLES) expect(hashLineSync(s)).toBe(serverHashLine(s));
});

test("hashLineSync matches the browser async SubtleCrypto hashLine()", async () => {
  for (const s of SAMPLES) expect(hashLineSync(s)).toBe(await browserHashLine(s));
});
