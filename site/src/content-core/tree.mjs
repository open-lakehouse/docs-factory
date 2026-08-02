/**
 * Structured Merkle tree of a content version, keyed off the document's real
 * structure: heading hierarchy as interior nodes, with per-section prose, code
 * blocks, and `file=` snippet sources as leaves.
 *
 * This REPLACES nothing — the flat `contentHash` (sha256 of the body) stays the
 * version identity. The tree adds a stricter, structural fingerprint whose node
 * keys are the same heading anchors comments pin to (slug.mjs / anchor.ts), so
 * the review layer can say precisely WHAT changed between two versions, drive a
 * version-history diff view, and skip re-anchoring provably-unchanged sections.
 *
 * A snippet-source leaf folds in the referenced file's content hash, so a change
 * to a `file=` source propagates up the tree even when the markdown byte is
 * identical — something the flat body hash can never notice.
 *
 * Pure reshaping of what pipeline.mjs already computes (extractHeadings +
 * resolveSnippets/collectCodeBlocks) — no re-parse. Node-only (`node:crypto`);
 * re-exported from node.mjs, never from the browser-safe index.mjs.
 */
import { createHash } from "node:crypto";
import { normalizeText } from "./normalize.mjs";

/** Reserved key/slug for prose before the first heading (blog intros etc.). */
export const PREAMBLE_KEY = "__preamble__";

const NUL = "\0";
function sha256(...parts) {
  return createHash("sha256").update(parts.join(NUL)).digest("hex");
}

/** Leaf hash for a heading's own prose (heading excluded). */
function proseHash(anchorSlug, fingerprint, bodyText) {
  return sha256("prose", anchorSlug, fingerprint, bodyText);
}
/** Leaf hash for a fenced code block (raw body, NOT normalized). */
function codeHash(lang, rawBody) {
  return sha256("code", lang ?? "", rawBody ?? "");
}
/** Leaf hash for a `file=` snippet source (folds the referenced file hash). */
function snippetHash(path, region, fileHash) {
  return sha256("snippet", path ?? "", region ?? "", fileHash ?? "");
}

/**
 * Build the Merkle tree for one document.
 *
 * @param {{
 *   headings: Array<{id,text,level,order,fingerprint,bodyText,charLen}>,
 *   snippets?: Array<{path,region,fileHash,order}>,
 *   codeBlocks?: Array<{lang,text,order}>,
 *   preamble?: { bodyText: string } | null,
 * }} input
 * @returns {{ rootHash: string, tree: MerkleNode, sections: SectionRow[] }}
 *
 * `tree` is the recursive node tree (for the merkle_tree jsonb blob + UI).
 * `sections` is the flat per-heading rows the DB's content_section table needs,
 * each carrying nodeHash/subtreeHash/parentAnchorSlug/depthPath so the server
 * can diff and re-anchor in SQL without deserializing the blob.
 *
 * @typedef {object} MerkleNode
 * @property {string} key          stable diff key (depth path, or synthetic for leaves)
 * @property {"doc"|"heading"|"prose"|"code"|"snippet"} kind
 * @property {string} nodeHash     hash of this node's own content
 * @property {string} subtreeHash  hash incl. all descendants (== nodeHash for leaves)
 * @property {number} level        heading level (0 for doc/non-heading)
 * @property {string} label        display label
 * @property {MerkleNode[]} children
 * @property {string} [anchorSlug]
 * @property {string} [snippetPath]
 * @property {string} [snippetRegion]
 *
 * @typedef {object} SectionRow
 * @property {string} anchorSlug
 * @property {string} fingerprint
 * @property {string} headingText
 * @property {number} headingLevel
 * @property {number} ordinal
 * @property {string} plainText
 * @property {number} charLen
 * @property {string} nodeHash
 * @property {string} subtreeHash
 * @property {string|null} parentAnchorSlug
 * @property {string} depthPath
 */
export function buildMerkleTree({
  headings = [],
  snippets = [],
  codeBlocks = [],
  preamble = null,
} = {}) {
  // Leaves that live under a heading, each tagged (by pipeline.mjs) with the
  // `sectionSlug` of its containing heading (or PREAMBLE_KEY when it precedes the
  // first heading) and a document-`position` so we keep source order. Attribution
  // by slug is exact; position only orders leaves within one section.
  const leaves = [
    ...snippets.map((s) => ({
      sectionSlug: s.sectionSlug ?? "",
      position: s.position ?? 0,
      make: (parentKey) => ({
        key: `${parentKey}#snippet:${s.path}:${s.region ?? ""}`,
        kind: "snippet",
        nodeHash: snippetHash(s.path, s.region, s.fileHash),
        level: 0,
        label: s.region ? `${s.path} (${s.region})` : s.path,
        children: [],
        snippetPath: s.path,
        snippetRegion: s.region ?? "",
      }),
    })),
    ...codeBlocks.map((c) => ({
      sectionSlug: c.sectionSlug ?? "",
      position: c.position ?? 0,
      make: (parentKey, idx) => ({
        key: `${parentKey}#code:${idx}`,
        kind: "code",
        nodeHash: codeHash(c.lang, c.text),
        level: 0,
        label: c.lang ? `code (${c.lang})` : "code",
        children: [],
      }),
    })),
  ];
  const leavesFor = (slug) =>
    leaves.filter((l) => l.sectionSlug === slug).sort((a, b) => a.position - b.position);

  const sections = [];
  const sectionNodes = []; // parallel to `headings`, the heading MerkleNode
  const stack = []; // {level, node, depthSegments}

  // Preamble first (direct child of root), if any prose precedes the first heading.
  const rootChildren = [];
  const preambleText = preamble ? normalizeText(preamble.bodyText ?? "") : "";
  if (preambleText) {
    const nodeHash = proseHash(PREAMBLE_KEY, "", preambleText);
    const node = {
      key: PREAMBLE_KEY,
      kind: "prose",
      nodeHash,
      subtreeHash: nodeHash,
      level: 0,
      label: "(preamble)",
      children: [],
      anchorSlug: PREAMBLE_KEY,
    };
    rootChildren.push(node);
    sections.push({
      anchorSlug: PREAMBLE_KEY,
      fingerprint: "",
      headingText: "",
      headingLevel: 0,
      ordinal: -1,
      plainText: preambleText,
      charLen: preambleText.length,
      nodeHash,
      subtreeHash: nodeHash, // backfilled below if preamble has leaf children
      parentAnchorSlug: null,
      depthPath: PREAMBLE_KEY,
    });
    // Code/snippet leaves appearing before the first heading hang off the
    // preamble prose node so they participate in the tree + its subtree hash.
    let pIdx = 0;
    for (const leaf of leavesFor(PREAMBLE_KEY)) node.children.push(leaf.make(PREAMBLE_KEY, pIdx++));
  }

  // Build heading nodes in document order, nesting by level via a stack.
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    // Pop the stack until the top is a shallower heading (its parent).
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    const depthSegments = [...(parent ? parent.depthSegments : []), h.fingerprint];
    const depthPath = depthSegments.join("/");

    // The heading's own prose leaf: hash the DIRECT body (prose before the first
    // child heading) so a parent's own hash is stable when only a descendant
    // changes. Falls back to bodyText for callers that predate directBodyText.
    const ownProse = h.directBodyText ?? h.bodyText;
    const pHash = proseHash(h.id, h.fingerprint, ownProse);
    const proseNode = {
      key: `${depthPath}#prose`,
      kind: "prose",
      nodeHash: pHash,
      subtreeHash: pHash,
      level: 0,
      label: "(section prose)",
      children: [],
      anchorSlug: h.id,
    };

    const node = {
      key: depthPath,
      kind: "heading",
      nodeHash: "", // filled below once children are known (heading node = its identity + children)
      subtreeHash: "",
      level: h.level,
      label: h.text,
      children: [proseNode],
      anchorSlug: h.id,
    };

    // Attach code/snippet leaves attributed to this heading (by anchor slug).
    let leafIdx = 0;
    for (const leaf of leavesFor(h.id)) node.children.push(leaf.make(depthPath, leafIdx++));

    sectionNodes[i] = node;
    if (parent) parent.node.children.push(node);
    else rootChildren.push(node);
    stack.push({ level: h.level, node, depthSegments });

    sections.push({
      anchorSlug: h.id,
      fingerprint: h.fingerprint,
      headingText: h.text,
      headingLevel: h.level,
      ordinal: h.order,
      plainText: h.bodyText,
      charLen: h.charLen ?? h.bodyText.length,
      nodeHash: pHash, // the section's own-content hash is its prose leaf
      subtreeHash: "", // filled after subtree hashes computed
      parentAnchorSlug: parent ? parent.node.anchorSlug : null,
      depthPath,
    });
  }

  // Compute heading node + subtree hashes bottom-up. A heading's nodeHash is its
  // own identity (level + fingerprint), its subtreeHash folds children in
  // document order. Leaves already have subtreeHash == nodeHash.
  function finalize(node) {
    if (node.kind === "heading") {
      node.nodeHash = sha256("h" + node.level, node.label);
    }
    for (const child of node.children) finalize(child);
    if (node.children.length === 0) {
      node.subtreeHash = node.nodeHash;
    } else {
      node.subtreeHash = sha256(node.nodeHash, ...node.children.map((c) => c.subtreeHash));
    }
  }

  const root = {
    key: "",
    kind: "doc",
    nodeHash: sha256("doc"),
    subtreeHash: "",
    level: 0,
    label: "(document)",
    children: rootChildren,
    anchorSlug: "",
  };
  finalize(root);

  // Backfill each section's subtreeHash from its heading node (or its own prose
  // node for the preamble). Match by depthPath, which is unique per section.
  const byPath = new Map();
  (function collect(n) {
    if (n.kind === "heading" || (n.kind === "prose" && n.key === PREAMBLE_KEY))
      byPath.set(n.key, n);
    for (const c of n.children) collect(c);
  })(root);
  for (const s of sections) {
    const n = byPath.get(s.depthPath);
    if (n) s.subtreeHash = n.subtreeHash;
  }

  return { rootHash: root.subtreeHash, tree: root, sections };
}
