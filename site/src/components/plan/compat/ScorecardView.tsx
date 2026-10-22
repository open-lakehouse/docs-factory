// Bucket counts per value of one dimension (interface by default): how far
// each engine, interface, or spec version is proven. A row opens its cells.
import { type ColumnDef, functionalUpdate, type Updater, useTable } from "@tanstack/react-table";
import type { CellBucket } from "../../../content-core/coverage.mjs";
import { type ScoreRow, scopesByProject, scorecard, withView } from "../../../lib/plan/compat-view";
import type { ViewProps } from "./CompatExplorer";
import { BUCKET_LABEL, DIM_LABEL } from "./labels";
import { SortHeader } from "./SortHeader";
import { ariaSort, type SortingState, sortingFeatures } from "./table";

type ScoreColumn = ColumnDef<typeof sortingFeatures, ScoreRow, unknown>;

const COUNTED: CellBucket[] = ["proven", "no", "documented", "draft", "unknown"];

export function ScorecardView({ state, rows, labels, set }: ViewProps) {
  const dim = state.group ?? "interface";
  const byProject = scopesByProject(state, dim);
  const data = scorecard(rows, dim, byProject);
  const label = (r: ScoreRow) => {
    const text = labels(dim, r.value, r.project);
    return r.project ? `${labels("project", r.project)} · ${text}` : text;
  };
  const columns: ScoreColumn[] = [
    {
      id: "value",
      header: DIM_LABEL.get(dim) ?? dim,
      accessorFn: label,
      cell: ({ row }) => (
        <button
          type="button"
          className="compat-link"
          title="Show these cells"
          onClick={() =>
            set({
              ...withView(state, "cells"),
              project: row.original.project ?? state.project,
              filters: { ...state.filters, [dim]: [row.original.value] },
            })
          }
        >
          {label(row.original)}
        </button>
      ),
    },
    {
      id: "answered",
      header: "Answered",
      accessorFn: (r) => r.answered,
      sortDescFirst: true,
      cell: ({ row }) => {
        const { counts, total, answered } = row.original;
        return (
          <span
            className="compat-col-stat"
            title={`${counts.proven + counts.no} of ${total} answered by a ready page`}
          >
            <span className="compat-col-bar compat-score-bar" aria-hidden="true">
              <span style={{ width: `${(counts.proven / total) * 100}%` }} />
              <span
                className="is-no"
                style={{
                  left: `${(counts.proven / total) * 100}%`,
                  width: `${(counts.no / total) * 100}%`,
                }}
              />
            </span>
            {Math.round(answered * 100)}%
          </span>
        );
      },
    },
    ...COUNTED.map(
      (b): ScoreColumn => ({
        id: b,
        header: BUCKET_LABEL[b],
        accessorFn: (r) => r.counts[b],
        sortDescFirst: true,
        cell: ({ getValue }) => getValue<number>() || <span className="muted">·</span>,
      }),
    ),
    { id: "total", header: "Cells", accessorKey: "total", sortDescFirst: true },
  ];
  const sorting: SortingState = state.sort.length ? state.sort : [{ id: "answered", desc: true }];
  const table = useTable({
    features: sortingFeatures,
    data,
    columns,
    getRowId: (r) => r.id,
    state: { sorting },
    onSortingChange: (u: Updater<SortingState>) =>
      set({ ...state, sort: functionalUpdate(u, sorting), preset: null }),
  });
  return (
    <table className="admin-table compat-table compat-scorecard mt-6">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th key={h.id} scope="col" aria-sort={ariaSort(h.column.getIsSorted())}>
                <SortHeader column={h.column}>
                  <table.FlexRender header={h} />
                </SortHeader>
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getAllCells().map((c) => (
              <td key={c.id}>
                <table.FlexRender cell={c} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
