// Validate every `content/<project>/nav.yml` against that project's docs (a
// prebuild step). The sidebar resolves the same manifests at runtime but can only
// log; failing here is what stops a broken or orphaning manifest from shipping.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { splitFrontmatter } from "../src/content-core/frontmatter.mjs";
import { docIdentity } from "../src/content-core/identity.mjs";
import { resolveNav } from "../src/content-core/nav.mjs";
import { walkContent } from "../src/content-core/walk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const contentRoot = resolve(repoRoot, "content");

/** `{ project: errors[] }` for every project that has a nav.yml. */
export function checkNav(root = contentRoot) {
  const results = {};
  for (const project of readdirSync(root)) {
    const navPath = resolve(root, project, "nav.yml");
    if (!existsSync(navPath)) continue;
    const docs = walkContent(resolve(root, project)).map((absPath) => {
      const { meta } = splitFrontmatter(readFileSync(absPath, "utf8"));
      const { bucket, slug } = docIdentity(absPath, meta);
      return { bucket, slug, title: meta.title ?? slug };
    });
    let manifest;
    try {
      manifest = yaml.load(readFileSync(navPath, "utf8"));
    } catch (err) {
      results[project] = [`nav.yml is not valid YAML: ${err.message}`];
      continue;
    }
    results[project] = resolveNav(manifest, docs).errors;
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const [project, errors] of Object.entries(checkNav())) {
    const where = relative(repoRoot, resolve(contentRoot, project, "nav.yml"));
    for (const e of errors) console.error(`${where}: ${e}`);
    failed ||= errors.length > 0;
  }
  if (failed) process.exit(1);
  console.log("nav OK");
}
