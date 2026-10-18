// Trestle diagrams on the docs site: an environment's diagram is served once,
// site-wide, a page's own snapshot under the page's assets, and both keep the
// `trestle=` title the vendored remark-trestle-views upgrades.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOne } from "../../emit.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";

const PAGE = `---
title: Run it
status: draft
diataxis: how-to
project: demo
---

![The demo stack](../../envs/demo/diagram.png "trestle=demo")

![A sketch](./assets/sketch.png "trestle=./assets/sketch.trestle-graph.json")
`;

async function render(target) {
  const root = mkdtempSync(join(tmpdir(), "trestle-images-"));
  try {
    const pageDir = join(root, "content", "run");
    mkdirSync(join(pageDir, "assets"), { recursive: true });
    mkdirSync(join(root, "envs", "demo"), { recursive: true });
    writeFileSync(join(pageDir, "index.md"), PAGE);
    writeFileSync(join(root, "envs", "demo", "diagram.png"), "png");
    writeFileSync(join(pageDir, "assets", "sketch.png"), "png");
    return await emitOne({
      inputPath: join(pageDir, "index.md"),
      target,
      likec4OutDir: join(root, "likec4"),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the docs site serves environment diagrams site-wide and keeps the title", async () => {
  const { output, manifest } = await render(docsSiteTarget({ assetBase: "/assets/how-to/run" }));
  expect(output).toContain('![The demo stack](/assets/trestle/demo/diagram.png "trestle=demo")');
  expect(output).toContain(
    '![A sketch](/assets/how-to/run/sketch.png "trestle=./assets/sketch.trestle-graph.json")',
  );
  expect(manifest.map((e) => e.trestle)).toEqual([{ env: "demo" }, { env: null }]);
});

test("the .md twin keeps a plain image", async () => {
  const { output } = await render(mdTwin);
  expect(output).toContain("![The demo stack](/assets/trestle/demo/diagram.png)");
  expect(output).toContain("![A sketch](sketch.png)");
});
