// A blog's `target:` list: the first entry is the primary, and every other
// target's render carries a `canonical` URL to the primary's delivered post.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blogTargets, crossPostCanonical, emitOne } from "../emit.mjs";
import delta from "../targets/delta.mjs";
import unitycatalog from "../targets/unitycatalog.mjs";

const SIDECAR = { unitycatalog: { post_dir: "2026-07-03-p", updated: "2026-07-17" } };

test("target is one site or a list, primary first", () => {
  expect(blogTargets({ target: "delta" })).toEqual(["delta"]);
  expect(blogTargets({ target: ["unitycatalog", "delta"] })).toEqual(["unitycatalog", "delta"]);
  expect(blogTargets({})).toEqual([]);
  expect(blogTargets({ target: "" })).toEqual([]);
});

test("a cross-post points at the primary's delivered post", () => {
  expect(crossPostCanonical("delta", unitycatalog, SIDECAR)).toBe(
    "https://www.unitycatalog.io/blogs/2026-07-03-p/",
  );
  expect(crossPostCanonical("unitycatalog", delta, { delta: { post_dir: "d" } })).toBe(
    "https://delta.io/blog/d/",
  );
});

test("the primary, and a cross-post of an undelivered primary, carry no canonical", () => {
  expect(crossPostCanonical("unitycatalog", unitycatalog, SIDECAR)).toBeNull();
  expect(crossPostCanonical("delta", unitycatalog, {})).toBeNull();
  expect(crossPostCanonical("delta", null, SIDECAR)).toBeNull();
});

test("target frontmatter emits canonical only when given", () => {
  const draft = { title: "T", author: "A Person", summary: "S" };
  expect(unitycatalog.frontmatter(draft).canonical).toBeUndefined();
  expect(delta.frontmatter(draft).canonical).toBeUndefined();
  expect(delta.frontmatter(draft, { canonical: "https://x/" }).canonical).toBe("https://x/");
  expect(unitycatalog.frontmatter(draft, { canonical: "https://x/" }).canonical).toBe("https://x/");
});

test("emitOne hands the frontmatter context to the target", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blog-targets-"));
  try {
    const inputPath = join(dir, "index.md");
    writeFileSync(
      inputPath,
      "---\ntitle: T\nauthor: A Person\nsummary: S\ntarget: [unitycatalog, delta]\n---\n\nBody.\n",
    );
    const { output } = await emitOne({
      inputPath,
      target: delta,
      likec4OutDir: join(dir, ".likec4-export"),
      frontmatterContext: { canonical: "https://www.unitycatalog.io/blogs/2026-07-03-p/" },
    });
    expect(output).toContain("canonical: https://www.unitycatalog.io/blogs/2026-07-03-p/");
    expect(output).not.toContain("target:");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
