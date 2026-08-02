/**
 * The single source of truth for the content vocabulary, loaded from
 * content/vocab.json. Both the JS side (this module) and the Python side
 * (tools/docsnip/src/docsnip/vocab.py) read the same file, so the controlled
 * vocabularies can no longer drift between the site and docsnip.
 *
 * This holds only the *content* vocabulary. Model element ids stay sourced from
 * the LikeC4 model (architecture/dist/model.json) — a different authority.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// site/src/content-core -> repo root -> content/vocab.json
const vocabPath = resolve(here, "../../../content/vocab.json");

/** @type {{diataxis:string[],projects:string[],statuses:string[],pageWorthyKinds:string[]}} */
export const vocab = JSON.parse(readFileSync(vocabPath, "utf8"));

export const DIATAXIS = vocab.diataxis;
export const PROJECTS = vocab.projects;
export const STATUSES = vocab.statuses;
export const PAGE_WORTHY_KINDS = vocab.pageWorthyKinds;
