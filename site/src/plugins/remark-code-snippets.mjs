/**
 * remark-code-snippets — resolve file= / start= / end= code fences at build
 * time, so a draft shows the real, verified snippet without hand-copying it.
 *
 *   ```python file=./snippets/x.py
 *   ```
 *     -> inlines the ENTIRE file (imports + setup + body: self-contained).
 *
 *   ```python file=./snippets/x.py start=setup end=read
 *   ```
 *     -> inlines only the region between the marker lines (markers excluded).
 *
 * This is now a THIN ADAPTER over site/src/content-core/fences.mjs: it owns
 * path resolution + meta rewriting, but the region resolution + dedent + line
 * numbers come from the shared resolveFence(), so the rendered block and the
 * version manifest's stored snippet are byte-identical (see
 * docs/design/build-pipeline.md). Shared verbatim with emit/ (emit imports this
 * file). Runs before Shiki so the resolved code is highlighted normally.
 *
 * Degradation: a plain fence (no file=) is untouched; a file= that cannot be
 * resolved throws with a clear message so a broken reference fails the build.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { parseFenceMeta, resolveFence, FILE_RE, START_RE, END_RE } from "../content-core/fences.mjs";

// Vite runs the site build from site/; the repo root is its parent. Used to emit
// a repo-relative source path on each resolved fence so the rendered block can be
// anchored back to its git-tracked source for review (matches the manifest keys).
const REPO_ROOT = resolve(process.cwd(), "..");

export default function remarkCodeSnippets() {
  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    const mdDir = mdPath ? dirname(mdPath) : process.cwd();

    const walk = (node) => {
      if (node.type === "code") {
        const meta = node.meta ?? "";
        const parsed = parseFenceMeta(meta);
        if (parsed) {
          const relFile = parsed.file;
          const src = resolve(mdDir, relFile);
          let srcText;
          try {
            srcText = readFileSync(src, "utf8");
          } catch {
            throw new Error(`${mdPath}: snippet source not found: ${relFile}`);
          }
          let resolved;
          try {
            resolved = resolveFence(srcText, { start: parsed.start, end: parsed.end });
          } catch (err) {
            throw new Error(`${mdPath}: ${err.message} in ${relFile}`);
          }
          node.value = resolved.text;

          // Strip only the snippet keys (file=/start=/end=) so downstream (Shiki)
          // doesn't choke on them, but PRESERVE any other meta — e.g. step="…"
          // (remark-journey) and title="…" (the filename caption).
          let rest = meta
            .replace(FILE_RE, "")
            .replace(START_RE, "")
            .replace(END_RE, "")
            .replace(/\s+/g, " ")
            .trim();
          // Default the code-block header's filename to the snippet's basename,
          // unless the author already gave an explicit title="…".
          if (!/\btitle=/.test(rest)) {
            const base = relFile.split("/").pop();
            rest = `${rest} title="${base}"`.trim();
          }
          // Emit the repo-relative source path (+ region + first inlined line) so
          // the rendered block can be anchored to its source for review.
          // codeChromeTransformer turns these into data-* on the <pre>.
          const srcPath = relative(REPO_ROOT, src);
          rest = `${rest} srcpath="${srcPath}" srcstart="${resolved.startLine}"`.trim();
          if (resolved.region) rest = `${rest} srcregion="${resolved.region}"`;
          node.meta = rest || null;
        }
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
