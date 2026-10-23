// The compatibility explorer's state, its URL form, named presets, and the
// pure queries the views run over the dataset (content-core/compat-dataset).
// Plain data in and out, so it runs under bun.
import type { CompatRow } from "../../compat";
import { BUCKETS, type CellBucket } from "../../content-core/coverage.mjs";
import { type CellCounts, emptyCellCounts } from "./compat-stats";

export const VIEWS = ["matrix", "cells", "scorecard"] as const;
export type ExplorerView = (typeof VIEWS)[number];

/** A dimension id of COMPAT_DIMENSIONS. */
export type Dim = keyof CompatRow & string;

export interface SortKey {
  id: string;
  desc: boolean;
}

export interface ExplorerState {
  view: ExplorerView;
  preset: string | null;
  /** A project id, or `all`. */
  project: string;
  /** The section (matrix), group (cells), or row (scorecard) dimension; null = none. */
  group: Dim | null;
  sort: SortKey[];
  /** Dimension → accepted values (see `valuesOf`); a row passes if any value matches. */
  filters: Partial<Record<Dim, string[]>>;
  q: string;
  gaps: boolean;
  /** A row id, `<project>/<journey>/<interface>`. */
  cell: string | null;
}

/** The value a null dimension filters and groups as. */
export const NONE = "(none)";

/** The matrix's group when none is set: the docs tables, as before the explorer. */
const DEFAULT_GROUP: Record<ExplorerView, Dim | null> = {
  matrix: "tables",
  cells: null,
  scorecard: "interface",
};

export function defaultState(project: string): ExplorerState {
  return {
    view: "matrix",
    preset: null,
    project,
    group: DEFAULT_GROUP.matrix,
    sort: [],
    filters: {},
    q: "",
    gaps: false,
    cell: null,
  };
}

export interface Preset {
  id: string;
  label: string;
  state: Partial<Omit<ExplorerState, "project" | "preset" | "cell">>;
}

export const PRESETS: readonly Preset[] = [
  { id: "by-table", label: "Matrix by table", state: { view: "matrix", group: "tables" } },
  { id: "by-asset", label: "Matrix by asset", state: { view: "matrix", group: "asset" } },
  {
    id: "by-feature",
    label: "Matrix by spec version",
    state: { view: "matrix", group: "featureKey" },
  },
  {
    id: "draft-only",
    label: "Draft-only claims",
    state: { view: "cells", group: "interface", filters: { bucket: ["draft"] } },
  },
  {
    id: "failures",
    label: "Known failures",
    state: { view: "cells", group: "engine", filters: { bucket: ["no"] } },
  },
  {
    id: "unknown",
    label: "Unknown cells",
    state: { view: "cells", group: "interface", filters: { bucket: ["unknown"] } },
  },
  {
    id: "scorecard",
    label: "Interface scorecard",
    state: { view: "scorecard", group: "interface" },
  },
  {
    id: "feature-scorecard",
    label: "Spec version scorecard",
    state: { view: "scorecard", group: "featureKey" },
  },
];

/** A preset's state over the defaults; the project and selection carry over. */
export function applyPreset(state: ExplorerState, preset: Preset): ExplorerState {
  return {
    ...defaultState(state.project),
    group: DEFAULT_GROUP[preset.state.view ?? "matrix"],
    ...preset.state,
    preset: preset.id,
  };
}

/** Switching view keeps filters but takes the view's default group. */
export function withView(state: ExplorerState, view: ExplorerView): ExplorerState {
  return { ...state, view, group: DEFAULT_GROUP[view], sort: [], preset: null, cell: null };
}

const FILTER_PREFIX = "f.";

/**
 * Reads the explorer from the query string. Pre-explorer links still land:
 * `group=asset`, `since=<featureKey>`, and `cell=<journey>:<interface>`.
 */
export function parseState(
  params: URLSearchParams,
  projects: readonly string[],
  dims: readonly string[],
): ExplorerState {
  const rawProject = params.get("project");
  const project =
    rawProject === "all" || (rawProject && projects.includes(rawProject))
      ? rawProject
      : (projects[0] ?? "all");
  const state = defaultState(project);
  const view = params.get("view");
  if (view && (VIEWS as readonly string[]).includes(view)) state.view = view as ExplorerView;
  state.group = DEFAULT_GROUP[state.view];
  const group = params.get("group");
  if (group === "none") state.group = null;
  else if (group && dims.includes(group)) state.group = group as Dim;
  state.preset = params.get("preset");
  state.q = params.get("q") ?? "";
  state.gaps = params.get("gaps") === "1";
  state.sort = (params.get("sort") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => (s.startsWith("-") ? { id: s.slice(1), desc: true } : { id: s, desc: false }));
  for (const [key, value] of params) {
    if (!key.startsWith(FILTER_PREFIX)) continue;
    const dim = key.slice(FILTER_PREFIX.length);
    if (dims.includes(dim) && value) state.filters[dim as Dim] = value.split(",");
  }
  const since = params.get("since");
  if (since && !state.filters.featureKey) state.filters.featureKey = [since];
  const cell = params.get("cell");
  if (cell && !cell.includes("/")) {
    const i = cell.lastIndexOf(":");
    state.cell = i > 0 ? `${project}/${cell.slice(0, i)}/${cell.slice(i + 1)}` : null;
  } else state.cell = cell;
  return state;
}

/** The query string for a state; defaults are left out so URLs stay short. */
export function stateParams(state: ExplorerState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("project", state.project);
  if (state.view !== "matrix") p.set("view", state.view);
  if (state.preset) p.set("preset", state.preset);
  if (state.group !== DEFAULT_GROUP[state.view]) p.set("group", state.group ?? "none");
  if (state.sort.length)
    p.set("sort", state.sort.map((s) => `${s.desc ? "-" : ""}${s.id}`).join(","));
  for (const [dim, values] of Object.entries(state.filters)) {
    if (values?.length) p.set(`${FILTER_PREFIX}${dim}`, values.join(","));
  }
  if (state.q) p.set("q", state.q);
  if (state.gaps) p.set("gaps", "1");
  if (state.cell) p.set("cell", state.cell);
  return p;
}

/** A row's values for a dimension, as strings: arrays spread, null is NONE. */
export function valuesOf(row: CompatRow, dim: Dim): string[] {
  const v = row[dim] as unknown;
  if (Array.isArray(v)) return v.length ? v.map(String) : [NONE];
  if (v === null || v === undefined) return [NONE];
  return [String(v)];
}

/** Unproven, worth a reviewer's attention; `isGap` per cell. */
export function isGapRow(row: CompatRow): boolean {
  return row.bucket === "unknown" || row.bucket === "documented" || row.bucket === "draft";
}

const SEARCHED: Dim[] = [
  "journey",
  "journeyTitle",
  "summary",
  "interfaceLabel",
  "engineTitle",
  "featureName",
  "api",
];

/**
 * Rows passing the project, filters, search, and gaps toggle; `except` skips
 * one filter (facets). The matrix applies gaps per journey (`matrixSections`)
 * so a gap row still shows its proven cells.
 */
export function filterRows(rows: CompatRow[], state: ExplorerState, except?: Dim): CompatRow[] {
  const q = state.q.trim().toLowerCase();
  const filters = Object.entries(state.filters).filter(
    ([dim, values]) => dim !== except && values?.length,
  ) as [Dim, string[]][];
  return rows.filter(
    (row) =>
      (state.project === "all" || row.project === state.project) &&
      (!state.gaps || state.view === "matrix" || isGapRow(row)) &&
      filters.every(([dim, values]) => valuesOf(row, dim).some((v) => values.includes(v))) &&
      (!q ||
        SEARCHED.some((dim) =>
          String(row[dim] ?? "")
            .toLowerCase()
            .includes(q),
        )),
  );
}

/** Each value of `dim` with how many rows carry it, most first. */
export function facet(rows: CompatRow[], dim: Dim): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const v of valuesOf(row, dim)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Toggles one value of a dimension's filter. */
export function toggleFilter(state: ExplorerState, dim: Dim, value: string): ExplorerState {
  const current = state.filters[dim] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const filters = { ...state.filters, [dim]: next };
  if (!next.length) delete filters[dim];
  return { ...state, filters, preset: null, cell: null };
}

export function countRows(rows: Iterable<CompatRow>): CellCounts {
  const counts = emptyCellCounts();
  for (const row of rows) counts[row.bucket]++;
  return counts;
}

/** Best first, as BUCKETS: what a sort by cell puts on top. */
export function bucketRank(bucket: CellBucket): number {
  return BUCKETS.indexOf(bucket);
}

export interface MatrixJourney {
  key: string;
  journey: CompatRow["source"]["journey"];
  /** Interface → row. */
  cells: Map<string, CompatRow>;
}

export interface MatrixSection {
  key: string;
  project: string;
  /** The group value, NONE when ungrouped. */
  value: string;
  /** The docs table when grouped by table. */
  table: CompatRow["source"]["matrix"]["tables"][number] | null;
  columns: CompatRow["source"]["iface"][];
  journeys: MatrixJourney[];
  rows: CompatRow[];
}

/**
 * The pivot: a section per project × group value, journeys down, interfaces
 * across. Grouped by table, a section keeps its docs table's row and column
 * order and leaves out cells no table places; otherwise journeys follow the
 * artifact and interfaces the artifact's interface order.
 */
export function matrixSections(
  rows: CompatRow[],
  group: Dim | null,
  gapsOnly = false,
): MatrixSection[] {
  const sections = new Map<string, MatrixSection>();
  for (const row of rows) {
    const values = group ? valuesOf(row, group) : [NONE];
    for (const value of values) {
      if (group === "tables" && value === NONE) continue;
      const key = `${row.project}\u0000${value}`;
      let section = sections.get(key);
      if (!section) {
        const table =
          group === "tables"
            ? (row.source.matrix.tables.find((t) => t.id === value) ?? null)
            : null;
        section = { key, project: row.project, value, table, columns: [], journeys: [], rows: [] };
        sections.set(key, section);
      }
      section.rows.push(row);
    }
  }
  for (const section of sections.values()) {
    const matrix = section.rows[0].source.matrix;
    const present = new Set(section.rows.map((r) => r.interface));
    const columnOrder = section.table?.columns ?? matrix.interfaces.map((i) => i.key);
    const ifaces = new Map(section.rows.map((r) => [r.interface, r.source.iface]));
    section.columns = columnOrder
      .filter((k) => present.has(k))
      .map((k) => ifaces.get(k))
      .filter((i): i is CompatRow["source"]["iface"] => !!i);
    const byJourney = new Map<string, MatrixJourney>();
    for (const row of section.rows) {
      let j = byJourney.get(row.journey);
      if (!j) {
        j = { key: `${row.project}/${row.journey}`, journey: row.source.journey, cells: new Map() };
        byJourney.set(row.journey, j);
      }
      j.cells.set(row.interface, row);
    }
    const rowOrder = section.table?.rows ?? matrix.journeys.map((j) => j.id);
    section.journeys = rowOrder
      .map((id) => byJourney.get(id))
      .filter(
        (j): j is MatrixJourney => !!j && (!gapsOnly || [...j.cells.values()].some(isGapRow)),
      );
  }
  // Grouped by table, sections keep the artifact's table order.
  const order = (s: MatrixSection) =>
    s.table ? s.rows[0].source.matrix.tables.indexOf(s.table) : 0;
  return [...sections.values()]
    .filter((s) => s.journeys.length > 0)
    .sort(
      (a, b) =>
        a.project.localeCompare(b.project) ||
        order(a) - order(b) ||
        (a.value === NONE ? 1 : b.value === NONE ? -1 : a.value.localeCompare(b.value)),
    );
}

/** Dimensions whose ids are only unique within a project: interface keys and table ids. */
export const PROJECT_SCOPED: ReadonlySet<string> = new Set(["interface", "tables"]);

/** Splits a project-scoped dimension per project when several projects show. */
export function scopesByProject(state: ExplorerState, dim: Dim | null): boolean {
  return state.project === "all" && !!dim && PROJECT_SCOPED.has(dim);
}

export interface ScoreRow {
  /** `<project>/<value>` when split by project, else the value. */
  id: string;
  value: string;
  /** Set when split by project. */
  project: string | null;
  counts: CellCounts;
  total: number;
  /** Answered by a ready page, as `answeredShare`. */
  answered: number;
  proven: number;
}

/** Bucket counts per value of `dim`, per project too when `byProject`. */
export function scorecard(rows: CompatRow[], dim: Dim, byProject = false): ScoreRow[] {
  const groups = new Map<string, { value: string; project: string | null; rows: CompatRow[] }>();
  for (const row of rows) {
    for (const value of valuesOf(row, dim)) {
      const project = byProject ? row.project : null;
      const id = project ? `${project}/${value}` : value;
      const group = groups.get(id);
      if (group) group.rows.push(row);
      else groups.set(id, { value, project, rows: [row] });
    }
  }
  return [...groups].map(([id, { value, project, rows: list }]) => {
    const counts = countRows(list);
    const total = list.length;
    return {
      id,
      value,
      project,
      counts,
      total,
      answered: total ? (counts.proven + counts.no) / total : 0,
      proven: total ? counts.proven / total : 0,
    };
  });
}
