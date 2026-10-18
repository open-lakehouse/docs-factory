/**
 * Full-text search records for the site's command palette: one per section of
 * a RENDERED page body, plus one for any text before the first heading. The
 * page record also carries the page's place in the model (searchContext).
 *
 * Sections split exactly as in sections.mjs, so anchors are the rehype-slug ids
 * the page's headings carry. The text keeps its case (it is shown as the
 * result excerpt) and drops fenced code and raw HTML, which read as noise in an
 * excerpt; inline code stays so identifiers remain findable.
 */
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { modelLinkIds } from "../../site/src/content-core/projection.mjs";
import { extractHeadings } from "../../site/src/content-core/slug.mjs";

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkFrontmatter);

const SKIP = new Set(["code", "html", "yaml", "heading"]);
// Nodes whose children are separate blocks of text rather than one inline run.
const BLOCKS = new Set([
  "root",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "containerDirective",
  "footnoteDefinition",
]);

function plainText(node) {
  if (SKIP.has(node.type)) return "";
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(plainText).join(BLOCKS.has(node.type) ? " " : "");
}

// A container directive spanning headings (a `::::tab` group) is cut by the
// section split, leaving its closing fence in a later slice as literal text.
const BARE_FENCE = /^[ \t]*:{3,}[ \t]*$/gm;

function textOf(markdown) {
  return plainText(parser.parse(markdown.replace(BARE_FENCE, "")))
    .replace(/\s+/g, " ")
    .trim();
}

const sameIdentity = (a, b) =>
  a?.project === b.project && a?.bucket === b.bucket && a?.slug === b.slug;

/**
 * What a page means beyond its prose, as search text: its summary, the title
 * of the element it `explains:`, and the titles of what it references or
 * `model:`-links, plus each journey it proves with the interface that proves
 * it. Only `#public` elements count, as for `model:` links; a page's readiness
 * doesn't, since the emit already decided to publish it.
 * `page` is `{ identity, meta, body }` with the raw markdown body, `model` is
 * emit/docs/model.mjs `loadModel()`, `compat` the project's compatibility.json.
 */
export function searchContext({ identity, meta, body = "" }, { model, compat = null }) {
  const title = (id) => {
    const el = typeof id === "string" ? model.elements.get(id) : null;
    return el?.public ? el.title : null;
  };
  const refs = Array.isArray(meta.references) ? meta.references : [];
  const interfaces = new Map((compat?.interfaces ?? []).map((i) => [i.key, i]));
  const proven = (compat?.journeys ?? []).flatMap((j) =>
    Object.entries(j.cells ?? {})
      .filter(([, cell]) =>
        (cell.proofs ?? []).some((proof) => proof.works && sameIdentity(proof.page, identity)),
      )
      .flatMap(([key]) => [j.title, interfaces.get(key)?.label, title(interfaces.get(key)?.model)]),
  );
  const concepts = [...refs.map(title), ...modelLinkIds(body).map(title), ...proven];
  return {
    summary: typeof meta.summary === "string" ? meta.summary : null,
    explains: title(meta.explains),
    concepts: [...new Set(concepts.filter(Boolean))].join(" "),
  };
}

/**
 * @param {{ route: string, title: string, section: string[] }} page
 * @param {string} body  the rendered page body (no frontmatter)
 * @param {ReturnType<typeof searchContext>} [context]  page record only, so
 *   a concept doesn't count once per section
 */
export function searchRecords({ route, title, section }, body, context = {}) {
  const headings = extractHeadings(body);
  const record = (anchor, heading, text) => ({
    id: anchor ? `${route}#${anchor}` : route,
    route,
    anchor,
    page: title,
    heading,
    section,
    text,
  });
  // The page record always exists so a title-only match still finds the page.
  const out = [
    {
      ...record(null, null, textOf(body.slice(0, headings[0]?.offset ?? body.length))),
      ...context,
    },
  ];
  headings.forEach((h, i) => {
    const slice = body.slice(h.offset, headings[i + 1]?.offset ?? body.length);
    out.push(record(h.id, h.text, textOf(slice)));
  });
  return out;
}
