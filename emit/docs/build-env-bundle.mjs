/**
 * Write one site's env bundle without emitting the site:
 * `bun emit/docs/build-env-bundle.mjs <site> <out-dir>` writes
 * `<out-dir>/<bundle>.tar.gz`, the archive readers download. The bundle smoke
 * test extracts it outside the repo and starts it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnvBundle, loadRegistry } from "./env-bundle.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [siteName, outDir] = process.argv.slice(2);
if (!siteName || !outDir) {
  console.error("usage: build-env-bundle.mjs <site> <out-dir>");
  process.exit(2);
}
const { default: site } = await import(`./sites/${siteName}.mjs`);
if (!site.env) throw new Error(`${siteName} has no env bundle`);
const { archive } = buildEnvBundle({
  repoRoot: REPO_ROOT,
  bundle: site.env.bundle,
  dirs: site.env.dirs,
  registry: loadRegistry(REPO_ROOT),
  origin: site.origin,
  siteTitle: site.title,
  guideUrl: null,
});
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${site.env.bundle}.tar.gz`);
writeFileSync(file, archive);
console.log(file);
