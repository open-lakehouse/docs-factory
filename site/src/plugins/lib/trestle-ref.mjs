/**
 * Trestle diagram markers: a fenced block whose language is `trestle`, whose
 * meta names the diagram, and whose body is its alt text.
 *
 * ```trestle uc-local
 * Clients on the host reach Unity Catalog on port 8080 …
 * ```
 *
 * The ref is a generated environment (`envs/<name>/diagram.trestle-graph.json`)
 * or a snapshot exported from Trestle's editor, relative to the page
 * (`./assets/<stem>.trestle-graph.json`). Sites draw the interactive canvas from
 * the snapshot; the .md twins get Trestle's Mermaid instead (`trestleMermaid`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const TRESTLE_LANG = "trestle";
export const SNAPSHOT_SUFFIX = ".trestle-graph.json";
export const ENV_SNAPSHOT = `diagram${SNAPSHOT_SUFFIX}`;

/** `{ ref, alt }` for a marker node, else null. */
export function trestleMarker(node) {
  if (node?.type !== "code" || node.lang !== TRESTLE_LANG) return null;
  return { ref: (node.meta ?? "").trim(), alt: (node.value ?? "").replace(/\s+/g, " ").trim() };
}

/** A marker node for `ref`, with `alt` as its body. */
export function markerNode(ref, alt) {
  return { type: "code", lang: TRESTLE_LANG, meta: ref, value: alt };
}

/**
 * Where `ref`'s snapshot is on disk: `{ env, snapshot }`, `env` the environment
 * it names or null for a snapshot beside the page (`pageDir`).
 */
export function resolveTrestleRef(ref, { envsDir, pageDir }) {
  if (ref.endsWith(SNAPSHOT_SUFFIX)) return { env: null, snapshot: resolve(pageDir, ref) };
  return { env: ref, snapshot: join(envsDir, ref, ENV_SNAPSHOT) };
}

const MERMAID_FENCE_RE = /^```mermaid[^\n]*\n([\s\S]*?)\n```[ \t]*$/m;

/**
 * Trestle's Mermaid flowchart for a resolved ref: an environment's from the
 * `## Architecture` section `trestle env render` writes into its README.md, an
 * exported snapshot's from its `mermaid` field. Throws when there is none.
 */
export function trestleMermaid({ env, snapshot }) {
  if (env) {
    const readme = join(snapshot, "..", "README.md");
    if (!existsSync(readme))
      throw new Error(`${readme} is missing; run \`just env-render ${env}\``);
    const text = readFileSync(readme, "utf8");
    const at = text.search(/^## Architecture\s*$/m);
    const m = at === -1 ? null : text.slice(at).match(MERMAID_FENCE_RE);
    if (!m) throw new Error(`${readme} has no Architecture Mermaid block`);
    return m[1];
  }
  const { mermaid } = JSON.parse(readFileSync(snapshot, "utf8"));
  if (typeof mermaid !== "string" || !mermaid.trim()) {
    throw new Error(`${snapshot} has no mermaid field; re-export it from Trestle`);
  }
  return mermaid.trimEnd();
}
