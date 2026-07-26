/**
 * Canonical content/blog file discovery for the Node-side pipeline (the version
 * manifest). The site itself discovers content via `import.meta.glob` (Vite
 * static analysis), which this module deliberately does not use so it stays
 * Vite-free and importable by plain Node/Bun scripts.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Recursively list files under `dir` matching `exts`, excluding README.md. */
export function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e)) && name !== "README.md") {
      out.push(full);
    }
  }
  return out;
}

/** Every blog post (an index.md at any depth under blogsDir). */
export function walkBlogs(blogsDir) {
  return walk(blogsDir, [".md"]).filter((p) => p.endsWith("/index.md"));
}

/** Every content page (.md or .mdx, README excluded). */
export function walkContent(contentDir) {
  return walk(contentDir, [".md", ".mdx"]);
}
