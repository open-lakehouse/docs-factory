/**
 * remark-unwrap-prose — collapse hard-wrapped prose into one line per paragraph.
 *
 * Blog drafts hard-wrap prose at ~85 cols for readable diffs. That newline lives
 * INSIDE the mdast text node's value (`"…do more\nthan point…"`), and both
 * remark-stringify AND Google Docs' Markdown converters treat it literally:
 * `create_from_markdown` reflows it, but the in-place `replace_section` converter
 * turns every wrapped line into its OWN paragraph (with a blank line between) —
 * shredding a flowing paragraph into a ragged column. Emitting one line per
 * paragraph makes BOTH converters render identically and cleanly, so the
 * stable-URL update path matches the rich importer.
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
