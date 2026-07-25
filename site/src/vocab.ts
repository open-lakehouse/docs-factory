// Browser-safe accessor for the single-source content vocabulary
// (content/vocab.json). Vite inlines the JSON at build time, so this works in
// the browser bundle — unlike site/src/content-core/vocab.mjs, which reads the
// file via node:fs for the Node-side manifest/pipeline. Both read the SAME JSON,
// and drift tests assert the site's derived constants match it, so the site and
// docsnip cannot diverge. See docs/design/build-pipeline.md.
import vocabJson from "../../content/vocab.json";

export interface Vocab {
  diataxis: string[];
  projects: string[];
  statuses: string[];
  pageWorthyKinds: string[];
}

export const vocab = vocabJson as Vocab;
