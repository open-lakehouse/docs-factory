/// <reference types="vite/client" />
/// <reference types="likec4/vite-plugin-modules" />

// Drafts are Markdown loaded through @mdx-js/rollup, so they resolve as React
// component modules.
declare module "*.md" {
  import type { ComponentType } from "react";
  export const frontmatter: Record<string, unknown>;
  const MDXComponent: ComponentType;
  export default MDXComponent;
}
declare module "*.mdx" {
  import type { ComponentType } from "react";
  export const frontmatter: Record<string, unknown>;
  const MDXComponent: ComponentType;
  export default MDXComponent;
}

// The estate architecture model (../architecture/model) is served by the LikeC4
// Vite plugin as virtual modules (likec4:react, likec4:single-project, …). Their
// types come from the `likec4/vite-plugin-modules` reference at the top of this
// file; no local stub or codegen'd file is needed.
