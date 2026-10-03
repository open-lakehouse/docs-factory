// The docs-site target + link plugins over a fixture: directives survive as
// authored (the target site renders them), snippets inline, source-only fence
// meta goes, cross-page links map to target routes, and dead/model links unwrap.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import remarkSourceLinks from "../../../site/src/plugins/remark-source-links.mjs";
import { emitOne } from "../../emit.mjs";
import remarkAbsoluteLinks from "../../plugins/remark-absolute-links.mjs";
import remarkModelLinksText from "../../plugins/remark-model-links-text.mjs";
import remarkScriptLinks from "../../plugins/remark-script-links.mjs";
import remarkStripSourceMeta from "../../plugins/remark-strip-source-meta.mjs";
import remarkUnwrapDeadLinks from "../../plugins/remark-unwrap-dead-links.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const PAGE = `---
title: Use the thing
status: draft
diataxis: how-to
project: demo
---

:::tip
Read [the basics](../../explanation/basics/index.md#why) first.
:::

:::tab[CLI]
\`\`\`bash file=./snippets/steps.sh start=start:a end=end:a
\`\`\`
:::

See [the catalog](model:lakehouse.catalog) and [a stub](../stub/index.md).
`;

test("docs-site target keeps directives and rewrites what the site can't resolve", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-site-"));
  try {
    const pageDir = join(root, "content/demo/how-to/001-thing");
    mkdirSync(join(pageDir, "snippets"), { recursive: true });
    writeFileSync(join(pageDir, "index.md"), PAGE);
    writeFileSync(
      join(pageDir, "snippets/steps.sh"),
      "# --8<-- [start:a]\nuc catalog list\n# --8<-- [end:a]\n",
    );
    const unresolved = [];
    const hrefFor = (id) => (id.area === "docs" ? `/${id.bucket}/${id.slug}` : null);
    const { output } = await emitOne({
      inputPath: join(pageDir, "index.md"),
      target: docsSiteTarget({ assetBase: "/assets/how-to/thing" }),
      likec4OutDir: join(root, "likec4"),
      plugins: [
        [
          remarkSourceLinks,
          {
            hrefFor,
            knownHrefs: new Set(["/explanation/basics", "/how-to/thing"]),
            onUnresolved: (u) => unresolved.push(u.url),
          },
        ],
        [remarkUnwrapDeadLinks],
        [remarkModelLinksText],
        [
          remarkScriptLinks,
          {
            scripts: new Map([
              [
                relative(REPO_ROOT, join(pageDir, "snippets/steps.sh")),
                "/how-to/thing/snippets/steps.sh",
              ],
            ]),
          },
        ],
        [remarkStripSourceMeta],
      ],
    });

    expect(output).toMatch(/^---\ntitle: Use the thing\ndiataxis: how-to\n---/);
    expect(output).not.toContain("status:");
    expect(output).toContain(":::tip");
    expect(output).toContain(":::tab[CLI]");
    expect(output).toContain("[the basics](/explanation/basics#why)");
    expect(output).toContain(
      '```bash title="steps.sh" script="/how-to/thing/snippets/steps.sh"\nuc catalog list\n```',
    );
    expect(output).not.toContain("srcpath");
    expect(output).toContain("See the catalog and a stub.");
    expect(unresolved).toEqual(["../stub/index.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the twin's root-relative links resolve against the site origin", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-twin-"));
  try {
    const pageDir = join(root, "content/demo/how-to/001-thing");
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(
      join(pageDir, "index.md"),
      "---\ntitle: T\n---\n\nSee [basics](../../explanation/basics/index.md), [x](https://e.test/a), and [top](#top).\n",
    );
    const hrefFor = (id) => (id.area === "docs" ? `/${id.bucket}/${id.slug}` : null);
    const { output } = await emitOne({
      inputPath: join(pageDir, "index.md"),
      target: mdTwin,
      likec4OutDir: join(root, "likec4"),
      plugins: [
        [remarkSourceLinks, { hrefFor, knownHrefs: new Set(["/explanation/basics"]) }],
        [remarkAbsoluteLinks, { origin: "https://docs.test" }],
      ],
    });
    expect(output).toContain("[basics](https://docs.test/explanation/basics)");
    expect(output).toContain("[x](https://e.test/a)");
    expect(output).toContain("[top](#top)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
