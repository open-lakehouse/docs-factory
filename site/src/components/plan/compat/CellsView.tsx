// The dataset as it is: a row per journey × interface, sortable on any column
// and grouped by any groupable dimension.
import {
  type ColumnDef,
  type ColumnVisibilityState,
  type ExpandedState,
  functionalUpdate,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type CompatRow, cellOf } from "../../../compat";
import {
  bucketRank,
  countRows,
  type Dim,
  PROJECT_SCOPED,
  valuesOf,
} from "../../../lib/plan/compat-view";
import { CellDetail, CellMark } from "./CellDetail";
import type { ViewProps } from "./CompatExplorer";
import { BUCKET_LABEL, type ValueLabels } from "./labels";
import { SortHeader } from "./SortHeader";
import { ariaSort, cellsFeatures, type SortingState } from "./table";

type CellColumn = ColumnDef<typeof cellsFeatures, CompatRow, unknown>;

/**
 * Grouped and sorted by the first value; `tables` lists them all. A
 * project-scoped value groups as `<project>/<value>`, so two projects' `spark`
 * interfaces stay apart.
 */
function dimColumn(id: Dim, header: string, labels: ValueLabels): CellColumn {
  const scoped = PROJECT_SCOPED.has(id);
  return {
    id,
    header,
    accessorFn: (r) => labels(id, valuesOf(r, id)[0], r.project),
    getGroupingValue: (r) => (scoped ? `${r.project}/${valuesOf(r, id)[0]}` : valuesOf(r, id)[0]),
    cell: ({ row }) =>
      valuesOf(row.original, id)
        .map((v) => labels(id, v, row.original.project))
        .join(", "),
  };
}

function columnsFor(
  labels: ValueLabels,
  selected: string | null,
  onSelect: (id: string) => void,
): CellColumn[] {
  return [
    dimColumn("project", "Project", labels),
    {
      id: "journey",
      header: "Journey",
      accessorFn: (r) => r.journeyTitle,
      cell: ({ row }) => (
        <>
          {row.original.journeyTitle} <code className="muted">{row.original.journey}</code>
        </>
      ),
    },
    dimColumn("interface", "Interface", labels),
    {
      id: "bucket",
      header: "Cell",
      accessorFn: (r) => bucketRank(r.bucket),
      sortDescFirst: false,
      getGroupingValue: (r) => r.bucket,
      cell: ({ row }) => (
        <button
          type="button"
          className={cn(
            "compat-cell",
            row.original.draft && "is-draft",
            selected === row.original.id && "is-selected",
          )}
          aria-expanded={selected === row.original.id}
          aria-label={`${labels("interface", row.original.interface)}: ${labels("bucket", row.original.bucket)}`}
          onClick={() => onSelect(row.original.id)}
        >
          <CellMark cell={row.original.source.cell} />
        </button>
      ),
    },
    dimColumn("status", "Status", labels),
    dimColumn("engine", "Engine", labels),
    dimColumn("family", "Family", labels),
    dimColumn("asset", "Asset", labels),
    dimColumn("tables", "Table", labels),
    dimColumn("featureKey", "Spec version", labels),
    dimColumn("featureName", "Feature", labels),
    dimColumn("interfaceVersion", "Version", labels),
    dimColumn("testedVersion", "Tested with", labels),
    dimColumn("draft", "Draft only", labels),
    { id: "proofCount", header: "Proofs", accessorKey: "proofCount" },
    { id: "evidenceCount", header: "Evidence", accessorKey: "evidenceCount" },
    {
      id: "api",
      header: "API",
      accessorFn: (r) => r.api ?? "",
      cell: ({ getValue }) => {
        const api = getValue<string>();
        return api ? <code>{api}</code> : null;
      },
    },
  ];
}

function groupLabel(dim: Dim, value: string, labels: ValueLabels, allProjects: boolean): string {
  if (!PROJECT_SCOPED.has(dim)) return labels(dim, value);
  const i = value.indexOf("/");
  const project = value.slice(0, i);
  const label = labels(dim, value.slice(i + 1), project);
  return allProjects ? `${labels("project", project)} · ${label}` : label;
}

const HIDDEN: ColumnVisibilityState = {
  status: false,
  asset: false,
  tables: false,
  featureName: false,
  interfaceVersion: false,
  draft: false,
  evidenceCount: false,
};

export function CellsView({ state, rows, labels, set }: ViewProps) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(HIDDEN);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const columns = columnsFor(labels, state.cell, (id) =>
    set({ ...state, cell: state.cell === id ? null : id }),
  );
  const grouping = state.group ? [state.group] : [];
  const table = useTable({
    features: cellsFeatures,
    data: rows,
    columns,
    getRowId: (r) => r.id,
    state: {
      sorting: state.sort,
      grouping,
      expanded,
      columnVisibility: {
        ...visibility,
        project: state.project === "all" && visibility.project !== false,
        // The group row names the value.
        ...(state.group ? { [state.group]: false } : {}),
      },
    },
    onSortingChange: (u: Updater<SortingState>) =>
      set({ ...state, sort: functionalUpdate(u, state.sort), preset: null }),
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setVisibility,
    groupedColumnMode: false,
    // The reset fires whenever a row model recomputes, and the columns close
    // over the selected cell, so it would re-render forever.
    autoResetExpanded: false,
  });
  const visible = table.getVisibleLeafColumns().length;
  return (
    <div className="mt-6">
      <div className="compat-table-head">
        <p className="muted">
          {rows.length} cells{state.group && `, ${table.getGroupedRowModel().rows.length} groups`}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter((c) => c.id !== state.group && c.id !== "journey")
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => c.toggleVisibility(on)}
                >
                  {String(c.columnDef.header)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <table className="admin-table compat-table compat-cells">
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
          {table.getRowModel().rows.map((row) => {
            if (row.getIsGrouped()) {
              const dim = row.groupingColumnId as Dim;
              const counts = countRows(row.getLeafRows().map((r) => r.original));
              return (
                <tr key={row.id} className="compat-group-row">
                  <td colSpan={visible}>
                    <button
                      type="button"
                      className="compat-group-toggle"
                      aria-expanded={row.getIsExpanded()}
                      onClick={row.getToggleExpandedHandler()}
                    >
                      {row.getIsExpanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {groupLabel(dim, String(row.groupingValue), labels, state.project === "all")}
                      <span className="plan-chip-count">{row.getLeafRows().length}</span>
                    </button>
                    <span className="compat-group-counts muted">
                      {(Object.keys(BUCKET_LABEL) as (keyof typeof BUCKET_LABEL)[])
                        .filter((b) => counts[b] > 0)
                        .map((b) => `${counts[b]} ${BUCKET_LABEL[b].toLowerCase()}`)
                        .join(" · ")}
                    </span>
                  </td>
                </tr>
              );
            }
            const r = row.original;
            const open = state.cell === r.id;
            return (
              <Fragment key={row.id}>
                <tr className={cn(open && "is-selected")}>
                  {row.getVisibleCells().map((c) => (
                    <td key={c.id}>
                      <table.FlexRender cell={c} />
                    </td>
                  ))}
                </tr>
                {open && (
                  <tr className="compat-detail-row">
                    <td colSpan={visible}>
                      <CellDetail
                        iface={r.source.iface}
                        journey={r.source.journey}
                        matrix={r.source.matrix}
                        cell={cellOf(r.source.journey, r.interface)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
