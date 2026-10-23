// The compatibility table's model: one project's journeys × interfaces, grouped,
// filtered, and sorted by state the table's own header controls set. Pure, so
// /plan/compat (state in the URL) and the Model pages (state local, rows scoped
// to an implementation or a path) render the same thing.
import type { CompatInterface, CompatJourney, CompatMatrix } from "../../compat";
import { BUCKETS, type Bucket, type BucketCounts, bucketOf } from "../estate-graph";
import { featureKey } from "./compat-stats";

export const GROUPS = ["table", "path", "asset", "spec", "none"] as const;
export type GroupBy = (typeof GROUPS)[number];

export const GROUP_LABEL: Record<GroupBy, string> = {
  table: "Docs table",
  path: "Path",
  asset: "Asset",
  spec: "Spec version",
  none: "No grouping",
};

export const SHOWS = ["all", "gaps", "draft", "fails", "blocked"] as const;
export type Show = (typeof SHOWS)[number];

export const SHOW_LABEL: Record<Show, string> = {
  all: "All journeys",
  gaps: "With gaps",
  draft: "With draft-only claims",
  fails: "With failures",
  blocked: "Blocked by a server",
};

export interface TableState {
  project: string | null;
  group: GroupBy;
  show: Show;
  q: string;
  /** Sort the rows of each group by one column; `desc` puts its gaps first. */
  sort: { col: string; desc: boolean } | null;
  /** Keep only the rows whose cell in `col` is in `bucket`. */
  where: { col: string; bucket: Bucket } | null;
  hidden: string[];
  /** `<journey>:<interface>`, the open cell. */
  cell: string | null;
}

/** What a Model page narrows the table to. */
export interface TableScope {
  /** Only the interfaces bound to this model implementation. */
  model?: string;
  /** Only the journeys on this path. */
  path?: string;
}

export const DEFAULT_STATE: TableState = {
  project: null,
  group: "table",
  show: "all",
  q: "",
  sort: null,
  where: null,
  hidden: [],
  cell: null,
};

export interface TableGroup {
  key: string;
  title: string;
  /** The docs table it is, when grouped by table: journey requests are placed on one. */
  table: string | null;
  /** The columns this group shows; a docs table shows only some. */
  columns: Set<string>;
  rows: CompatJourney[];
  counts: Map<string, BucketCounts>;
}

export interface TableModel {
  matrix: CompatMatrix;
  /** What the header shows, in tab order. */
  columns: CompatInterface[];
  /** What the column menu can show again. */
  available: CompatInterface[];
  groups: TableGroup[];
  totals: BucketCounts;
  rows: number;
}

const zero = (): BucketCounts => Object.fromEntries(BUCKETS.map((b) => [b, 0])) as BucketCounts;

const GAP: ReadonlySet<Bucket> = new Set(["unknown", "documented", "draft"]);
const SHOWN: Record<Exclude<Show, "all">, (b: Bucket) => boolean> = {
  gaps: (b) => GAP.has(b),
  draft: (b) => b === "draft",
  fails: (b) => b === "fails" || b === "missing",
  blocked: (b) => b === "blocked",
};

/** Best first: a column sorted ascending lists what's proven on top. */
const RANK: Record<Bucket, number> = Object.fromEntries(BUCKETS.map((b, i) => [b, i])) as Record<
  Bucket,
  number
>;

/** The projects whose matrix has something in scope. */
export function scopedMatrices(matrices: CompatMatrix[], scope: TableScope = {}): CompatMatrix[] {
  return matrices.filter(
    (m) =>
      (!scope.model || m.interfaces.some((i) => i.model === scope.model)) &&
      (!scope.path || m.journeys.some((j) => j.path === scope.path)),
  );
}

function groupKey(j: CompatJourney, group: GroupBy): string {
  if (group === "path") return j.path ?? "";
  if (group === "asset") return j.asset ?? "";
  if (group === "spec") return featureKey(j) ?? "";
  return "all";
}

export function buildTable(
  matrix: CompatMatrix,
  state: TableState,
  scope: TableScope = {},
  titleOf: (group: GroupBy, key: string) => string = (_, k) => k,
): TableModel {
  const tabled = new Set(matrix.tables.flatMap((t) => t.columns));
  const available = matrix.interfaces.filter((i) =>
    scope.model ? i.model === scope.model : tabled.has(i.key),
  );
  const columns = available.filter((i) => !state.hidden.includes(i.key));
  const keys = columns.map((c) => c.key);
  const needle = state.q.trim().toLowerCase();

  const keep = (j: CompatJourney, cols: Set<string>) => {
    if (scope.path && j.path !== scope.path) return false;
    const shown = keys.filter((k) => cols.has(k));
    const buckets = shown.map((k) => bucketOf(j.cells[k]));
    if (scope.model && !shown.some((k) => j.cells[k])) return false;
    if (needle && !`${j.id} ${j.title} ${j.summary}`.toLowerCase().includes(needle)) return false;
    if (state.show !== "all" && !buckets.some(SHOWN[state.show])) return false;
    if (
      state.where &&
      (!cols.has(state.where.col) || bucketOf(j.cells[state.where.col]) !== state.where.bucket)
    )
      return false;
    return true;
  };

  let raw: Omit<TableGroup, "counts">[];
  if (state.group === "table" && !scope.model) {
    const byId = new Map(matrix.journeys.map((j) => [j.id, j]));
    raw = matrix.tables.map((t) => ({
      key: t.id,
      title: t.title,
      table: t.id,
      columns: new Set(t.columns),
      rows: t.rows.map((id) => byId.get(id)).filter((j): j is CompatJourney => !!j),
    }));
  } else {
    const group = state.group === "table" ? "path" : state.group;
    const all = new Set(keys);
    const byKey = new Map<string, CompatJourney[]>();
    for (const j of matrix.journeys) {
      const k = groupKey(j, group);
      byKey.set(k, [...(byKey.get(k) ?? []), j]);
    }
    raw = [...byKey.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
      .map(([k, rows]) => ({
        key: k || "—",
        title: k ? titleOf(group, k) : "None",
        table: null,
        columns: all,
        rows,
      }));
  }

  const totals = zero();
  let count = 0;
  const groups = raw.flatMap((g) => {
    const rows = g.rows.filter((j) => keep(j, g.columns));
    if (state.sort && g.columns.has(state.sort.col)) {
      const { col, desc } = state.sort;
      rows.sort((a, b) => {
        const d = RANK[bucketOf(a.cells[col])] - RANK[bucketOf(b.cells[col])];
        return desc ? -d : d;
      });
    }
    const counts = new Map(keys.filter((k) => g.columns.has(k)).map((k) => [k, zero()]));
    for (const j of rows)
      for (const [k, n] of counts) {
        const b = bucketOf(j.cells[k]);
        n[b] += 1;
        totals[b] += 1;
      }
    count += rows.length;
    return rows.length > 0 || g.table ? [{ ...g, rows, counts }] : [];
  });
  return { matrix, columns, available, groups, totals, rows: count };
}

// --- the URL ------------------------------------------------------------------

/** `?project&group&show&q&sort=<col>[:desc]&where=<col>:<bucket>&hide=a,b&cell`, plus old links. */
export function parseState(p: URLSearchParams): TableState {
  const group = p.get("group");
  const show = p.get("show");
  const [sortCol, dir] = (p.get("sort") ?? "").split(":");
  const where = p.get("where");
  const i = where?.lastIndexOf(":") ?? -1;
  const bucket = where && i > 0 ? where.slice(i + 1) : null;
  return {
    project: p.get("project"),
    group: (GROUPS as readonly string[]).includes(group ?? "")
      ? (group as GroupBy)
      : p.get("since")
        ? "spec"
        : "table",
    show: (SHOWS as readonly string[]).includes(show ?? "")
      ? (show as Show)
      : p.get("gaps") === "1"
        ? "gaps"
        : "all",
    q: p.get("q") ?? "",
    sort: sortCol ? { col: sortCol, desc: dir === "desc" } : null,
    where:
      where && bucket && (BUCKETS as readonly string[]).includes(bucket)
        ? { col: where.slice(0, i), bucket: bucket as Bucket }
        : null,
    hidden: (p.get("hide") ?? "").split(",").filter(Boolean),
    cell: p.get("cell"),
  };
}

export function stateParams(s: TableState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.project) p.set("project", s.project);
  if (s.group !== "table") p.set("group", s.group);
  if (s.show !== "all") p.set("show", s.show);
  if (s.q) p.set("q", s.q);
  if (s.sort) p.set("sort", s.sort.desc ? `${s.sort.col}:desc` : s.sort.col);
  if (s.where) p.set("where", `${s.where.col}:${s.where.bucket}`);
  if (s.hidden.length) p.set("hide", s.hidden.join(","));
  if (s.cell) p.set("cell", s.cell);
  return p;
}

/** `<journey>:<interface>`: journey ids are dotted and interface keys dashed. */
export function parseCell(raw: string | null): { journey: string; iface: string } | null {
  const i = raw?.lastIndexOf(":") ?? -1;
  if (!raw || i <= 0) return null;
  return { journey: raw.slice(0, i), iface: raw.slice(i + 1) };
}
