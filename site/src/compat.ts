// compat.ts — the resolved compatibility matrices `docsnip compat --fix` writes
// to content/<project>/compatibility.json (shape: tools/docsnip compat.artifact).
// Committed, so the bare Vercel build needs no uv.

export type CellStatus = "tested" | "fails" | "missing" | "documented" | "unknown";

export interface PageRef {
  project: string;
  bucket: string;
  slug: string;
}

export interface CompatProof {
  script: string;
  page: PageRef;
  anchor: string | null;
  ready: boolean;
  works: boolean;
  /** The error text the script asserts, when it asserts one. */
  fails: string | null;
  version: string | null;
  api: string | null;
  note: string | null;
}

export interface CompatEvidence {
  outcome: "works" | "fails" | "missing";
  /** Set when `source` names a page in this repo rather than a URL. */
  page: PageRef | null;
  why: string;
  source: string;
  api: string | null;
  verified: string | null;
  note: string | null;
  /** Set when a fact about this implementation (a server the project binds) blocks the cell. */
  implementation?: string | null;
}

export interface CompatCell {
  status: CellStatus;
  /** Only a draft page's claim says so. */
  draft: boolean;
  /** Every claim on the cell, ready or draft; the counted ones agree with `status`. */
  proofs: CompatProof[];
  evidence: CompatEvidence[];
}

/** Participant role → requirement edge (consumes / implements / realizes) → model ids. */
export type CompatRequirements = Record<string, Record<string, string[]>>;

export interface CompatFeature {
  /** An openSpecification model id. */
  spec: string;
  /** An obligation in architecture/journeys/obligations/<spec>.yml. */
  name: string;
  /** The spec version that added it, e.g. "v3" or "reader 3 · writer 7". */
  since: string | null;
}

/** An obligation a journey exercises, in the role its client takes (reader, writer, client). */
export interface CompatCover {
  spec: string;
  name: string;
  role: string;
}

/** `compat.COVERAGE_STATES` → how many of a role's obligations are in that state. */
export type CompatCoverageCounts = Record<
  "tested" | "documented" | "fails" | "missing" | "blocked" | "unknown" | "untracked",
  number
>;

/** What one column interface answers of a spec it reaches through the model. */
export interface CompatCoverage {
  interface: string;
  spec: string;
  roles: Record<string, CompatCoverageCounts>;
  obligations: {
    obligation: string;
    role: string;
    /** A cell status, `blocked` when a provider doesn't serve it, or `untracked`
     * when no journey a table shows covers it. */
    status: string;
    journeys: string[];
  }[];
}

export interface CompatJourney {
  id: string;
  title: string;
  summary: string;
  request: string | null;
  /** The architecture/journeys/paths.yml path: the contract each participant role needs. */
  path: string | null;
  /** The model asset kind it acts on. */
  asset: string | null;
  requires: CompatRequirements;
  /** The first obligation it covers, with its spec version; absent in older artifacts. */
  feature?: CompatFeature | null;
  /** Every obligation it covers; absent in artifacts written before obligations. */
  covers?: CompatCover[];
  /** Keyed by interface; an interface nothing says anything about is absent. */
  cells: Record<string, CompatCell>;
}

export interface CompatInterface {
  key: string;
  label: string;
  version: string | null;
  package: string | null;
  model: string | null;
  /** An engine-level column's language interfaces, whose best claim it shows. */
  rollup?: string[];
}

export interface CompatTable {
  id: string;
  title: string;
  columns: string[];
  rows: string[];
}

/** A model edge a gating claim exercises. */
export interface CompatVerifiedEdge {
  source: string;
  kind: string;
  target: string;
  interfaces: string[];
  journeys: string[];
}

/** Report-only model gaps (`docsnip compat.diagnostics`); `kind` names the shape. */
export interface CompatDiagnostic {
  kind:
    | "unmodeled"
    | "missing-edge"
    | "unverified-asset"
    | "missing-asset-edge"
    | "unverified-asset-edge";
  interface?: string;
  source?: string;
  /** On `missing-edge`: the kind the journey's client needs, `consumes` or `implements`. */
  edge?: string;
  target?: string;
  asset?: string;
  journeys?: string[];
}

/** A model implementation and its interfaces, with the journeys that apply to it. */
export interface CompatEngine {
  id: string;
  title: string;
  interfaces: string[];
  /** The page embedding `compat:engine:<id>`, and the heading it sits under. */
  page: PageRef | null;
  anchor: string | null;
  heading: string | null;
  /** A table narrowed to this engine's interfaces. */
  groups: { table: string; columns: string[]; rows: string[] }[];
}

export interface CompatMatrix {
  /** Bumped when a field is removed or changes meaning. */
  version: number;
  project: string;
  spec: string | null;
  interfaces: CompatInterface[];
  tables: CompatTable[];
  /** The journeys grouped by asset, shaped like tables; `id` is the asset's model id. */
  assets: CompatTable[];
  engines: CompatEngine[];
  journeys: CompatJourney[];
  verifiedEdges: CompatVerifiedEdge[];
  diagnostics: CompatDiagnostic[];
  /** Absent in artifacts written before obligations. */
  coverage?: CompatCoverage[];
}

const modules = import.meta.glob<CompatMatrix>("../../content/*/compatibility.json", {
  eager: true,
  import: "default",
});

export const matrices: CompatMatrix[] = Object.values(modules).sort((a, b) =>
  a.project.localeCompare(b.project),
);

const UNKNOWN: CompatCell = { status: "unknown", draft: false, proofs: [], evidence: [] };

export function cellOf(journey: CompatJourney, iface: string): CompatCell {
  return journey.cells[iface] ?? UNKNOWN;
}

/** A row worth a reviewer's attention: some column it shows is unproven. */
export function isGap(journey: CompatJourney, columns: string[]): boolean {
  return columns.some((c) => {
    const cell = cellOf(journey, c);
    return cell.status === "unknown" || cell.status === "documented" || cell.draft;
  });
}
