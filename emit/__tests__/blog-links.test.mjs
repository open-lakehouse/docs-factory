// A blog's links to docs pages become the page's URL on its docs site; any other
// `.md` source link is unwrapped to its label.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blogLinkPlugins, docsUrlFor, publishedDocsUrls } from "../blog-links.mjs";
import { projectRoutes } from "../docs/sites/routes.mjs";
import { emitOne } from "../emit.mjs";
import unitycatalog from "../targets/unitycatalog.mjs";

const SITES = [{ project: "proj", origin: "https://docs.test", hrefFor: projectRoutes("proj") }];

function page(root, rel, status) {
  const path = join(root, "content", "proj", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `---\ntitle: T\nstatus: ${status}\n---\n\nBody.\n`);
}

test("a docs identity maps to its project's site, anything else to null", () => {
  const id = { area: "docs", project: "proj", bucket: "how-to", slug: "x" };
  expect(docsUrlFor(id, SITES)).toBe("https://docs.test/how-to/x");
  expect(docsUrlFor({ ...id, project: "other" }, SITES)).toBeNull();
  expect(docsUrlFor({ area: "blog", slug: "x" }, SITES)).toBeNull();
});

test("docs links resolve to published pages; drafts and other posts unwrap", async () => {
  const root = mkdtempSync(join(tmpdir(), "blog-links-"));
  try {
    page(root, "how-to/001-ready-page/index.md", "ready");
    page(root, "how-to/002-draft-page/index.md", "draft");
    expect([...publishedDocsUrls(root, SITES)]).toEqual(["https://docs.test/how-to/ready-page"]);

    const postDir = join(root, "blogs", "post");
    mkdirSync(postDir, { recursive: true });
    const inputPath = join(postDir, "index.md");
    writeFileSync(
      inputPath,
      "---\ntitle: T\nauthor: A Person\nsummary: S\n---\n\n" +
        "See [ready](../../content/proj/how-to/001-ready-page/index.md#step-2), " +
        "[draft](../../content/proj/how-to/002-draft-page/index.md), " +
        "[post](../other/index.md), and [web](https://example.com/a.md).\n",
    );
    const unresolved = [];
    const { output } = await emitOne({
      inputPath,
      target: unitycatalog,
      likec4OutDir: join(root, ".likec4-export"),
      plugins: blogLinkPlugins({
        repoRoot: root,
        sites: SITES,
        onUnresolved: ({ url }) => unresolved.push(url),
      }),
    });
    expect(output).toContain("[ready](https://docs.test/how-to/ready-page#step-2)");
    expect(output).toContain(" draft, post, and [web](https://example.com/a.md)");
    expect(unresolved).toEqual([
      "../../content/proj/how-to/002-draft-page/index.md",
      "../other/index.md",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
