// Path-identity drift test. docIdentity() is the one place the content path →
// {area, project, bucket, slug} mapping lives; it must agree with the site's
// parseDocPath + the content.ts `slug:` override for EVERY content path,
// including folder-mode index.md. The folder-mode case is the bug this fixes:
// the manifest used to register slug="index" for these pages, so their DB refs
// could never match the site's docRef.
import { test, expect } from "bun:test";
import { docIdentity, parseDocPath } from "../identity.mjs";

test("folder-mode index.md resolves to the folder slug, order-prefix stripped", () => {
  const id = docIdentity("content/unitycatalog/tutorials/001-getting-started/index.md", {});
  expect(id).toEqual({
    area: "docs",
    project: "unitycatalog",
    bucket: "tutorials",
    slug: "getting-started",
  });
});

test("file-mode strips the extension and the order prefix", () => {
  const id = docIdentity("content/delta/how-to/002-query-a-table.md", {});
  expect(id.slug).toBe("query-a-table");
  expect(id.bucket).toBe("how-to");
  expect(id.project).toBe("delta");
});

test("a frontmatter slug: overrides the on-disk name", () => {
  const id = docIdentity("content/delta/how-to/001-original.md", { slug: "renamed" });
  expect(id.slug).toBe("renamed");
});

test("blog draft resolves to its folder slug", () => {
  const id = docIdentity("blogs/kernel-becomes-tree/draft.md", {});
  expect(id).toEqual({ area: "blogs", slug: "kernel-becomes-tree" });
});

test("docIdentity slug matches parseDocPath (no override) for docs", () => {
  const p = "content/unitycatalog/explanation/002-credential-vending/index.md";
  expect(docIdentity(p, {}).slug).toBe(parseDocPath(p).slug);
});
