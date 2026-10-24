// Rewrites relation ids in a `likec4 export json` dump to content hashes.
//
// LikeC4 hashes a relation's id from the absolute file:// URI of its document
// and its position in that document, so every checkout path (worktree, CI) and
// every inserted relation renumbers the ids. Here the id is a hash of what the
// relation is — section, kind, endpoints, title — the identity LikeC4 itself
// uses to match `extend` relations.
//
// usage: bun scripts/stable-relation-ids.mjs dist/model.json

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("usage: stable-relation-ids.mjs <model.json>");
const model = JSON.parse(readFileSync(path, "utf8"));

const remap = new Map();
const seen = new Map();

function rekey(section, relations) {
  const out = {};
  for (const [oldId, rel] of Object.entries(relations ?? {})) {
    const key = [
      section,
      rel.kind ?? "default",
      JSON.stringify(rel.source),
      JSON.stringify(rel.target),
      rel.title ?? "",
    ].join("|");
    // Identical relations keep apart by document order.
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const id = createHash("sha256")
      .update(n > 1 ? `${key}#${n}` : key)
      .digest("hex")
      .slice(0, 10);
    remap.set(oldId, id);
    out[id] = { ...rel, id };
  }
  return out;
}

model.relations = rekey("model", model.relations);
if (model.deployments) {
  model.deployments.relations = rekey("deployment", model.deployments.relations);
}
for (const view of Object.values(model.views ?? {})) {
  for (const edge of view.edges ?? []) {
    if (edge.relations) edge.relations = edge.relations.map((id) => remap.get(id) ?? id);
  }
}

const text = JSON.stringify(model, null, 2);
// A field this script doesn't know about still carrying an old id would make
// the output path-dependent again.
const leftovers = [...remap.keys()].filter((id) => text.includes(`"${id}"`));
if (leftovers.length) {
  throw new Error(`relation ids left unmapped in ${path}: ${leftovers.slice(0, 5).join(", ")}`);
}
writeFileSync(path, text);
