// The journey graph the Model section explores: architecture/dist/journeys.json
// (the resolved catalog, shape: tools/docsnip compat.estate_artifact) joined with
// each project's compatibility.json. Pure, so bun tests run it on the committed
// artifacts; estate.ts binds it to the bundled ones.
import type {
  CellStatus,
  CompatCell,
  CompatCover,
  CompatCoverage,
  CompatCoverageCounts,
  CompatMatrix,
  CompatRequirements,
} from "../compat";

/** An implementation the model lets play a path role; `via` names the integrations it needs. */
export interface EstateCandidate {
  id: string;
  via: string[];
}

export interface EstatePath {
  roles: CompatRequirements;
  candidates: Record<string, EstateCandidate[]>;
}

export interface EstateInterface {
  label: string;
  package: string | null;
  model: string | null;
  via: string | null;
  integrations: string[];
  rollup: string[];
  /** Project → the version its column shows, for the projects listing it. */
  projects: Record<string, string | null>;
}

export interface EstateJourney {
  title: string;
  summary: string;
  request: string | null;
  path: string | null;
  asset: string | null;
  covers: CompatCover[];
  requires: CompatRequirements;
  /** The projects whose tables show it. */
  projects: string[];
  /** Retired ids that resolve to it. */
  aliases: string[];
}

export interface EstateObligation {
  name: string;
  roles: string[];
  since: string | null;
  /** Role → the journeys covering it in that role. */
  journeys: Record<string, string[]>;
}

export interface EstateSpec {
  title: string;
  /** The spec text the obligations are taken from. */
  source: string | null;
  roles: string[];
  obligations: EstateObligation[];
}

export interface EstateFact {
  implementation: string;
  obligations: { spec: string; name: string }[];
  outcome: "fails" | "missing";
  why: string;
  source: string;
  /** The cells it blocks, per project. */
  blocks: { project: string; interfaces: string[]; journeys: string[] }[];
}

export interface EstateEquivalence {
  id: string;
  title: string;
  differ: string | null;
  sides: Record<string, { obligations: string[]; journeys: string[]; text: string | null }>;
}

export interface EstateCatalog {
  version: number;
  paths: Record<string, EstatePath>;
  interfaces: Record<string, EstateInterface>;
  journeys: Record<string, EstateJourney>;
  specs: Record<string, EstateSpec>;
  facts: EstateFact[];
  equivalences: EstateEquivalence[];
}

/** How a cell reads at a glance: a draft claim is its own bucket. */
export type Bucket = CellStatus | "draft" | "blocked";

export const BUCKETS: readonly Bucket[] = [
  "tested",
  "draft",
  "documented",
  "fails",
  "missing",
  "blocked",
  "unknown",
];

export function bucketOf(cell: CompatCell | undefined): Bucket {
  if (!cell) return "unknown";
  if (cell.draft) return "draft";
  if (cell.proofs.length === 0 && cell.evidence[0]?.implementation) return "blocked";
  return cell.status;
}

export type BucketCounts = Record<Bucket, number>;

const zero = (): BucketCounts => Object.fromEntries(BUCKETS.map((b) => [b, 0])) as BucketCounts;

/** One project's column for an interface of the implementation. */
export interface ProfileColumn {
  project: string;
  key: string;
  label: string;
  version: string | null;
  /** The engine-level column whose claims include this one's. */
  rolledInto: string | null;
}

export interface ProfileCell {
  project: string;
  journey: string;
  interface: string;
  bucket: Bucket;
  cell: CompatCell;
}

export interface ImplementationProfile {
  id: string;
  columns: ProfileColumn[];
  /** Cells of its headline columns: a rollup's members are counted through it. */
  counts: BucketCounts;
  cells: ProfileCell[];
  coverage: (CompatCoverage & { project: string })[];
  /** Path → the roles the model lets it play there. */
  paths: { path: string; role: string; via: string[] }[];
  /** What it doesn't serve, when it's a server. */
  facts: EstateFact[];
  /** Server facts that block its columns. */
  blockedBy: { fact: EstateFact; project: string; journeys: string[] }[];
}

const isHeadline = (c: ProfileColumn, cols: ProfileColumn[]) =>
  !c.rolledInto || !cols.some((o) => o.project === c.project && o.key === c.rolledInto);

/** Everything the journey graph says about one model implementation. */
export function implementationProfile(
  id: string,
  catalog: EstateCatalog,
  matrices: CompatMatrix[],
): ImplementationProfile {
  const columns: ProfileColumn[] = [];
  for (const m of matrices) {
    const rolled = new Map(m.interfaces.flatMap((i) => (i.rollup ?? []).map((r) => [r, i.key])));
    for (const i of m.interfaces) {
      if (i.model !== id) continue;
      columns.push({
        project: m.project,
        key: i.key,
        label: i.label,
        version: i.version,
        rolledInto: rolled.get(i.key) ?? null,
      });
    }
  }
  const counts = zero();
  const cells: ProfileCell[] = [];
  for (const m of matrices) {
    const own = columns.filter((c) => c.project === m.project && isHeadline(c, columns));
    for (const j of m.journeys) {
      for (const c of own) {
        const cell = j.cells[c.key];
        if (!cell) continue;
        const bucket = bucketOf(cell);
        counts[bucket] += 1;
        cells.push({ project: m.project, journey: j.id, interface: c.key, bucket, cell });
      }
    }
  }
  const coverage = matrices.flatMap((m) =>
    (m.coverage ?? [])
      .filter((c) => columns.some((k) => k.project === m.project && k.key === c.interface))
      .map((c) => ({ ...c, project: m.project })),
  );
  const paths = Object.entries(catalog.paths).flatMap(([path, p]) =>
    Object.entries(p.candidates).flatMap(([role, found]) =>
      found.filter((c) => c.id === id).map((c) => ({ path, role, via: c.via })),
    ),
  );
  const blockedBy = catalog.facts.flatMap((fact) =>
    fact.blocks.flatMap((b) => {
      const mine = columns.filter((c) => c.project === b.project && b.interfaces.includes(c.key));
      return mine.length > 0 ? [{ fact, project: b.project, journeys: b.journeys }] : [];
    }),
  );
  return {
    id,
    columns,
    counts,
    cells,
    coverage,
    paths,
    facts: catalog.facts.filter((f) => f.implementation === id),
    blockedBy,
  };
}

/** The implementations the journey graph mentions, with how many cells each has. */
export function graphImplementations(
  catalog: EstateCatalog,
  matrices: CompatMatrix[],
): Map<string, number> {
  const found = new Map<string, number>();
  const add = (id: string | null, n = 0) => {
    if (id) found.set(id, (found.get(id) ?? 0) + n);
  };
  for (const m of matrices)
    for (const i of m.interfaces) {
      if ((i.rollup ?? []).length > 0) continue;
      add(i.model, m.journeys.filter((j) => j.cells[i.key]).length);
    }
  for (const f of catalog.facts) add(f.implementation);
  for (const p of Object.values(catalog.paths))
    for (const role of Object.values(p.candidates)) for (const c of role) add(c.id);
  return found;
}

/** A journey's cells in every project that shows it, columns in tab order. */
export function journeyCells(
  id: string,
  matrices: CompatMatrix[],
): {
  project: string;
  columns: { key: string; label: string; version: string | null; cell: CompatCell | undefined }[];
}[] {
  return matrices.flatMap((m) => {
    const j = m.journeys.find((x) => x.id === id);
    if (!j) return [];
    return [
      {
        project: m.project,
        columns: m.interfaces.map((i) => ({
          key: i.key,
          label: i.label,
          version: i.version,
          cell: j.cells[i.key],
        })),
      },
    ];
  });
}

/** One column of a spec's conformance heatmap: an interface measured against it. */
export interface SpecColumn {
  project: string;
  interface: string;
  label: string;
  model: string | null;
  roles: Record<string, CompatCoverageCounts>;
  /** `${obligation}:${role}` → coverage status. */
  status: Map<string, string>;
}

/** Every interface a project measures against the spec, from `coverage[]`. */
export function specColumns(spec: string, matrices: CompatMatrix[]): SpecColumn[] {
  return matrices.flatMap((m) =>
    (m.coverage ?? [])
      .filter((c) => c.spec === spec)
      .map((c) => {
        const iface = m.interfaces.find((i) => i.key === c.interface);
        return {
          project: m.project,
          interface: c.interface,
          label: iface?.label ?? c.interface,
          model: iface?.model ?? null,
          roles: c.roles,
          status: new Map(c.obligations.map((o) => [`${o.obligation}:${o.role}`, o.status])),
        };
      }),
  );
}

/** Answered share of a role's obligations: anything but unknown or untracked. */
export function answered(n: CompatCoverageCounts): { answered: number; total: number } {
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  return { answered: total - n.unknown - n.untracked, total };
}
