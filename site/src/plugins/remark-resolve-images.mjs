/**
 * remark-resolve-images — make a draft's relative image paths resolve in the
 * review app, in dev and in the production build alike.
 *
 * A draft references its committed assets relatively (`./assets/x.png`,
 * `../../envs/<name>/diagram.png`) so it renders on GitHub and in plain
 * Markdown. But drafts are loaded from *outside* the Vite root, and MDX does not
 * turn a relative image URL into a bundled asset — a bare relative path would
 * resolve against the browser route and 404.
 *
 * Each *relative* image becomes `/repo-assets/<repo-relative path>` and is
 * reported through `onAsset` so the repo-assets Vite plugin
 * (scripts/repo-assets.mjs) can serve it in dev and emit it into dist/.
 * Not Vite's `/@fs/<abs>`: only the dev server answers that, so every image
 * 404'd in the deployed app. The layout mirrors the repo, so a Trestle snapshot's
 * sibling files resolve beside it. Absolute URLs and `http(s):`/`data:` sources
 * are left alone. This runs before remark-likec4-views / remark-trestle-views,
 * which still see the image (and its title) and upgrade it.
 */
import { dirname, relative, resolve, sep } from "node:path";

export const REPO_ASSET_BASE = "/repo-assets";

export default function remarkResolveImages({ repoRoot, onAsset } = {}) {
  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    if (!mdPath) return;
    const mdDir = dirname(mdPath);

    const walk = (node) => {
      if (node.type === "image" && typeof node.url === "string") {
        const url = node.url;
        const external =
          /^([a-z]+:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
        if (!external) {
          const abs = resolve(mdDir, url);
          const rel = relative(repoRoot, abs);
          if (rel.startsWith("..") || rel.startsWith(sep)) {
            throw new Error(`${mdPath}: image ${url} resolves outside the repository`);
          }
          node.url = `${REPO_ASSET_BASE}/${rel.split(sep).join("/")}`;
          onAsset?.(abs, {
            trestle: typeof node.title === "string" && /^trestle=/.test(node.title),
          });
        }
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
