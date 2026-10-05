// `:::prerequisites` through both targets: the docs-site page keeps the box as a
// directive and gains the derived Docker bullet + `:::environment` commands; the
// .md twin flattens the same content to a **Prerequisites** blockquote.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageEnvironment } from "../../../site/src/content-core/environment.mjs";
import { emitOne } from "../../emit.mjs";
import remarkPrerequisitesEnv from "../../plugins/remark-prerequisites-env.mjs";
import { docsSiteTarget } from "../../targets/docs-site.mjs";
import mdTwin from "../../targets/md-twin.mjs";

const PAGE = `---
title: Use S3
diataxis: how-to
project: demo
---

:::prerequisites
- Python 3.11 or later.
:::

## Steps
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
const GUIDE = { href: "/how-to/run-local-server", title: "Run a local server" };

async function render(target, environment = ENV) {
  const dir = mkdtempSync(join(tmpdir(), "prereqs-"));
  try {
    const inputPath = join(dir, "index.md");
    writeFileSync(inputPath, PAGE);
    const { output } = await emitOne({
      inputPath,
      target,
      likec4OutDir: join(dir, "likec4"),
      plugins: [[remarkPrerequisitesEnv, { environment, guide: GUIDE }]],
    });
    return output;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("docs-site: the derived bullet, the authored ones, then the environment", async () => {
  const out = await render(docsSiteTarget({ assetBase: "/assets/how-to/s3" }));
  expect(out).toContain(
    "::::prerequisites\n- For the local environment, Docker with Compose v2 and ports 8080 and 9000 free.\n- Python 3.11 or later.",
  );
  expect(out).toContain(":::environment[UC with S3]");
  expect(out).toContain(
    [
      "```bash",
      "curl -fsSL https://d.io/env/uc-docs-env.tar.gz | tar -xz",
      "cd uc-docs-env/uc",
      "docker compose -f compose.aws.yaml up -d --wait",
      "export AWS_ALLOW_HTTP=true",
      "```",
    ].join("\n"),
  );
  expect(out).toContain("[Run a local server](/how-to/run-local-server)");
  expect(out).toContain("`uv run https://d.io/how-to/s3/snippets/s3.py`");
});

test("md-twin: a **Prerequisites** blockquote with the same commands", async () => {
  const out = await render(mdTwin);
  expect(out).not.toContain(":::");
  expect(out).toContain("> **Prerequisites**");
  expect(out).toContain("> **Start the environment: UC with S3**");
  expect(out).toContain("> docker compose -f compose.aws.yaml up -d --wait");
});

test("a page whose scripts need no stack keeps the box as authored", async () => {
  const out = await render(docsSiteTarget({ assetBase: "/a" }), null);
  expect(out).toContain(":::prerequisites\n- Python 3.11 or later.\n:::");
});
