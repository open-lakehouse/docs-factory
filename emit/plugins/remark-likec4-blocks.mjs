/**
 * remark-likec4-blocks — resolve each ```` ```likec4 <viewId> ```` marker
 * (site/src/plugins/lib/likec4-ref.mjs) for an emit target.
 *
 * Every marker is recorded on `entries` as `{ viewId, alt, mermaid }`, the
 * Mermaid read from `likec4Dir` (written by `generateLikeC4Mermaid`). The node is
 * replaced by the target's `renderLikeC4(entry)`; by default, the alt text
 * followed by the Mermaid, the structured graph a reader of plain Markdown can
 * use without the interactive view.
 *
 * A marker with no view id, or a view the model doesn't have, fails the emit;
 * `docsnip check` reports the same before it gets here.
 */
import { likec4Marker, likec4Mermaid } from "../../site/src/plugins/lib/likec4-ref.mjs";
import { altAndMermaid } from "./remark-trestle-md.mjs";

const defaultRender = (entry) => altAndMermaid(entry.alt, entry.mermaid);

export default function remarkLikeC4Blocks({ entries = [], likec4Dir, renderLikeC4 } = {}) {
  const render = renderLikeC4 ?? defaultRender;
  return (tree, file) => {
    const where = file?.path ?? "page";
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        const marker = likec4Marker(child);
        if (!marker) {
          walk(child);
          return [child];
        }
        if (!marker.viewId) throw new Error(`${where}: a likec4 block needs a view id`);
        if (!likec4Dir) throw new Error(`${where}: likec4 ${marker.viewId}: no Mermaid generated`);
        let mermaid;
        try {
          mermaid = likec4Mermaid(marker.viewId, likec4Dir);
        } catch (err) {
          throw new Error(`${where}: ${err.message}`);
        }
        const entry = { ...marker, mermaid };
        entries.push(entry);
        const out = render(entry);
        return Array.isArray(out) ? out : [out];
      });
    };
    walk(tree);
  };
}
