// explain.ts — enumerate the estate LikeC4 model's page-worthy concepts.
//
// Reads the estate model straight from the LikeC4 Vite plugin's virtual module
// (`likec4:single-project`, workspace = ../architecture/model) — no graph.json,
// no second codegen. Three page-worthy kinds:
//   capability        (level 1)
//   openSpecification (level 2)
//   implementation    (level 3)
// Specs are grouped under the capability they `specifies`; implementations
// under the spec they `implements` (or surfaced separately when they only
// `realize` a capability).
//
// This module is MODEL-ONLY on purpose (it stays free of content.ts so it's
// safe in the MDX import chain). The element → explanation-page binding and its
// href live in explain-bindings.ts; long-form explanation PROSE lives as an
// ordinary content page under content/**/explanation/ (frontmatter
// `explains: <id>`), not in the model.

import { $likec4model } from "likec4:single-project";
import type { ElementModel } from "likec4/model";
import { vocab } from "./vocab";

// The plugin inlines the layouted model synchronously, so the atom is
// populated at module-eval time — safe to read for the static nav below.
const likec4model = $likec4model.get();

export { likec4model };

/** Element kinds that get an explanation page. */
export type ExplainKind = "capability" | "openSpecification" | "implementation";
// The runtime set is single-sourced from content/vocab.json (shared with
// docsnip's PAGE_WORTHY_KINDS); the literal type above stays for compile-time
// narrowing. A drift test asserts the two stay in sync.
const EXPLAIN_KINDS = new Set<string>(vocab.pageWorthyKinds);

export interface ExplainEntry {
  id: string;
  title: string;
  kind: ExplainKind;
  summary: string;
}

export interface ExplainSpecificationNode extends ExplainEntry {
  kind: "openSpecification";
  /** Implementations that `implements` this specification. */
  implementations: ExplainEntry[];
}

export interface ExplainCapabilityNode extends ExplainEntry {
  kind: "capability";
  /** Specifications that `specifies` this capability. */
  specs: ExplainSpecificationNode[];
}

// --- Plain-text projection of a RichText field -----------------------------

/** Flatten a LikeC4 RichText (summary preferred, else description) to text. */
export function elementSummary(el: ElementModel): string {
  if (!el.summary.isEmpty) return el.summary.text;
  if (!el.description.isEmpty) return el.description.text;
  return "";
}

// --- Element enumeration ----------------------------------------------------

const allElements: ElementModel[] = [...likec4model.elements()];
const byId = new Map<string, ElementModel>(allElements.map((el) => [String(el.id), el]));

function toEntry(el: ElementModel): ExplainEntry {
  return {
    id: String(el.id),
    title: el.title,
    kind: el.kind as ExplainKind,
    summary: elementSummary(el),
  };
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

const capabilities = allElements.filter((el) => el.kind === "capability").sort(byTitle);
const specifications = allElements.filter((el) => el.kind === "openSpecification").sort(byTitle);
const implementations = allElements.filter((el) => el.kind === "implementation").sort(byTitle);

// Group each implementation under the specification it `implements`.
const implementationsBySpec = new Map<string, ElementModel[]>();
const orphanImplementationElements: ElementModel[] = [];

for (const impl of implementations) {
  const implementsTarget = [...impl.outgoing()]
    .filter((rel) => rel.kind === "implements")
    .map((rel) => rel.target)
    .find((target) => target.kind === "openSpecification");

  if (implementsTarget) {
    const key = String(implementsTarget.id);
    const list = implementationsBySpec.get(key);
    if (list) list.push(impl);
    else implementationsBySpec.set(key, [impl]);
  } else {
    orphanImplementationElements.push(impl);
  }
}

function toSpecNode(spec: ElementModel): ExplainSpecificationNode {
  return {
    ...toEntry(spec),
    kind: "openSpecification",
    implementations: (implementationsBySpec.get(String(spec.id)) ?? []).sort(byTitle).map(toEntry),
  };
}

// Group each specification under the capability it `specifies`.
const specsByCapability = new Map<string, ElementModel[]>();
const orphanSpecElements: ElementModel[] = [];

for (const spec of specifications) {
  const specifiesTarget = [...spec.outgoing()]
    .filter((rel) => rel.kind === "specifies")
    .map((rel) => rel.target)
    .find((target) => target.kind === "capability");

  if (specifiesTarget) {
    const key = String(specifiesTarget.id);
    const list = specsByCapability.get(key);
    if (list) list.push(spec);
    else specsByCapability.set(key, [spec]);
  } else {
    orphanSpecElements.push(spec);
  }
}

/** Capability → its specifications → implementations (for the sidebar). */
export const explainNav: ExplainCapabilityNode[] = capabilities.map((cap) => ({
  ...toEntry(cap),
  kind: "capability",
  specs: (specsByCapability.get(String(cap.id)) ?? []).sort(byTitle).map(toSpecNode),
}));

/** Specifications that don't `specifies` any capability (surfaced separately). */
export const orphanSpecs: ExplainSpecificationNode[] = orphanSpecElements
  .sort(byTitle)
  .map(toSpecNode);

/** Implementations that don't `implements` any specification (surfaced separately). */
export const orphanImplementations: ExplainEntry[] = orphanImplementationElements
  .sort(byTitle)
  .map(toEntry);

/** Flat list of every element that has an explanation page. */
export const explainEntries: ExplainEntry[] = [
  ...capabilities.map(toEntry),
  ...specifications.map(toEntry),
  ...implementations.map(toEntry),
];

// --- Lookups ----------------------------------------------------------------

/** Element for a page-worthy explain kind, or null otherwise. The relationship
 * to a content page (and its href) is resolved in explain-bindings.ts. */
export function getExplainElement(id: string): ElementModel | null {
  const el = byId.get(id);
  return el && EXPLAIN_KINDS.has(el.kind) ? el : null;
}

/** Human label for a kind badge. */
export function kindLabel(kind: string): string {
  switch (kind) {
    case "capability":
      return "Capability";
    case "openSpecification":
      return "Specification";
    case "implementation":
      return "Implementation";
    default:
      return kind;
  }
}
