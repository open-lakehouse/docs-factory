// The derived environment through both targets: the box always gains a Docker
// bullet; the start commands land in an authored `:::environment`, else as a
// tutorial's first step, else a how-to's box gets a bullet linking the guide.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageEnvironment } from "../../../site/src/content-core/environment.mjs";
import remarkPrerequisitesEnv from "../../../site/src/plugins/remark-prerequisites-env.mjs";
import { emitOne } from "../../emit.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";

const HOWTO = `---
title: Use S3
diataxis: how-to
project: demo
---

:::prerequisites
- Python 3.11 or later.
:::

## Steps
`;

const TUTORIAL = `---
title: First steps
diataxis: tutorial
project: demo
---

:::prerequisites
- Python 3.11 or later.
:::

::::journey

### Open a session

Run python.

::::
`;

const PLACED = `---
title: Run a local server
diataxis: how-to
project: demo
---

:::prerequisites
:::

## Download the environment

:::environment
:::

That's it.
`;

const ENV = pageEnvironment(
  [{ kind: "python", environment: "uc/compose.aws.yaml", fetchUrl: "/how-to/s3/snippets/s3.py" }],
  {
    registry: {
      "uc/compose.aws.yaml": {
        title: "UC with S3",
        ports: [8080, 9000],
        clientEnv: { AWS_ALLOW_HTTP: "true" },
      },
    },
    bundle: "uc-docs-env",
    bundleUrl: "https://d.io/env/uc-docs-env.tar.gz",
    origin: "https://d.io",
  },
);
const GUIDE = { href: "/how-to/run-local-server#with-s3", title: "Run a local server" };
const DOCKER =
  "- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose v2, for the local environment.";
const COMMANDS = [
  "curl -fsSL https://d.io/env/uc-docs-env.tar.gz | tar -xz",
  "cd uc-docs-env/uc && docker compose -f compose.aws.yaml up -d --wait",
  "export AWS_ALLOW_HTTP=true",
].join("\n");

async function render(target, page, { environment = ENV, diataxis = "how-to" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prereqs-"));
  try {
    const inputPath = join(dir, "index.md");
    writeFileSync(inputPath, page);
    const { output } = await emitOne({
      inputPath,
      target,
      likec4OutDir: join(dir, "likec4"),
      plugins: [[remarkPrerequisitesEnv, { environment, guide: GUIDE, diataxis }]],
    });
    return output;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const site = () => docsSiteTarget({ assetBase: "/a" });

test("how-to: Docker and a pointer to the guide, no commands", async () => {
  const out = await render(site(), HOWTO);
  expect(out).toContain(
    `:::prerequisites\n${DOCKER}\n- UC with S3, running: [Run a local server](/how-to/run-local-server#with-s3).\n- Python 3.11 or later.`,
  );
  expect(out).not.toContain("curl");
});

test("tutorial: starting the stack is the journey's first step", async () => {
  const out = await render(site(), TUTORIAL, { diataxis: "tutorial" });
  expect(out).toContain(`:::prerequisites\n${DOCKER}\n- Python 3.11 or later.`);
  expect(out).not.toContain("running: [");
  const step = out.indexOf("### Start the environment");
  expect(step).toBeGreaterThan(out.indexOf("::::journey"));
  expect(step).toBeLessThan(out.indexOf("### Open a session"));
  expect(out).toContain(`\`\`\`bash\n${COMMANDS}\n\`\`\``);
  expect(out).toContain("`uv run https://d.io/how-to/s3/snippets/s3.py`");
});

test("md-twin: the tutorial's first step is numbered and carries the commands", async () => {
  const out = await render(mdTwin, TUTORIAL, { diataxis: "tutorial" });
  expect(out).not.toContain(":::");
  expect(out).toContain("> **Prerequisites**");
  expect(out).toContain("### Step 1 — Start the environment");
  expect(out).toContain("### Step 2 — Open a session");
  expect(out).toContain(COMMANDS);
});

test("an authored :::environment takes the commands in place, and no pointer", async () => {
  const out = await render(site(), PLACED);
  expect(out).not.toContain(":::environment");
  expect(out).not.toContain("running: [");
  const at = out.indexOf(COMMANDS);
  expect(at).toBeGreaterThan(out.indexOf("## Download the environment"));
  expect(at).toBeLessThan(out.indexOf("That's it."));
});

test("a page whose scripts need no stack is left as authored, minus the marker", async () => {
  expect(await render(site(), HOWTO, { environment: null })).toContain(
    ":::prerequisites\n- Python 3.11 or later.\n:::",
  );
  const placed = await render(site(), PLACED, { environment: null });
  expect(placed).not.toContain(":::environment");
  expect(placed).not.toContain("curl");
});
