// Display labels for dataset dimension values (ids in the URL, words on screen).
import type { CompatRow } from "../../../compat";
import { COMPAT_DIMENSIONS } from "../../../content-core/compat-dataset.mjs";
import type { CellBucket } from "../../../content-core/coverage.mjs";
import { PROJECT_LABELS } from "../../../doc-nav";
import { type Dim, NONE } from "../../../lib/plan/compat-view";
import { STATUS_LABEL, sinceLabel } from "./CellDetail";

export const BUCKET_LABEL: Record<CellBucket, string> = {
  proven: "Proven",
  draft: "Draft only",
  documented: "Documented upstream",
  no: "Fails or missing",
  unknown: "Unknown",
};

export const DIM_LABEL = new Map<string, string>(COMPAT_DIMENSIONS.map((d) => [d.id, d.label]));

export const GROUPABLE = COMPAT_DIMENSIONS.filter((d) => d.groupable).map((d) => d.id as Dim);

/** The dimensions the filter menu offers, in menu order. */
export const FILTERABLE: Dim[] = [
  "bucket",
  "status",
  "interface",
  "engine",
  "family",
  "asset",
  "tables",
  "featureKey",
  "featureName",
  "testedVersion",
  "draft",
];

/** `project` picks a project-scoped value's label (see PROJECT_SCOPED). */
export type ValueLabels = (dim: Dim, value: string, project?: string | null) => string;

/** Labels resolved from the rows themselves: interface labels, engine and table titles. */
export function valueLabels(rows: CompatRow[]): ValueLabels {
  const byDim = new Map<string, Map<string, string>>();
  const put = (dim: string, value: string, label: string, project: string) => {
    let m = byDim.get(dim);
    if (!m) {
      m = new Map();
      byDim.set(dim, m);
    }
    m.set(value, label);
    m.set(`${project}/${value}`, label);
  };
  const seen = new Set<object>();
  for (const row of rows) {
    const { iface, matrix } = row.source;
    put(
      "interface",
      row.interface,
      [iface.label, iface.version].filter(Boolean).join(" "),
      row.project,
    );
    if (row.engine && row.engineTitle) put("engine", row.engine, row.engineTitle, row.project);
    if (row.featureKey && row.featureSpec)
      put(
        "featureKey",
        row.featureKey,
        sinceLabel({ spec: row.featureSpec, since: row.featureSince }),
        row.project,
      );
    if (!seen.has(matrix)) {
      seen.add(matrix);
      for (const t of matrix.tables) put("tables", t.id, t.title, matrix.project);
      for (const g of matrix.assets) put("asset", g.id, g.title, matrix.project);
    }
  }
  return (dim, value, project) => {
    if (value === NONE) return "—";
    if (dim === "project") return PROJECT_LABELS[value] ?? value;
    if (dim === "bucket") return BUCKET_LABEL[value as CellBucket] ?? value;
    if (dim === "status") return STATUS_LABEL[value as CompatRow["status"]] ?? value;
    if (dim === "draft") return value === "true" ? "Draft only" : "Ready";
    const m = byDim.get(dim);
    return (project && m?.get(`${project}/${value}`)) || m?.get(value) || value;
  };
}
