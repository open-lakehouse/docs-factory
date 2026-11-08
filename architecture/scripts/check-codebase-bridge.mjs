// Fails when a codebase element's `lakehouseElement` metadata names an id that
// the lakehouse model doesn't have (ADR-0010 bridge rule). Reads both exports,
// so run it after `codebase:model` and `model`.
//
// usage: bun scripts/check-codebase-bridge.mjs dist/codebase.json dist/model.json

import { readFileSync } from "node:fs";

const [codebasePath, modelPath] = process.argv.slice(2);
if (!codebasePath || !modelPath) {
  throw new Error("usage: check-codebase-bridge.mjs <codebase.json> <model.json>");
}
const codebase = JSON.parse(readFileSync(codebasePath, "utf8"));
const model = JSON.parse(readFileSync(modelPath, "utf8"));

const dangling = Object.entries(codebase.elements)
  .map(([id, el]) => [id, el.metadata?.lakehouseElement])
  .filter(([, target]) => target && !(target in model.elements));

for (const [id, target] of dangling) {
  console.error(`${id}: lakehouseElement "${target}" is not an element of the lakehouse model`);
}
if (dangling.length) process.exit(1);
