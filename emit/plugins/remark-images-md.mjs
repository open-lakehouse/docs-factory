/**
 * remark-images-md — record every local image in a draft (D2 SVG/PNG,
 * screenshots) in the shared manifest, so a delivery adapter has one complete
 * list of assets to ship, and normalize each URL to a bare filename
 * (`./assets/flow.svg` → `flow.svg`; a plain Markdown reference won't embed a
 * local path). It never throws: an image it can't resolve on disk is still
 * emitted, with a `localPath: null` entry, so the flatten degrades, not fails.
 *
 * Options: `{ manifest, assetsDir, renderImage }`. Entries are
 * `{ filename, localPath, altText }`, `localPath` resolved against `assetsDir`
 * (the draft's folder). A standalone image becomes the target's
 * `renderImage(entry)` (e.g. md-twin's paragraph-wrapped image), by default a
 * title-less image at the bare filename; an inline image stays inline, at the
 * URL `renderImage` gives it.
 *
 * Runs near the end, after the structural flattens, before remark-stringify.
 */
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

function plainImage(entry) {
  return { type: "paragraph", children: [inlineImage(entry)] };
}

function inlineImage(entry) {
  return { type: "image", url: entry.filename, alt: entry.altText, title: null };
}

/** The image node inside what `renderImage` returns (a paragraph or an image). */
const imageOf = (node) => (node.type === "paragraph" ? node.children[0] : node);

/**
 * A standalone image stays a block. A bare inline node (a target's `image`) left
 * as a flow child makes mdast-util-to-markdown serialize its whole container as
 * phrasing, which drops the blank line between every block in the document.
 */
const INLINE = new Set(["image", "imageReference", "link", "linkReference", "text"]);
const asBlock = (node) => (INLINE.has(node.type) ? { type: "paragraph", children: [node] } : node);

/** An image whose URL is a path beside the draft, not a URL or data URI. */
export const isLocalImage = (n) =>
  n?.type === "image" &&
  typeof n.url === "string" &&
  !(/^([a-z]+:)?\/\//i.test(n.url) || n.url.startsWith("data:"));

/** Record `image` on `manifest`, resolved against `draftDir`. */
export function manifestEntry(image, { manifest, draftDir }) {
  const candidate = resolve(draftDir, image.url);
  const entry = {
    filename: basename(image.url),
    localPath: existsSync(candidate) ? candidate : null,
    altText: image.alt ?? "",
  };
  manifest.push(entry);
  return entry;
}

export default function remarkImagesMd(options = {}) {
  const manifest = options.manifest ?? [];
  const draftDir = options.assetsDir ?? process.cwd();
  const renderImage = options.renderImage ?? plainImage;
  const record = (image) => manifestEntry(image, { manifest, draftDir });

  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // A standalone image is a `paragraph` wrapping exactly one image. Replace
        // the *paragraph* so a block-level target node isn't nested in another.
        if (
          child.type === "paragraph" &&
          child.children?.length === 1 &&
          isLocalImage(child.children[0])
        ) {
          node.children[i] = asBlock(renderImage(record(child.children[0])));
          continue;
        }
        // Mid-prose, a block would break the sentence.
        if (isLocalImage(child)) {
          node.children[i] = imageOf(renderImage(record(child)));
          continue;
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
