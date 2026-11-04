/**
 * remark-trestle-md — resolve each ```` ```trestle <ref> ```` diagram marker
 * (site/src/plugins/lib/trestle-ref.mjs) for an emit target.
 *
 * Every marker is recorded on `entries` as `{ ref, env, snapshot, alt, url? }`
 * (`env` null for a snapshot beside the page, `snapshot` its path on disk, `url`
 * where it is served when the caller passes `urlBase`), so a target that draws
 * the interactive diagram can ship the snapshot. The node is replaced
 * by the target's `renderTrestle(entry)`; by default, the alt text followed by
 * Trestle's Mermaid flowchart, the structured graph a reader of plain Markdown
 * (an agent, a blog platform) can use without the canvas.
 *
 * An empty ref, a missing snapshot, or a ref with no Mermaid fails the emit;
 * `docsnip check` reports the same before it gets here.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  resolveTrestleRef,
  trestleMarker,
  trestleMermaid,
} from "../../site/src/plugins/lib/trestle-ref.mjs";

/** A diagram as plain Markdown: the alt text as a paragraph, then the Mermaid fence. */
export function altAndMermaid(alt, mermaid) {
  const nodes = [];
  if (alt) nodes.push({ type: "paragraph", children: [{ type: "text", value: alt }] });
  nodes.push({ type: "code", lang: "mermaid", meta: null, value: mermaid });
  return nodes;
}

/** The docs-site fallback fence remark-trestle-views / remark-likec4-views fold
 * into the diagram component. */
export function mermaidFallback(mermaid) {
  return { type: "code", lang: "mermaid", meta: "fallback", value: mermaid };
}

/** Where a site serves a marker's snapshot under `base`: an environment's at
 * `<base>/<env>/diagram.trestle-graph.json`, a page's own at `<base>/<file>`. */
export function trestleUrl(entry, base) {
  const file = basename(entry.snapshot);
  return entry.env ? `${base}/${entry.env}/${file}` : `${base}/${file}`;
}

/**
 * What a site serves for a diagram at `url`: `[{ url, path }]`, the snapshot and,
 * for an environment, each file its manifest lists, beside it (the diagram opens
 * a node's files from there). docsnip leaves sensitive files out of the manifest.
 */
export function trestleFiles(entry, url) {
  const files = [{ url, path: entry.snapshot }];
  if (!entry.env) return files;
  const { files: listed = [] } = JSON.parse(readFileSync(entry.snapshot, "utf8"));
  for (const path of listed) {
    files.push({ url: `${dirname(url)}/${path}`, path: join(dirname(entry.snapshot), path) });
  }
  return files;
}

/** Default: the alt text, then Trestle's Mermaid. */
export function mermaidNodes(entry) {
  return altAndMermaid(entry.alt, trestleMermaid(entry));
}

export default function remarkTrestleMd({
  entries = [],
  envsDir,
  pageDir,
  urlBase,
  renderTrestle,
} = {}) {
  const render = renderTrestle ?? mermaidNodes;
  return (tree, file) => {
    const where = file?.path ?? pageDir;
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        const marker = trestleMarker(child);
        if (!marker) {
          walk(child);
          return [child];
        }
        if (!marker.ref) throw new Error(`${where}: a trestle block needs a ref`);
        const entry = { ...marker, ...resolveTrestleRef(marker.ref, { envsDir, pageDir }) };
        if (!existsSync(entry.snapshot)) {
          throw new Error(`${where}: trestle ${marker.ref}: ${entry.snapshot} is missing`);
        }
        // A target that ships the snapshot serves it under `urlBase`.
        if (urlBase) entry.url = trestleUrl(entry, urlBase);
        entries.push(entry);
        const out = render(entry);
        return Array.isArray(out) ? out : [out];
      });
    };
    walk(tree);
  };
}
