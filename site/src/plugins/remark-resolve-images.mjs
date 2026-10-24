/**
 * remark-resolve-images — make a draft's relative image paths resolve in the
 * review app, in dev and in the production build alike.
 *
 * A draft references its committed assets relatively (`./assets/x.png`) so it
 * renders on GitHub and in plain Markdown. But drafts are loaded from *outside* the Vite root, and MDX does not
 * turn a relative image URL into a bundled asset — a bare relative path would
 * resolve against the browser route and 404.
 *
 * Each *relative* image becomes `/repo-assets/<repo-relative path>` and is
 * reported through `onAsset` so the repo-assets Vite plugin
 * (scripts/repo-assets.mjs) can serve it in dev and emit it into dist/.
 * Not Vite's `/@fs/<abs>`: only the dev server answers that, so every image
 * 404'd in the deployed app. Absolute URLs and `http(s):`/`data:` sources are
 * left alone.
 *
 * A ```` ```trestle <ref> ```` marker's ref (an environment, or a snapshot beside
 * the page; lib/trestle-ref.mjs) becomes its snapshot's URL the same way. The
 * layout mirrors the repo, so the snapshot's files resolve beside it. This runs
 * before remark-likec4-views / remark-trestle-views, which upgrade the image and
 * the marker.
 */
import { dirname, join, relative, resolve, sep } from "node:path";
import { resolveTrestleRef, trestleMarker } from "./lib/trestle-ref.mjs";

export const REPO_ASSET_BASE = "/repo-assets";

export default function remarkResolveImages({ repoRoot, onAsset } = {}) {
  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    if (!mdPath) return;
    const mdDir = dirname(mdPath);
    const assetUrl = (abs, what) => {
      const rel = relative(repoRoot, abs);
      if (rel.startsWith("..") || rel.startsWith(sep)) {
        throw new Error(`${mdPath}: ${what} resolves outside the repository`);
      }
      return `${REPO_ASSET_BASE}/${rel.split(sep).join("/")}`;
    };

    const walk = (node) => {
      if (node.type === "image" && typeof node.url === "string") {
        const url = node.url;
        const external =
          /^([a-z]+:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
        if (!external) {
          const abs = resolve(mdDir, url);
          node.url = assetUrl(abs, `image ${url}`);
          onAsset?.(abs);
        }
      }
      const marker = trestleMarker(node);
      if (marker?.ref) {
        const { snapshot } = resolveTrestleRef(marker.ref, {
          envsDir: join(repoRoot, "envs"),
          pageDir: mdDir,
        });
        node.meta = assetUrl(snapshot, `trestle ${marker.ref}`);
        onAsset?.(snapshot, { trestle: true });
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
