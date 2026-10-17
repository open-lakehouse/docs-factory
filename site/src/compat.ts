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

export interface CompatJourney {
  id: string;
  title: string;
  summary: string;
  request: string | null;
  family: string | null;
  /** The model asset kind it acts on, resolved by docsnip from family and defaults. */
  asset: string | null;
  requires: CompatRequirements;
  /** Keyed by interface; an interface nothing says anything about is absent. */
  cells: Record<string, CompatCell>;
}

export interface CompatInterface {
  key: string;
  label: string;
  version: string | null;
  package: string | null;
  model: string | null;
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
    | "unmigrated"
    | "unverified-asset"
    | "missing-asset-edge"
    | "unverified-asset-edge";
  interface?: string;
  source?: string;
  target?: string;
  asset?: string;
  journeys?: string[];
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
  journeys: CompatJourney[];
  verifiedEdges: CompatVerifiedEdge[];
  diagnostics: CompatDiagnostic[];
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
