/**
 * remark-trestle-md — resolve each ```` ```trestle <ref> ```` diagram marker
 * (site/src/plugins/lib/trestle-ref.mjs) for an emit target.
 *
 * Every marker is recorded on `entries` as `{ ref, env, snapshot, alt }` (`env`
 * null for a snapshot beside the page, `snapshot` its path on disk), so a target
 * that draws the interactive diagram can ship the snapshot. The node is replaced
 * by the target's `renderTrestle(entry)`; by default, the alt text followed by
 * Trestle's Mermaid flowchart, the structured graph a reader of plain Markdown
 * (an agent, a blog platform) can use without the canvas.
 *
 * An empty ref, a missing snapshot, or a ref with no Mermaid fails the emit;
 * `docsnip check` reports the same before it gets here.
 */
import { existsSync } from "node:fs";
import {
  resolveTrestleRef,
  trestleMarker,
  trestleMermaid,
} from "../../site/src/plugins/lib/trestle-ref.mjs";

/** Default: the alt text as a paragraph, then the Mermaid fence. */
export function mermaidNodes(entry) {
  const nodes = [];
  if (entry.alt) nodes.push({ type: "paragraph", children: [{ type: "text", value: entry.alt }] });
  nodes.push({ type: "code", lang: "mermaid", meta: null, value: trestleMermaid(entry) });
  return nodes;
}

export default function remarkTrestleMd({ entries = [], envsDir, pageDir, renderTrestle } = {}) {
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
        entries.push(entry);
        const out = render(entry);
        return Array.isArray(out) ? out : [out];
      });
    };
    walk(tree);
  };
}
