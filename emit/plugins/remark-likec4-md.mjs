/**
 * remark-likec4-md — the Markdown-flattening counterpart of the preview's
 * remark-likec4-views.mjs. The preview upgrades a `likec4=`-titled image to an
 * interactive `<LikeC4View>`; here, on a static target, the committed (freshly
 * regenerated) PNG is what survives, so we:
 *
 *   1. normalize the image node to a plain image — drop the `likec4=<viewId>`
 *      title (it was only ever a tooltip / the interactive key) and reduce the
 *      URL to a bare filename (`./assets/managedTableFlow.png` → `managedTableFlow.png`);
 *   2. record it in a shared manifest so the delivery adapter can upload + insert
 *      the real PNG (a plain Markdown reference won't embed a local path).
 *
 * This plugin also records **every other image** in the draft (D2 SVG/PNG,
 * screenshots — the graceful-degradation path) in the manifest, normalizing their
 * URLs to filenames too, so the adapter has one complete list of assets to ship.
 * It never throws: an image it can't resolve on disk is still emitted (with a
 * `localPath: null` manifest entry) so the flatten degrades, not fails.
 *
 * Options: `{ manifest, assetsDir, renderImage, likec4Dir }` — the plugin pushes
 * `{ filename, localPath, altText, originalTitle, likec4 }` entries onto
 * `manifest`, resolves `localPath` against `assetsDir` (the draft's folder), and
 * asks the target's `renderImage(entry)` for the mdast node to leave in the tree
 * (e.g. md-twin returns a paragraph-wrapped image pointing at the site-served PNG).
 * If `renderImage` is omitted, the image is left as a plain filename-only image
 * (the portable default).
 *
 * For a `likec4=<viewId>` image, `localPath` points at the FRESHLY regenerated
 * PNG in `likec4Dir` (`<likec4Dir>/<viewId>.png`) rather than the committed
 * `assets/<filename>.png`. LikeC4 names its export by view id, while the draft
 * references its own (often renamed) filename; this bridge means the delivered
 * image is always the just-regenerated one, matching the .likec4 source, with no
 * dependency on the committed PNG being current or the names agreeing.
 *
 * Runs near the end, after the structural flattens, before remark-stringify.
 */
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const LIKEC4_TITLE_RE = /^likec4=(\S+)$/;

/** Default: reduce the image to a bare-filename, title-less plain image. */
function plainImage(entry) {
  return { type: "image", url: entry.filename, alt: entry.altText, title: null };
}

export default function remarkLikeC4Md(options = {}) {
  const manifest = options.manifest ?? [];
  const draftDir = options.assetsDir ?? process.cwd();
  const likec4Dir = options.likec4Dir ?? null;
  const renderImage = options.renderImage ?? plainImage;

  const makeEntry = (image) => {
    const filename = basename(image.url);
    const titleM =
      typeof image.title === "string" ? image.title.match(LIKEC4_TITLE_RE) : null;
    const viewId = titleM ? titleM[1] : null;
    // A likec4= image resolves to the freshly exported <viewId>.png; anything
    // else resolves to its committed file next to the draft.
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

  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // A standalone image is a `paragraph` wrapping exactly one image. Replace
        // the *paragraph* so a block-level target node (e.g. md-twin's
        // paragraph-wrapped image) isn't nested inside another paragraph.
        if (
          child.type === "paragraph" &&
          child.children?.length === 1 &&
          isLocalImage(child.children[0])
        ) {
          node.children[i] = renderImage(makeEntry(child.children[0]));
          continue;
        }
        // An inline image mid-prose stays inline: reduce it to a plain
        // filename-only image regardless of target (a placeholder block would
        // break the sentence).
        if (isLocalImage(child)) {
          node.children[i] = plainImage(makeEntry(child));
          continue;
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
