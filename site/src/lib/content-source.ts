/**
 * Shared content discovery helpers — one place for path parsing so content.ts
 * and sidebar.ts don't each re-derive project/bucket/slug.
 *
 * NOTE: `import.meta.glob(...)` requires a LITERAL string argument (Vite static
 * analysis), so the glob patterns are inlined at each call site; they cannot be
 * passed as variables from here.
 */

export function slugFromBlogPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? path;
}

export function parseDocPath(path: string): { project: string; bucket: string; slug: string } {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? "";
  return {
    project: parts[parts.length - 3] ?? "",
    bucket: parts[parts.length - 2] ?? "",
    slug: filename.replace(/\.mdx?$/, ""),
  };
}

export function projectFromPath(filePath: string): string {
  return filePath.split("/").slice(-3, -2)[0] ?? "";
}

export function bucketFromPath(filePath: string): string {
  return filePath.split("/").slice(-2, -1)[0] ?? "";
}

export function slugFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  return name.replace(/\.mdx?$/, "");
}

/** All doc file paths discovered at build time (keys from import.meta.glob).
 * This file is one level deeper than src/, hence `../../../content`. */
export const docPaths = Object.keys(
  import.meta.glob("../../../content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}", { eager: true }),
).filter((p) => !p.endsWith("/README.md"));
