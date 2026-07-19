/**
 * remark-code-snippets — resolve `file=`/`start=`/`end=` code fences at build
 * time, so a draft shows the *real, verified* snippet without hand-copying it.
 *
 * A draft keeps the runnable code in `snippets/*.py` (the source of truth, per
 * blogs/CONVENTIONS.md §5) and references it from a fence:
 *
 *   ```python file=./snippets/read_write_delta_spark.py
 *   ```
 *     → inlines the ENTIRE file (imports + setup + body: self-contained).
 *
 *   ```python file=./snippets/x.py start=setup end=read
 *   ```
 *     → inlines only the region between the marker lines (markers excluded).
 *       The marked region must itself be self-contained (include imports/setup).
 *
 * The fence body stays empty; nothing is copied into the Markdown, so the preview
 * always shows exactly what the snippet source contains. Shared by the preview
 * harness and emit/. Resolution rules mirror tools/docsnip/snippetcheck.py.
 * Runs before Shiki
 * highlighting, so the resolved code is highlighted normally.
 *
 * Degradation: a plain fence (no `file=`) is untouched. A `file=` that can't be
 * resolved throws with a clear message — a broken reference should fail the
 * build, not silently render an empty block.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const FILE_RE = /\bfile=(\S+)/;
const START_RE = /\bstart=(\S+)/;
const END_RE = /\bend=(\S+)/;

// Vite runs the site build from `site/`; the repo root is its parent. Used to
// emit a repo-relative source path on each resolved fence so the rendered block
// can be anchored back to its git-tracked source for review (matches the path
// keys the version manifest registers).
const REPO_ROOT = resolve(process.cwd(), "..");

/** 1-based line just after the unique `marker` line, or -1 if not unique. */
function lineAfterMarker(text, marker) {
  const lines = text.split("\n");
  let idx = -1;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) {
      if (n === 0) idx = i;
      n++;
    }
  }
  return n === 1 ? idx + 2 : -1;
}

/** Count lines containing `marker` as a substring. */
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

/** Extract the region strictly between the start and end marker lines. */
function extractRegion(srcText, start, end, relFile) {
  for (const [marker, kind] of [[start, "start"], [end, "end"]]) {
    const n = countMarker(srcText, marker);
    if (n === 0) throw new Error(`${kind} marker '${marker}' not found in ${relFile}`);
    if (n > 1) throw new Error(`${kind} marker '${marker}' found ${n}× in ${relFile} (must be unique)`);
  }
  const lines = srcText.split("\n");
  const startIdx = lines.findIndex((l) => l.includes(start));
  const endIdx = lines.findIndex((l) => l.includes(end));
  // Between the markers, exclusive of the marker lines themselves.
  return dedent(lines.slice(startIdx + 1, endIdx));
}

export default function remarkCodeSnippets() {
  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    const mdDir = mdPath ? dirname(mdPath) : process.cwd();

    const walk = (node) => {
      if (node.type === "code") {
        const meta = node.meta ?? "";
        const fileM = meta.match(FILE_RE);
        if (fileM) {
          const relFile = fileM[1];
          const src = resolve(mdDir, relFile);
          let srcText;
          try {
            srcText = readFileSync(src, "utf8");
          } catch {
            throw new Error(`${mdPath}: snippet source not found: ${relFile}`);
          }
          const startM = meta.match(START_RE);
          const endM = meta.match(END_RE);
          try {
            node.value =
              startM && endM
                ? extractRegion(srcText, startM[1], endM[1], relFile)
                : srcText.replace(/\n$/, ""); // whole file, sans trailing newline
          } catch (err) {
            throw new Error(`${mdPath}: ${err.message}`);
          }
          // Strip only the snippet keys (file=/start=/end=) so downstream
          // (Shiki) doesn't choke on them, but PRESERVE any other meta — e.g.
          // `step="…"`, which remark-journey reads to label a journey step, and
          // `title="…"`, which rehype-pretty-code turns into a filename caption.
          let rest = meta
            .replace(FILE_RE, "")
            .replace(START_RE, "")
            .replace(END_RE, "")
            .replace(/\s+/g, " ")
            .trim();
          // Default the code-block header's filename to the snippet's basename,
          // unless the author already gave an explicit `title="…"`. So a
          // `file=./snippets/x.py` fence shows "x.py" in the block header — the
          // real source, one more cue that the code is inlined verbatim.
          if (!/\btitle=/.test(rest)) {
            const base = relFile.split("/").pop();
            rest = `${rest} title="${base}"`.trim();
          }
          // Emit the repo-relative source path (+ region + first inlined line)
          // so the rendered block can be anchored to its source for review.
          // `codeChromeTransformer` turns these into data-* on the <pre>.
          const srcPath = relative(REPO_ROOT, src);
          const startLine =
            startM && endM ? lineAfterMarker(srcText.replace(/\r\n/g, "\n"), startM[1]) : 1;
          const region = startM && endM ? `${startM[1]}..${endM[1]}` : "";
          rest = `${rest} srcpath="${srcPath}" srcstart="${startLine}"`.trim();
          if (region) rest = `${rest} srcregion="${region}"`;
          node.meta = rest || null;
        }
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
