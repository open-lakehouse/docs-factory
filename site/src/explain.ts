// explain.ts — turn the estate LikeC4 model into navigable explanation pages.
//
// Reads the estate model straight from the LikeC4 Vite plugin's virtual module
// (`likec4:single-project`, workspace = ../architecture/model) — no graph.json,
// no second codegen. Three page-worthy kinds:
//   capability        (level 1)  → /explain/<id>
//   openSpecification (level 2)  → /explain/<id>
//   implementation    (level 3)  → /explain/<id>
// Specs are grouped under the capability they `specifies`; implementations
// under the spec they `implements` (or surfaced separately when they only
// `realize` a capability). Long-form bodies
// come from `explainDoc` metadata (architecture/explain/*.md); nodes without
// one fall back to their model summary/description.

import type { ComponentType } from "react";
import type { ElementModel } from "likec4/model";
import { $likec4model } from "likec4:single-project";

// The plugin inlines the layouted model synchronously, so the atom is
// populated at module-eval time — safe to read for the static nav below.
const likec4model = $likec4model.get();

export { likec4model };

/** Element kinds that get an explanation page. */
export type ExplainKind = "capability" | "openSpecification" | "implementation";
const EXPLAIN_KINDS = new Set<string>([
  "capability",
  "openSpecification",
  "implementation",
]);

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

interface MdxModule {
  default: ComponentType;
  frontmatter?: Record<string, unknown>;
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
const byId = new Map<string, ElementModel>(
  allElements.map((el) => [String(el.id), el]),
);

function toEntry(el: ElementModel): ExplainEntry {
  return {
    id: String(el.id),
    title: el.title,
    kind: el.kind as ExplainKind,
    summary: elementSummary(el),
  };
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title);

const capabilities = allElements
  .filter((el) => el.kind === "capability")
  .sort(byTitle);
const specifications = allElements
  .filter((el) => el.kind === "openSpecification")
  .sort(byTitle);
const implementations = allElements
  .filter((el) => el.kind === "implementation")
  .sort(byTitle);

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
    implementations: (implementationsBySpec.get(String(spec.id)) ?? [])
      .sort(byTitle)
      .map(toEntry),
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
  specs: (specsByCapability.get(String(cap.id)) ?? [])
    .sort(byTitle)
    .map(toSpecNode),
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

// --- Explanation doc bodies (build-time MDX) --------------------------------

const explainDocModules = import.meta.glob<MdxModule>(
  "../../architecture/explain/**/*.md",
);

// Key loaders by their `explainDoc` value (path relative to architecture/),
// e.g. "explain/catalog.md".
const docLoaders = new Map<string, () => Promise<MdxModule>>();
for (const [path, loader] of Object.entries(explainDocModules)) {
  const rel = path.replace(/^.*\/architecture\//, "");
  docLoaders.set(rel, loader);
}

/** Resolve the lazy MDX loader for an element's `explainDoc`, if any. */
export function explainDocLoader(
  el: ElementModel,
): (() => Promise<MdxModule>) | null {
  const meta = el.getMetadata("explainDoc");
  const key = Array.isArray(meta) ? meta[0] : meta;
  if (!key) return null;
  return docLoaders.get(key) ?? null;
}

// --- Lookups ----------------------------------------------------------------

/** Element for an explain route, or null if the id isn't a page-worthy kind. */
export function getExplainElement(id: string): ElementModel | null {
  const el = byId.get(id);
  return el && EXPLAIN_KINDS.has(el.kind) ? el : null;
}

/** Whether a given element id has an explanation page (drives diagram links). */
export function hasExplainPage(id: string): boolean {
  return getExplainElement(id) !== null;
}

export function explainHref(id: string): string {
  return `/explain/${id}`;
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
