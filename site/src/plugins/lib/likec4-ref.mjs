/**
 * LikeC4 view markers: a fenced block whose language is `likec4`, whose meta is
 * the view id, and whose body is the diagram's alt text.
 *
 * ```likec4 ucDeltaApi_managedTableFlow
 * A client creates a managed table through the catalog, then commits to it …
 * ```
 *
 * Sites draw the interactive view; the .md twins get the view's Mermaid
 * (`likec4Mermaid`), which site/scripts/likec4-mermaid.mjs writes per view.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIKEC4_LANG = "likec4";

const GENERATOR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/likec4-mermaid.mjs",
);

/** `{ viewId, alt }` for a marker node, else null. */
export function likec4Marker(node) {
  if (node?.type !== "code" || node.lang !== LIKEC4_LANG) return null;
  return {
    viewId: (node.meta ?? "").trim(),
    alt: (node.value ?? "").replace(/\s+/g, " ").trim(),
  };
}

/** A marker node for `viewId`, with `alt` as its body. */
export function markerNode(viewId, alt) {
  return { type: "code", lang: LIKEC4_LANG, meta: viewId, value: alt };
}

/** Whether Markdown source has a marker, so a caller can skip generating. */
export function hasLikeC4Marker(source) {
  return /^[ \t]*(`{3,}|~{3,})likec4[ \t]+\S/m.test(source);
}

/** Write every view's `<viewId>.mmd` from `modelDir` into `outDir`. */
export function generateLikeC4Mermaid(modelDir, outDir) {
  execFileSync(process.execPath, [GENERATOR, modelDir, outDir], { stdio: "inherit" });
  return outDir;
}

/** A view's Mermaid from a generated `dir`. Throws when the view has none. */
export function likec4Mermaid(viewId, dir) {
  const file = join(dir, `${viewId}.mmd`);
  if (!existsSync(file)) throw new Error(`LikeC4 view ${viewId} is not in the model`);
  return readFileSync(file, "utf8").trimEnd();
}
