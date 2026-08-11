// Build the content version manifest consumed by the review backend.
//
// This is a thin CLI wrapper over the shared content-core pipeline
// (site/src/content-core/pipeline.mjs). The parsing contract — frontmatter
// split, body hashing, heading slugging, snippet/fence resolution, and path
// identity — lives ONCE in content-core and is shared with the render-time
// remark plugin, the site libs, and the review server, so this manifest can no
// longer drift from what the site actually renders (see
// docs/design/build-pipeline.md).
//
// Output: site/src/generated/content-versions.json (gitignored). Run via
// `just version-manifest`, or implicitly via `just register-versions`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVersionManifest } from "../src/content-core/pipeline.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const outFile = resolve(repoRoot, "site/src/generated/content-versions.json");

const entries = buildVersionManifest(repoRoot);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(entries, null, 2) + "\n");

const sha = entries[0]?.gitSha ?? "unknown";
console.log(
  `Wrote ${entries.length} content versions to ${relative(repoRoot, outFile)} (git ${sha.slice(0, 8)}).`,
);
