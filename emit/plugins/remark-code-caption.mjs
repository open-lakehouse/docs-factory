/**
 * remark-code-caption — surface a code fence's filename as a bold caption line
 * above it, then strip the fence meta.
 *
 * The preview's remark-code-snippets.mjs resolves a `file=./snippets/x.py` fence
 * and records the source basename as `title="x.py"` in the code node's `meta`,
 * which the preview's <CodeBlock> chrome renders as a filename header. A plain
 * Markdown (FLATTENING) target has no code-block chrome to render fence meta, so
 * the "this code came from x.py" cue would be lost. This lifts it to a **bold
 * caption paragraph** immediately above the fence:
 *
 *   **read_write_delta_spark.py**
 *
 *   ```python
 *   import os
 *   …
 *   ```
 *
 * and clears `node.meta` so remark-stringify emits a clean fence (` ```python `)
 * rather than leaking ` ```python title="x.py" `. The filename is rendered as
 * inline code (`` `read_write_delta_spark.py` ``) so remark-stringify doesn't
 * escape the underscores (a bold caption would emit `read\_write\_…`).
 *
 * Runs AFTER remark-journey-md (journey step fences are now at document level) and
 * BEFORE remark-stringify. A fence with no `title=` meta (a plain output block,
 * a JSON response) gets no caption and its meta, if any, is left untouched.
 */

const TITLE_RE = /\btitle="([^"]*)"/;

function captionParagraph(text) {
  return {
    type: "paragraph",
    children: [{ type: "inlineCode", value: text }],
  };
}

export default function remarkCodeCaption() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "code" && typeof child.meta === "string") {
          const m = child.meta.match(TITLE_RE);
          if (m) {
            child.meta = null; // clean fence on stringify
            node.children.splice(i, 0, captionParagraph(m[1]));
            i += 1; // skip the caption we just inserted
            continue;
          }
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
