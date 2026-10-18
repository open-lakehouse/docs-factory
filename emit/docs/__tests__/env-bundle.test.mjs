// The env archives over the real envs/: one per environment, byte-identical
// across runs, extractable by the system tar, and a generated environment ships
// only its manifest.
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnvBundles, bundlePaths, loadRegistry, tarGz } from "../env-bundle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OPTS = {
  repoRoot: REPO_ROOT,
  bundle: "uc-docs-env",
  dirs: ["unitycatalog", "uc-aws"],
  registry: loadRegistry(REPO_ROOT),
  origin: "https://docs.example.io",
  guideUrl: "https://docs.example.io/how-to/run-local-server",
};

test("bundle paths ship a generated environment's deployment guide, not its recipe and plan", () => {
  const paths = bundlePaths(REPO_ROOT, OPTS.dirs, OPTS.registry);
  expect(paths).toContain("unitycatalog/compose.yaml");
  expect(paths).toContain("uc-aws/compose.yaml");
  expect(paths).toContain("uc-aws/image/Dockerfile");
  expect(paths).toContain("uc-aws/modules/rustfs/.env/rustfs.env");
  expect(paths).not.toContain("uc-aws/env.toml");
  expect(paths).not.toContain("uc-aws/plan.json");
  expect(paths).toContain("uc-aws/README.md");
});

test("a manifest entry git doesn't track fails", () => {
  const registry = {
    "uc-aws/compose.yaml": { ...OPTS.registry["uc-aws/compose.yaml"], files: ["nope.yaml"] },
  };
  expect(() => bundlePaths(REPO_ROOT, ["uc-aws"], registry)).toThrow("envs/uc-aws/nope.yaml");
});

test("each archive is byte-identical across runs", () => {
  const [a, b] = [buildEnvBundles(OPTS).archives, buildEnvBundles(OPTS).archives];
  expect([...a.keys()]).toEqual(["unitycatalog", "uc-aws"]);
  for (const [dir, archive] of a) expect(Buffer.compare(archive, b.get(dir))).toBe(0);
});

test("the system tar extracts one archive into its own folder, include targets in place", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-bundle-"));
  try {
    const file = join(dir, "uc-aws.tar.gz");
    writeFileSync(file, buildEnvBundles(OPTS).archives.get("uc-aws"));
    execFileSync("tar", ["-xzf", file], { cwd: dir });
    const root = join(dir, "uc-docs-env");
    const compose = readFileSync(join(root, "uc-aws", "compose.yaml"), "utf8");
    for (const [, path] of compose.matchAll(/- path: \.\/(\S+)/g)) {
      expect(existsSync(join(root, "uc-aws", path))).toBe(true);
    }
    expect(existsSync(join(root, "unitycatalog"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("environments.json lists each stack's archive and exact commands", () => {
  const { index } = buildEnvBundles(OPTS);
  expect(index.version).toBe(2);
  const aws = index.environments.find((e) => e.key === "uc-aws/compose.yaml");
  expect(aws.archive).toBe("https://docs.example.io/env/uc-aws.tar.gz");
  expect(aws.start.slice(0, 3)).toEqual([
    "curl -fsSL https://docs.example.io/env/uc-aws.tar.gz | tar -xz",
    "cd uc-docs-env/uc-aws && docker compose up -d --wait",
    "export AWS_ALLOW_HTTP=true",
  ]);
  expect(aws.start).toContain("export AWS_ENDPOINT_URL=http://localhost:9000");
  expect(aws.stop).toBe("docker compose down");
  const base = index.environments.find((e) => e.key === "unitycatalog/compose.yaml");
  expect(base.start[0]).toBe(
    "curl -fsSL https://docs.example.io/env/unitycatalog.tar.gz | tar -xz",
  );
  expect(base.start[1]).toBe("cd uc-docs-env/unitycatalog && docker compose up -d --wait");
});

test("tarGz rejects a path ustar can't hold", () => {
  expect(() => tarGz([{ name: "x".repeat(101), data: "" }])).toThrow("path too long");
});
