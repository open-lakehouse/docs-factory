/**
 * Write one site environment's archive without emitting the site:
 * `bun emit/docs/build-env-bundle.mjs <site> <dir> <out-dir>` writes
 * `<out-dir>/<dir>.tar.gz`, the archive readers download. The bundle smoke
 * test extracts it outside the repo and starts it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnvBundles, loadRegistry } from "./env-bundle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [siteName, dir, outDir] = process.argv.slice(2);
if (!siteName || !dir || !outDir) {
  console.error("usage: build-env-bundle.mjs <site> <dir> <out-dir>");
  process.exit(2);
}
const { default: site } = await import(`./sites/${siteName}.mjs`);
if (!site.env?.dirs.includes(dir)) throw new Error(`${siteName} publishes no environment ${dir}`);
const { archives } = buildEnvBundles({
  repoRoot: REPO_ROOT,
  bundle: site.env.bundle,
  dirs: [dir],
  registry: loadRegistry(REPO_ROOT),
  origin: site.origin,
  guideUrl: null,
});
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${dir}.tar.gz`);
writeFileSync(file, archives.get(dir));
console.log(file);
