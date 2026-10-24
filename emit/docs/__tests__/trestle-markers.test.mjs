// Trestle diagram markers: the docs site keeps a marker pointing at the served
// snapshot (an environment's site-wide, a page's own under its assets), which the
// vendored remark-trestle-views upgrades, with Trestle's Mermaid after it as the
// no-JS fallback; the .md twin gets Trestle's Mermaid.
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

\`\`\`trestle demo
The demo stack
\`\`\`

\`\`\`trestle ./assets/sketch.trestle-graph.json
A sketch
\`\`\`
`;

const ENV_MERMAID = 'flowchart LR\n    n0(["<b>Clients</b>"]):::clients';
const README = `# Deploying \`demo\`

## Architecture

\`\`\`mermaid
${ENV_MERMAID}
\`\`\`

## Steps
`;

async function render(target, { page = PAGE, readme = README } = {}) {
  const root = mkdtempSync(join(tmpdir(), "trestle-images-"));
  try {
    const pageDir = join(root, "content", "run");
    const envDir = join(root, "envs", "demo");
    mkdirSync(join(pageDir, "assets"), { recursive: true });
    mkdirSync(envDir, { recursive: true });
    writeFileSync(join(pageDir, "index.md"), page);
    writeFileSync(join(envDir, "diagram.trestle-graph.json"), "{}");
    writeFileSync(join(envDir, "README.md"), readme);
    writeFileSync(
      join(pageDir, "assets", "sketch.trestle-graph.json"),
      JSON.stringify({ mermaid: "flowchart LR\n    a --> b\n" }),
    );
    const out = await emitOne({
      inputPath: join(pageDir, "index.md"),
      target,
      likec4OutDir: join(root, "likec4"),
      envsDir: join(root, "envs"),
    });
    return { ...out, root };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the docs site keeps a marker pointing at the served snapshot", async () => {
  const { output, trestle, root } = await render(
    docsSiteTarget({ assetBase: "/assets/how-to/run" }),
  );
  expect(output).toContain(
    `\`\`\`trestle /assets/trestle/demo/diagram.trestle-graph.json\nThe demo stack\n\`\`\`\n\n\`\`\`mermaid fallback\n${ENV_MERMAID}\n\`\`\``,
  );
  expect(output).toContain(
    "```trestle /assets/how-to/run/sketch.trestle-graph.json\nA sketch\n```",
  );
  expect(trestle.map((e) => [e.env, e.snapshot])).toEqual([
    ["demo", join(root, "envs", "demo", "diagram.trestle-graph.json")],
    [null, join(root, "content", "run", "assets", "sketch.trestle-graph.json")],
  ]);
});

test("the .md twin gets the alt text and Trestle's Mermaid", async () => {
  const { output } = await render(mdTwin);
  expect(output).toContain(`The demo stack\n\n\`\`\`mermaid\n${ENV_MERMAID}\n\`\`\``);
  expect(output).toContain("A sketch\n\n```mermaid\nflowchart LR\n    a --> b\n```");
  expect(output).not.toContain("trestle");
});

test("a marker whose environment has no Mermaid fails the emit", async () => {
  await expect(render(mdTwin, { readme: "# Deploying\n" })).rejects.toThrow(
    "has no Architecture Mermaid block",
  );
});

test("a marker naming no snapshot fails the emit", async () => {
  const page = PAGE.replace("trestle demo", "trestle nope");
  await expect(render(mdTwin, { page })).rejects.toThrow("trestle nope");
});
