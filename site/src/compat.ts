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

export interface CompatJourney {
  id: string;
  title: string;
  summary: string | null;
  request: string | null;
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

export interface CompatMatrix {
  project: string;
  spec: string | null;
  interfaces: CompatInterface[];
  tables: CompatTable[];
  journeys: CompatJourney[];
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
