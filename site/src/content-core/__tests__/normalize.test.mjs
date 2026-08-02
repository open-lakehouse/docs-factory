// Normalization drift test. normalizeText/fingerprint/hashLineSync are the one
// contract the render side, the manifest, the browser comment client
// (content-ref.ts), and the review server (anchor.ts) all depend on. These
// assert content-core agrees with each of the OTHER copies' formulas, so the
// "must match" comments are enforced by CI rather than by hope.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { hashLineSync } from "../hash.mjs";
import { fingerprint, normalizeText } from "../normalize.mjs";

// The exact formulas the other copies use (kept inline here so this test fails
// if content-core ever diverges from them).
const serverNormalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clientFingerprint = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const serverHashLine = (line) =>
  createHash("sha256").update(line.trim()).digest("hex").slice(0, 16);

/** The browser's async SubtleCrypto hashLine, replicated to assert parity. */
async function browserHashLine(line) {
  const data = new TextEncoder().encode(line.trim());
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
  "    from deltalake import DeltaTable", // leading indentation (dedent case)
];

test("hashLine is dedent-invariant (ignores leading indentation)", () => {
  // The browser hashes the rendered dedented line; the server hashes the full
  // indented source line. They must produce the same hash.
  expect(hashLineSync("    from deltalake import DeltaTable")).toBe(
    hashLineSync("from deltalake import DeltaTable"),
  );
});

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
