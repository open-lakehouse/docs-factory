/**
 * remark-mdx-safe-text — escape MDX-significant characters in PROSE so a portable,
 * plain-Markdown draft serializes to valid MDX.
 *
 * MDX is stricter than CommonMark: a bare `<`, `>`, or `{`/`}` in text is parsed
 * as JSX / an expression. Drafts are authored as portable Markdown ("richness is a
 * property of the renderer, never the source") and legitimately contain prose like
 * `engine <> catalog` or `{id}` — which is fine on GitHub / in the Google Docs
 * flatten, but breaks when the unitycatalog target re-serializes the tree as MDX
 * (remark-mdx throws "Expected a closing tag for `<>`").
 *
 * This plugin walks `text` nodes and, for each MDX-significant character, splits
 * the text and inserts a raw `html` node carrying the HTML ENTITY (`<`→`&lt;`,
 * `>`→`&gt;`, `{`→`&#123;`, `}`→`&#125;`). An `html` node is emitted VERBATIM by
 * remark-stringify (its `&` is not re-escaped), unlike a `text` node — writing the
 * entity straight into a text node would come out as a literal `\&lt;`. The entity
 * renders as the literal character in the browser.
 *
 * It deliberately touches ONLY `text` nodes, so inline code (`inlineCode`), fenced
 * code (`code`), and the JSX/import nodes the construct plugins emitted
 * (`mdxJsxFlowElement`, `mdxjsEsm`) are left untouched — code keeps its `<`/`{`,
 * and real components/imports keep their syntax.
 *
 * UC-target only; runs LAST, just before the MDX stringify.
 */

const ESCAPES = { "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" };
const MDX_CHARS = /[<>{}]/;

/** Split a text value into alternating `text` / `html`(entity) nodes. Returns the
 * original single node when nothing needs escaping. */
function splitTextValue(value) {
  if (!MDX_CHARS.test(value)) return null;
  const out = [];
  let buf = "";
  for (const ch of value) {
    if (ESCAPES[ch]) {
      if (buf) {
        out.push({ type: "text", value: buf });
        buf = "";
      }
      out.push({ type: "html", value: ESCAPES[ch] });
    } else {
      buf += ch;
    }
  }
  if (buf) out.push({ type: "text", value: buf });
  return out;
}

function escapeChildren(node) {
  // A JSX flow/text element, an ESM import, or code is opaque — don't descend into
  // raw values. (Code's children are handled by not matching `text` on the value.)
  if (node.type === "code" || node.type === "inlineCode") return;
  if (node.type === "mdxjsEsm" || node.type === "mdxFlowExpression") return;
  if (!node.children) return;

  const next = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      const split = splitTextValue(child.value);
      if (split) {
        next.push(...split);
        continue;
      }
    }
    escapeChildren(child);
    next.push(child);
  }
  node.children = next;
}

export default function remarkMdxSafeText() {
  return (tree) => {
    escapeChildren(tree);
  };
}
