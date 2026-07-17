/**
 * remark-likec4-mdx — the MDX-emitting counterpart of remark-likec4-md.mjs. It
 * MERGES the two responsibilities the static and rich renderers split:
 *
 *   1. Like the preview's site/src/plugins/remark-likec4-views.mjs, a STANDALONE
 *      `likec4=<viewId>` image (a paragraph wrapping one image) is upgraded to a
 *      `<LikeC4View viewId="<viewId>" />` element — the UC site's `LikeC4View.astro`
 *      wraps the framework-agnostic `<likec4-view>` web component (registered by
 *      the bundle emit.mjs generates), so the diagram is INTERACTIVE, not a PNG.
 *   2. Like the emitter's remark-likec4-md.mjs, it still records EVERY local image
 *      (the upgraded likec4 one AND plain D2/screenshot images) in the shared
 *      manifest — normalizing URLs to `./<filename>` — so the delivery step has one
 *      complete asset list to co-locate into the post folder, and the regenerated
 *      PNG remains a graceful fallback.
 *
 * A likec4= image resolves its manifest `localPath` to the FRESHLY regenerated
 * `<likec4Dir>/<viewId>.png` (keyed by view id), exactly like the `-md` variant, so
 * the shipped fallback matches the .likec4 source regardless of the committed PNG.
 *
 * An INLINE (mid-prose) likec4 image is left as a plain `./filename` image — an
 * interactive canvas mid-sentence is nonsense — mirroring the preview.
 *
 * Options: `{ manifest, assetsDir, likec4Dir, componentImportBase }`. Runs near the
 * end, after the structural rewrites, before the MDX stringify.
 */
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const LIKEC4_TITLE_RE = /^likec4=(\S+)$/;
const DEFAULT_IMPORT_BASE = "@/components/blog";
const IMPORT_NAME = "LikeC4View";

/** Build a default `import LikeC4View from "<base>/LikeC4View.astro"` mdast node
 * (Astro components are default exports). */
function importNode(base) {
  const source = `${base}/${IMPORT_NAME}.astro`;
  return {
    type: "mdxjsEsm",
    value: `import ${IMPORT_NAME} from "${source}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [
              { type: "ImportDefaultSpecifier", local: { type: "Identifier", name: IMPORT_NAME } },
            ],
            source: { type: "Literal", value: source, raw: `"${source}"` },
          },
        ],
      },
    },
  };
}

/** The interactive-view element for a resolved view id. */
function likec4ViewNode(viewId) {
  return {
    type: "mdxJsxFlowElement",
    name: IMPORT_NAME,
    attributes: [{ type: "mdxJsxAttribute", name: "viewId", value: viewId }],
    children: [],
  };
}

/** Reduce an image to a bare-`./`-prefixed, title-less plain image (the fallback
 * / non-likec4 path — matches how Astro resolves co-located post assets). */
function plainImage(entry) {
  return { type: "image", url: `./${entry.filename}`, alt: entry.altText, title: null };
}

export default function remarkLikeC4Mdx(options = {}) {
  const manifest = options.manifest ?? [];
  const draftDir = options.assetsDir ?? process.cwd();
  const likec4Dir = options.likec4Dir ?? null;
  const base = options.componentImportBase ?? DEFAULT_IMPORT_BASE;

  const makeEntry = (image) => {
    const filename = basename(image.url);
    const titleM =
      typeof image.title === "string" ? image.title.match(LIKEC4_TITLE_RE) : null;
    const viewId = titleM ? titleM[1] : null;
    const candidate =
      viewId && likec4Dir
        ? join(likec4Dir, `${viewId}.png`)
        : resolve(draftDir, image.url);
    const entry = {
      filename,
      localPath: existsSync(candidate) ? candidate : null,
      altText: image.alt ?? "",
      originalTitle: image.title ?? null,
      likec4: viewId,
    };
    manifest.push(entry);
    return entry;
  };

  const isLocalImage = (n) =>
    n?.type === "image" &&
    typeof n.url === "string" &&
    !(/^([a-z]+:)?\/\//i.test(n.url) || n.url.startsWith("data:"));

  const soleImage = (node) =>
    node.type === "paragraph" &&
    node.children?.length === 1 &&
    isLocalImage(node.children[0])
      ? node.children[0]
      : null;

  return (tree) => {
    let upgraded = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const only = soleImage(child);
        if (only) {
          const entry = makeEntry(only);
          if (entry.likec4) {
            // Standalone likec4= image → interactive <LikeC4View>. Replace the
            // wrapping PARAGRAPH so the block element isn't nested in a <p>.
            node.children[i] = likec4ViewNode(entry.likec4);
            upgraded = true;
          } else {
            // Standalone plain image (D2/screenshot) → `./filename` image.
            node.children[i] = plainImage(entry);
          }
          continue;
        }
        // An inline image mid-prose stays inline: plain `./filename` regardless of
        // type (a likec4 canvas mid-sentence is nonsense).
        if (isLocalImage(child)) {
          node.children[i] = plainImage(makeEntry(child));
          continue;
        }
        walk(child);
      }
    };
    walk(tree);

    // Inject the import once — AFTER a leading `yaml` frontmatter node if present
    // (MDX requires frontmatter to be the very first block), else at the top.
    if (upgraded) {
      const at = tree.children[0]?.type === "yaml" ? 1 : 0;
      tree.children.splice(at, 0, importNode(base));
    }
  };
}
