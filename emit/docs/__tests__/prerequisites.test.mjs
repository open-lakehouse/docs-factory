// The derived environment through both targets: the box always gains a Docker
// bullet; the start commands land in an authored `:::environment`, else as a
// tutorial's first step, else a how-to's box gets a bullet linking the guide.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pageEnvironment,
  registryEnvironment,
} from "../../../site/src/content-core/environment.mjs";
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

const KEYED = `---
title: Run a local server
diataxis: how-to
project: demo
---

:::prerequisites{environment="uc/compose.yaml"}
:::

## Minimal

:::environment{key="uc/compose.yaml"}
:::

## With S3

:::environment{key="uc/compose.aws.yaml"}
:::
`;

const BUNDLE = {
  registry: {
    "uc/compose.yaml": { title: "UC", ports: [8080], clientEnv: {} },
    "uc/compose.aws.yaml": {
      title: "UC with S3",
      ports: [8080, 9000],
      clientEnv: { AWS_ALLOW_HTTP: "true" },
    },
  },
  bundle: "uc-docs-env",
  archiveBase: "https://d.io/env",
};
const ENV = pageEnvironment([{ kind: "python", environment: "uc/compose.aws.yaml" }], BUNDLE);
const RESOLVE = (key) => registryEnvironment(key, BUNDLE);
const GUIDE = { href: "/how-to/run-local-server#with-s3", title: "Run a local server" };
const DOCKER =
  "- [Docker](https://docs.docker.com/get-started/get-docker/) with Compose v2, for the local environment.";
const COMMANDS = [
  "curl -fsSL https://d.io/env/uc.tar.gz | tar -xz",
  "cd uc-docs-env/uc && docker compose -f compose.aws.yaml up -d --wait",
  "export AWS_ALLOW_HTTP=true",
].join("\n");

async function render(
  target,
  page,
  { environment = ENV, diataxis = "how-to", resolve = RESOLVE, diagram = false } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "prereqs-"));
  try {
    const pageDir = join(dir, "content", "how-to", "page");
    mkdirSync(pageDir, { recursive: true });
    const inputPath = join(pageDir, "index.md");
    writeFileSync(inputPath, page);
    const envsDir = join(dir, "envs");
    if (diagram) {
      mkdirSync(join(envsDir, "uc"), { recursive: true });
      writeFileSync(join(envsDir, "uc", "diagram.png"), "");
    }
    const { output } = await emitOne({
      inputPath,
      target,
      likec4OutDir: join(dir, "likec4"),
      plugins: [
        [remarkPrerequisitesEnv, { environment, guide: GUIDE, diataxis, resolve, envsDir }],
      ],
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
  expect(out).not.toContain("uv run https://");
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

test("a keyed :::environment renders just that stack's commands, and no pointer", async () => {
  const minimal = registryEnvironment("uc/compose.yaml", BUNDLE);
  const out = await render(site(), KEYED, { environment: minimal });
  expect(out).not.toContain(":::environment");
  expect(out).not.toContain("running");
  expect(out).not.toContain("Skip this.");
  expect(out).toContain(`:::prerequisites{environment="uc/compose.yaml"}\n${DOCKER}\n:::`);
  const plain = out.indexOf("cd uc-docs-env/uc && docker compose up -d --wait");
  expect(plain).toBeGreaterThan(out.indexOf("## Minimal"));
  expect(plain).toBeLessThan(out.indexOf("## With S3"));
  expect(out.indexOf(COMMANDS)).toBeGreaterThan(out.indexOf("## With S3"));
});

test("a keyed :::environment naming no registry stack fails the emit", async () => {
  const page = KEYED.replace("uc/compose.aws.yaml", "uc/nope.yaml");
  await expect(render(site(), page)).rejects.toThrow("uc/nope.yaml is not in");
});

// The emitter's image pass would ship a real PNG; the plugin only places it.
const raw = { ...mdTwin, constructs: { ...mdTwin.constructs, likec4: undefined } };
const DIAGRAM =
  '![The services UC with S3 runs and how clients reach them](../../../envs/uc/diagram.png "trestle=uc")';

test("tutorial: the stack's diagram sits right below its start commands", async () => {
  const out = await render(raw, TUTORIAL, { diataxis: "tutorial", diagram: true });
  const commands = out.indexOf(COMMANDS);
  expect(commands).toBeGreaterThan(-1);
  expect(out.indexOf(DIAGRAM)).toBeGreaterThan(commands);
  expect(out.indexOf(DIAGRAM)).toBeLessThan(out.indexOf("Stop it later"));
});

test("a keyed :::environment gets its stack's diagram too", async () => {
  const minimal = registryEnvironment("uc/compose.yaml", BUNDLE);
  const out = await render(raw, KEYED, { environment: minimal, diagram: true });
  expect(out).toContain(DIAGRAM.replace("UC with S3", "UC"));
  expect(out).toContain(DIAGRAM);
});

test("no diagram on disk, just the commands", async () => {
  const out = await render(raw, TUTORIAL, { diataxis: "tutorial" });
  expect(out).toContain(COMMANDS);
  expect(out).not.toContain("diagram.png");
});

test("the box lists no services, only Docker and the authored bullets", async () => {
  const out = await render(site(), TUTORIAL, { diataxis: "tutorial" });
  expect(out).not.toContain("which this page starts");
});

const DEPLOYED = `---
title: Deployment patterns
diataxis: explanation
project: demo
---

## Hybrid

:::deployment{key="uc/compose.hosted.yaml"}
:::

That's all.
`;

const HOSTED = {
  ...BUNDLE,
  registry: {
    ...BUNDLE.registry,
    "uc/compose.hosted.yaml": {
      title: "UC with hosted state",
      ports: [8080],
      clientEnv: { UNITY_CATALOG_URL: "http://localhost:8080/api/2.1/unity-catalog" },
      deploySetup: "save_secret() { :; }\n",
      deploy: [
        {
          order: 1,
          phase: "provision",
          id: "buckets",
          title: "Create the buckets",
          instructions: "Create `unity`.",
          script: "deploy/s3.sh",
          commands: "aws s3api create-bucket --bucket unity\n",
        },
        {
          order: 2,
          phase: "provision",
          id: "legacy",
          title: "Run a script from an older plan",
          instructions: "No commands in the plan.",
          script: "deploy/old.sh",
        },
        {
          order: 3,
          phase: "start",
          id: "up",
          title: "Start the stack",
          instructions:
            "```bash\ndocker compose up -d --wait\n```\n\n[LAYOUT.md](LAYOUT.md) lists every address.",
        },
      ],
    },
  },
};

test("a :::deployment renders the download, the helpers, then each step's commands", async () => {
  const resolve = (key) => registryEnvironment(key, HOSTED);
  const out = await render(site(), DEPLOYED, {
    environment: null,
    diataxis: "explanation",
    resolve,
  });
  expect(out).not.toContain(":::deployment");
  const at = (s) => out.indexOf(s);
  expect(at("1. **Download the environment**")).toBeGreaterThan(at("## Hybrid"));
  expect(out).toContain(
    "curl -fsSL https://d.io/env/uc.tar.gz | tar -xz\n   cd uc-docs-env/uc\n   bash",
  );
  expect(at("2. **Load the deployment helpers**")).toBeGreaterThan(at("1. **Download"));
  expect(at("save_secret() { :; }")).toBeGreaterThan(at("2. **Load"));
  expect(at("3. **Create the buckets**")).toBeGreaterThan(at("save_secret() { :; }"));
  expect(at("aws s3api create-bucket --bucket unity")).toBeGreaterThan(at("3. **Create"));
  expect(out).not.toContain("bash deploy/s3.sh");
  expect(at("bash deploy/old.sh")).toBeGreaterThan(at("4. **Run a script"));
  expect(at("5. **Start the stack**")).toBeGreaterThan(at("bash deploy/old.sh"));
  expect(out).toContain("`LAYOUT.md` lists every address.");
  expect(at("export UNITY_CATALOG_URL=")).toBeGreaterThan(at("5. **Start the stack**"));
  expect(at("export UNITY_CATALOG_URL=")).toBeLessThan(at("That's all."));
});

test("a :::deployment without a resolver is dropped", async () => {
  const out = await render(site(), DEPLOYED, { environment: null, resolve: null });
  expect(out).not.toContain(":::deployment");
  expect(out).not.toContain("Download the environment");
});
