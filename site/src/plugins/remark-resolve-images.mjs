/**
 * remark-resolve-images — make a draft's relative image paths resolve in the
 * preview.
 *
 * A draft references its committed assets relatively (`./assets/x.png`) so it
 * renders on GitHub and in plain Markdown. But drafts are loaded here from
 * *outside* the Vite root via `import.meta.glob`, and MDX does not turn a
 * relative image URL into a bundled asset — a bare `./assets/x.png` would
 * resolve against the browser route, not the draft's folder, and 404.
 *
 * We rewrite each *relative* image `url` to a Vite `/@fs/<abs>` path (the dev
 * server serves any file under `server.fs.allow`, which includes the repo root).
 * Absolute URLs and `http(s):`/`data:` sources are left alone. This runs before
 * remark-likec4-views converts `likec4=`-titled images into <LikeC4View>, so it
 * only ever touches images that stay static — exactly the degradation path.
 */
import { dirname, resolve } from "node:path";

export default function remarkResolveImages() {
  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    if (!mdPath) return;
    const mdDir = dirname(mdPath);

    const walk = (node) => {
      if (node.type === "image" && typeof node.url === "string") {
        const url = node.url;
        const external = /^([a-z]+:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
        if (!external) {
          node.url = "/@fs" + resolve(mdDir, url);
        }
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
