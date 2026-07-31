// Tree-diff mirror drift test. The stable-key Merkle diff exists as two copies
// by deliberate design — server/src/tree-diff.ts (over the DB `MerkleNodeJson`
// shape) and site/src/lib/tree-diff.ts (over the proto `MerkleNode` shape) —
// because the two live in separate packages that mirror contracts rather than
// import across the boundary (the same convention as anchor.ts ↔ normalize.mjs).
//
// Nothing at build time links them, so this test pins them: it reads both source
// files and asserts that, once the per-package type surface is normalized away
// (the type import line, the MerkleNode(Json) annotations, the Indexed(Node)
// helper name, and the required-vs-optional `children` access), the shared
// functions — indexTree, entry, diffTrees — are character-for-character
// identical. If a future fix touches one copy's diff semantics without the
// other, CI fails here instead of the two review surfaces silently disagreeing.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const serverSrc = readFileSync(resolve(repoRoot, "server/src/tree-diff.ts"), "utf8");
const clientSrc = readFileSync(resolve(repoRoot, "site/src/lib/tree-diff.ts"), "utf8");

// The functions both files must implement identically. `unchangedSlugs` is
// server-only and the label maps / proto adapter are client-only, so parity is
// asserted over just the genuinely-shared algorithm.
const SHARED_FNS = ["indexTree", "entry", "diffTrees", "compactDiff", "reviewDiff"];

/**
 * Extract a top-level function's full text (signature through its closing brace)
 * by brace-matching from its declaration. Works for both `function f(` and the
 * exported form. Returns "" if not found.
 */
function extractFn(src, name) {
  const decl = new RegExp(`(export )?function ${name}\\b`);
  const m = decl.exec(src);
  if (!m) return "";
  let i = src.indexOf("{", m.index);
  if (i < 0) return "";
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) {
      return src.slice(m.index, j + 1);
    }
  }
  return "";
}

/**
 * Erase the per-package type surface so only the algorithm remains: drop the
 * node type names, the local Indexed/IndexedNode helper name, TS type
 * annotations on params/returns, the optional-chaining on `children`, and
 * normalize whitespace. What's left is the pure control flow both copies share.
 */
function normalizeAlgorithm(fnText) {
  return fnText
    .replace(/MerkleNodeJson/g, "Node")
    .replace(/MerkleNode/g, "Node")
    .replace(/IndexedNode/g, "Indexed")
    .replace(/node\.children\?\./g, "node.children.") // optional vs required child access
    .replace(/:\s*[A-Za-z0-9_<>\[\]| ]+(?=[),{])/g, "") // strip TS type annotations
    .replace(/\s+/g, " ")
    .trim();
}

for (const fn of SHARED_FNS) {
  test(`${fn} is identical across the server and client tree-diff mirrors`, () => {
    const server = normalizeAlgorithm(extractFn(serverSrc, fn));
    const client = normalizeAlgorithm(extractFn(clientSrc, fn));
    expect(server).not.toBe(""); // guard: both copies still define it
    expect(client).not.toBe("");
    expect(client).toBe(server);
  });
}
