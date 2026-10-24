// LikeC4 view markers: the docs site keeps the marker with the view's Mermaid
// as its no-JS fallback, the .md twin gets the alt text and the Mermaid, and a
// blog MDX target gets the interactive <LikeC4View>.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOne } from "../../emit.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";
import unitycatalog from "../../targets/unitycatalog.mjs";

const PAGE = `---
title: How it flows
status: draft
diataxis: explanation
project: demo
---

\`\`\`likec4 flow
A client asks the
catalog.
\`\`\`
`;

const MERMAID = "sequenceDiagram\n  a->>b: ask";

async function render(target, { page = PAGE } = {}) {
  const root = mkdtempSync(join(tmpdir(), "likec4-markers-"));
  try {
    const pageDir = join(root, "content", "flow");
    const likec4 = join(root, "likec4");
    mkdirSync(pageDir, { recursive: true });
    mkdirSync(likec4, { recursive: true });
    writeFileSync(join(pageDir, "index.md"), page);
    writeFileSync(join(likec4, "flow.mmd"), `${MERMAID}\n`);
    // The Mermaid is already generated, as a multi-page caller does once.
    return await emitOne({
      inputPath: join(pageDir, "index.md"),
      target,
      likec4OutDir: likec4,
      likec4Exported: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the docs site keeps the marker, then the Mermaid as its fallback", async () => {
  const { output, likec4 } = await render(docsSiteTarget({ assetBase: "/assets/x" }));
  expect(output).toContain(
    `\`\`\`likec4 flow\nA client asks the catalog.\n\`\`\`\n\n\`\`\`mermaid fallback\n${MERMAID}\n\`\`\``,
  );
  expect(likec4).toEqual([{ viewId: "flow", alt: "A client asks the catalog.", mermaid: MERMAID }]);
});

test("the .md twin gets the alt text and the view's Mermaid", async () => {
  const { output, manifest } = await render(mdTwin);
  expect(output).toContain(`A client asks the catalog.\n\n\`\`\`mermaid\n${MERMAID}\n\`\`\``);
  expect(output).not.toContain("likec4");
  expect(manifest).toEqual([]);
});

test("a blog MDX target renders <LikeC4View> and imports it once", async () => {
  const { output } = await render(unitycatalog);
  expect(output).toContain('import LikeC4View from "@/components/blog/LikeC4View.astro";');
  expect(output).toContain('<LikeC4View viewId="flow" />');
  expect(output).not.toContain("mermaid");
});

test("a view the model doesn't have fails the emit", async () => {
  const page = PAGE.replace("likec4 flow", "likec4 nope");
  await expect(render(mdTwin, { page })).rejects.toThrow("LikeC4 view nope is not in the model");
});
