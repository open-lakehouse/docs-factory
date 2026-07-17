/**
 * remark-stringify-mdx — a SERIALIZE-ONLY MDX extension for remark-stringify.
 *
 * We can't use `remark-mdx` here: adding it to the pipeline also installs its
 * PARSER extension, which then treats bare `<`/`{` in the ORIGINAL draft prose
 * (e.g. a heading `The engine <> catalog handshake`) as JSX and throws at parse
 * time — before any transform can escape it. Drafts are portable CommonMark, so
 * the parser must stay plain (CommonMark + directives); only the SERIALIZER needs
 * to know how to write out the `mdxJsxFlowElement` / `mdxjsEsm` nodes our
 * construct plugins created.
 *
 * This attaches `mdxToMarkdown()` (from mdast-util-mdx) to the remark-stringify
 * compiler's `toMarkdown` extensions — the serialize half only. Prose is kept
 * MDX-safe separately by remark-mdx-safe-text (escaping `<`/`{` in text nodes),
 * which now runs safely because the parser never tried to interpret them.
 */
import { mdxToMarkdown } from "mdast-util-mdx";

export default function remarkStringifyMdx() {
  const data = this.data();
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push(mdxToMarkdown());
}
