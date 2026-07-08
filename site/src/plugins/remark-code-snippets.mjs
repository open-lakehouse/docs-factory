/**
 * remark-code-snippets — resolve `file=/start=/end=` fences at build time.
 *
 * Docs in ../../content never inline code. A fence like
 *
 *   ```python file=../../../examples/python/read_delta_table.py \
 *             start=docs-read-delta-table-start end=docs-read-delta-table-end
 *   ```
 *
 * is resolved here: we read the referenced example file, slice the region
 * *between* the start/end marker lines (markers excluded), and replace the
 * fence body with that live code. Nothing is ever copied into the .md, so the
 * preview always shows exactly what the example source contains.
 *
 * The resolution rules deliberately mirror `tools/docsnip/.../snippetcheck.py`
 * (source must exist; each marker must appear exactly once) so this preview and
 * the repo's `docsnip check` CI can never disagree about a snippet.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors docsnip's _FENCE_RE: lang, then file/start/end meta in any order.
const FILE_RE = /\bfile=(\S+)/;
const START_RE = /\bstart=(\S+)/;
const END_RE = /\bend=(\S+)/;

/** Count lines that contain `marker` as a substring — same as docsnip. */
function countMarker(text, marker) {
  let n = 0;
  for (const line of text.split("\n")) if (line.includes(marker)) n++;
  return n;
}

/** Strip the common leading indentation from a block of lines. */
function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^\s*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

/**
 * Extract the region strictly between the start and end marker lines.
 * Throws with a docsnip-shaped message if a marker is missing or duplicated.
 */
function extractRegion(srcText, start, end, relFile) {
  for (const [marker, kind] of [
    [start, "start"],
    [end, "end"],
  ]) {
    const n = countMarker(srcText, marker);
    if (n === 0)
      throw new Error(`${kind} marker '${marker}' not found in ${relFile}`);
    if (n > 1)
      throw new Error(
        `${kind} marker '${marker}' found ${n}× in ${relFile} (must be unique)`,
      );
  }
  const lines = srcText.split("\n");
  const startIdx = lines.findIndex((l) => l.includes(start));
  const endIdx = lines.findIndex((l) => l.includes(end));
  // Region is between the markers, exclusive of the marker lines themselves.
  return dedent(lines.slice(startIdx + 1, endIdx));
}

export default function remarkCodeSnippets() {
  return (tree, file) => {
    // `file.history[0]` is the absolute path of the .md being processed;
    // the fence's file= is relative to that file's directory (like docsnip).
    const mdPath = file.history[0] ?? file.path;
    const mdDir = mdPath
      ? dirname(mdPath)
      : dirname(fileURLToPath(import.meta.url));

    visit(tree, "code", (node) => {
      const meta = node.meta ?? "";
      const fileM = meta.match(FILE_RE);
      const startM = meta.match(START_RE);
      const endM = meta.match(END_RE);
      if (!fileM || !startM || !endM) return; // ordinary fenced code block

      const relFile = fileM[1];
      const src = resolve(mdDir, relFile);
      let srcText;
      try {
        srcText = readFileSync(src, "utf8");
      } catch {
        throw new Error(
          `${mdPath}: snippet source not found: ${relFile}`,
        );
      }
      try {
        node.value = extractRegion(srcText, startM[1], endM[1], relFile);
      } catch (err) {
        throw new Error(`${mdPath}: ${err.message}`);
      }
      // Drop the meta so downstream highlighters don't choke on file=/start=.
      node.meta = null;
    });
  };
}

// Minimal unist visitor (avoids an extra dependency for one traversal).
function visit(tree, type, fn) {
  const walk = (node) => {
    if (node.type === type) fn(node);
    if (node.children) for (const child of node.children) walk(child);
  };
  walk(tree);
}
