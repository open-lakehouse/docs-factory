// Repo files the review app's pages embed (remark-resolve-images reports them),
// served under /repo-assets/<repo-relative path>: by a dev middleware, and as
// emitted assets in the build so Vercel's filesystem route serves them.
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { SNAPSHOT_SUFFIX } from "../src/plugins/lib/trestle-ref.mjs";
import { REPO_ASSET_BASE } from "../src/plugins/remark-resolve-images.mjs";

const TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

/**
 * The files an embed needs served. A Trestle diagram's canvas fetches its
 * snapshot and opens a node's files from beside it — the same set
 * emit/docs/emit-docs.mjs ships to the docs sites.
 */
export function assetFiles(absPath, { trestle = false } = {}) {
  if (!trestle || !absPath.endsWith(SNAPSHOT_SUFFIX)) return [absPath];
  const { files = [] } = JSON.parse(readFileSync(absPath, "utf8"));
  return [absPath, ...files.map((path) => join(dirname(absPath), path))];
}

/** `{ onAsset, plugin }`: pass `onAsset` to remark-resolve-images, `plugin` to Vite. */
export function repoAssets({ repoRoot }) {
  // url → absolute path, filled as pages compile; the dev middleware serves
  // only these, so no request can reach outside them.
  const assets = new Map();
  const urlFor = (abs) => `${REPO_ASSET_BASE}/${relative(repoRoot, abs).split(sep).join("/")}`;

  const onAsset = (absPath, opts) => {
    for (const abs of assetFiles(absPath, opts)) assets.set(urlFor(abs), abs);
  };

  const plugin = {
    name: "docs-factory:repo-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const abs = assets.get(decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!abs) return next();
        try {
          if (!statSync(abs).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", TYPES[extname(abs)] ?? "text/plain; charset=utf-8");
        res.end(readFileSync(abs));
      });
    },
    generateBundle() {
      for (const [url, abs] of assets) {
        this.emitFile({ type: "asset", fileName: url.slice(1), source: readFileSync(abs) });
      }
    },
  };

  return { onAsset, plugin };
}
