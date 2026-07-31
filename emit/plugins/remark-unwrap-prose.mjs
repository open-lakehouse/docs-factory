/**
 * remark-unwrap-prose — collapse hard-wrapped prose into one line per paragraph.
 *
 * Blog drafts hard-wrap prose at ~85 cols for readable diffs. That newline lives
 * INSIDE the mdast text node's value (`"…do more\nthan point…"`) — an authoring
 * artifact, not reader structure. A flattening target (md-twin) reflows to one line
 * per paragraph so the served twin reads cleanly: the hard wraps are dropped, and
 * adjacent blocks keep their blank-line separators instead of being glued together.
 * (Component targets like unitycatalog opt out — MDX must keep authored line breaks.)
 *
 * We only touch `text` nodes inside prose containers (paragraph, heading,
 * blockquote, list items via recursion). We never descend into `code` /
 * `inlineCode` (their `\n`s are significant), so code blocks and inline spans are
 * untouched. A single `\n` becomes a space; runs of blank lines can't occur
 * inside one text node (they're paragraph breaks in mdast), so a simple
 * newline→space collapse is safe.
 */

const SKIP = new Set(["code", "inlineCode"]);

export default function remarkUnwrapProse() {
  return (tree) => {
    const walk = (node) => {
      if (SKIP.has(node.type)) return;
      if (node.type === "text" && typeof node.value === "string") {
        // Join soft-wrapped lines: collapse any run of whitespace containing a
        // newline down to a single space. Leaves normal inter-word spacing alone.
        node.value = node.value.replace(/[ \t]*\n[ \t]*/g, " ");
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
