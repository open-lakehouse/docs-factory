// The env bundle over the real envs/: byte-identical across runs, extractable
// by the system tar, and a generated environment ships only its manifest.
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
  dirs: ["unitycatalog", "uc-aws"],
  registry: loadRegistry(REPO_ROOT),
  origin: "https://docs.example.io",
  siteTitle: "Unity Catalog",
  guideUrl: "https://docs.example.io/how-to/run-local-server",
};

test("bundle paths skip READMEs and a generated environment's recipe and plan", () => {
  const paths = bundlePaths(REPO_ROOT, OPTS.dirs, OPTS.registry);
  expect(paths).toContain("unitycatalog/compose.yaml");
  expect(paths).toContain("uc-aws/compose.yaml");
  expect(paths).toContain("uc-aws/image/Dockerfile");
  expect(paths).toContain("uc-aws/modules/rustfs/.env/rustfs.env");
  expect(paths).not.toContain("uc-aws/env.toml");
  expect(paths).not.toContain("uc-aws/plan.json");
  expect(paths.some((p) => p.endsWith("README.md"))).toBe(false);
});

test("a manifest entry git doesn't track fails", () => {
  const registry = {
    "uc-aws/compose.yaml": { ...OPTS.registry["uc-aws/compose.yaml"], files: ["nope.yaml"] },
  };
  expect(() => bundlePaths(REPO_ROOT, ["uc-aws"], registry)).toThrow("envs/uc-aws/nope.yaml");
});

test("the archive is byte-identical across runs", () => {
  expect(Buffer.compare(buildEnvBundle(OPTS).archive, buildEnvBundle(OPTS).archive)).toBe(0);
});

test("the system tar extracts it with every include target in place", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-bundle-"));
  try {
    const file = join(dir, "b.tar.gz");
    writeFileSync(file, buildEnvBundle(OPTS).archive);
    execFileSync("tar", ["-xzf", file], { cwd: dir });
    const root = join(dir, "uc-docs-env");
    const compose = readFileSync(join(root, "uc-aws", "compose.yaml"), "utf8");
    for (const [, path] of compose.matchAll(/- path: \.\/(\S+)/g)) {
      expect(existsSync(join(root, "uc-aws", path))).toBe(true);
    }
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
      "| `uc-aws/` | `docker compose up -d --wait` |",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("environments.json lists each stack's exact commands", () => {
  const { index } = buildEnvBundle(OPTS);
  expect(index.bundle).toBe("https://docs.example.io/env/uc-docs-env.tar.gz");
  const aws = index.environments.find((e) => e.key === "uc-aws/compose.yaml");
  expect(aws.start.slice(0, 3)).toEqual([
    "curl -fsSL https://docs.example.io/env/uc-docs-env.tar.gz | tar -xz",
    "cd uc-docs-env/uc-aws && docker compose up -d --wait",
    "export AWS_ALLOW_HTTP=true",
  ]);
  expect(aws.start).toContain("export AWS_ENDPOINT_URL=http://localhost:9000");
  expect(aws.stop).toBe("docker compose down");
  const base = index.environments.find((e) => e.key === "unitycatalog/compose.yaml");
  expect(base.start[1]).toBe("cd uc-docs-env/unitycatalog && docker compose up -d --wait");
});

test("tarGz rejects a path ustar can't hold", () => {
  expect(() => tarGz([{ name: "x".repeat(101), data: "" }])).toThrow("path too long");
});
