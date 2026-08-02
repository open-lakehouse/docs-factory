/**
 * content-core (Node-only barrel) — the build/server entry point. Re-exports
 * the full content-core surface INCLUDING the modules that pull in Node
 * built-ins: hash.mjs (`node:crypto`), frontmatter.mjs (`node:crypto`),
 * walk.mjs (`node:fs`), pipeline.mjs (`node:child_process`), and vocab.mjs
 * (`node:fs`). Import this only from Node/Bun contexts (the version manifest,
 * the review server, drift tests) — NEVER from browser-reachable code, or Vite
 * externalizes the Node built-ins into the client bundle and the site crashes
 * at load. Browser code imports the pure barrel `./index.mjs` (or leaf paths).
 * See docs/design/build-pipeline.md.
 */

export * from "./frontmatter.mjs";
export * from "./hash.mjs";
export * from "./index.mjs";
export * from "./pipeline.mjs";
export * from "./topics.mjs";
export * from "./tree.mjs";
export { DIATAXIS, PAGE_WORTHY_KINDS, PROJECTS, STATUSES, vocab } from "./vocab.mjs";
export * from "./walk.mjs";
