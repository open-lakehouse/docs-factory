// The env bundle over the real envs/: byte-identical across runs, extractable
// by the system tar, and laid out so compose.aws.yaml's `include` resolves.
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnvBundle, bundlePaths, loadRegistry, tarGz } from "../env-bundle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OPTS = {
  repoRoot: REPO_ROOT,
  bundle: "uc-docs-env",
  dirs: ["unitycatalog", "aws-sim"],
  registry: loadRegistry(REPO_ROOT),
  origin: "https://docs.example.io",
  siteTitle: "Unity Catalog",
  guideUrl: "https://docs.example.io/how-to/run-local-server",
};

test("bundle paths skip READMEs and aws-sim's example", () => {
  const paths = bundlePaths(REPO_ROOT, OPTS.dirs);
  expect(paths).toContain("unitycatalog/compose.aws.yaml");
  expect(paths).toContain("aws-sim/sts-shim/sts_shim.py");
  expect(paths.some((p) => p.endsWith("README.md") || p.includes("example/"))).toBe(false);
});

test("the archive is byte-identical across runs", () => {
  expect(Buffer.compare(buildEnvBundle(OPTS).archive, buildEnvBundle(OPTS).archive)).toBe(0);
});

test("the system tar extracts it with the include target in place", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-bundle-"));
  try {
    const file = join(dir, "b.tar.gz");
    writeFileSync(file, buildEnvBundle(OPTS).archive);
    execFileSync("tar", ["-xzf", file], { cwd: dir });
    const root = join(dir, "uc-docs-env");
    const aws = readFileSync(join(root, "unitycatalog", "compose.aws.yaml"), "utf8");
    expect(aws).toContain("../aws-sim/compose.yaml");
    expect(existsSync(join(root, "aws-sim", "compose.yaml"))).toBe(true);
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
      "`docker compose -f compose.aws.yaml up -d --wait`",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("environments.json lists each stack's exact commands", () => {
  const { index } = buildEnvBundle(OPTS);
  expect(index.bundle).toBe("https://docs.example.io/env/uc-docs-env.tar.gz");
  const aws = index.environments.find((e) => e.key === "unitycatalog/compose.aws.yaml");
  expect(aws.start).toEqual([
    "curl -fsSL https://docs.example.io/env/uc-docs-env.tar.gz | tar -xz",
    "cd uc-docs-env/unitycatalog && docker compose -f compose.aws.yaml up -d --wait",
    "export AWS_ENDPOINT_URL=http://localhost:9000",
    "export AWS_ALLOW_HTTP=true",
  ]);
  expect(aws.stop).toBe("docker compose -f compose.aws.yaml down");
  const base = index.environments.find((e) => e.key === "unitycatalog/compose.yaml");
  expect(base.start[1]).toBe("cd uc-docs-env/unitycatalog && docker compose up -d --wait");
});

test("tarGz rejects a path ustar can't hold", () => {
  expect(() => tarGz([{ name: "x".repeat(101), data: "" }])).toThrow("path too long");
});
