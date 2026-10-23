// The pivot: journeys down, interfaces across, a table per project × group
// value. Grouped by table it is the docs tables, with their journey requests.
import { type ColumnDef, functionalUpdate, type Updater, useTable } from "@tanstack/react-table";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { cellOf } from "../../../compat";
import { PROJECT_LABELS } from "../../../doc-nav";
import { ContentRequestKind } from "../../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../../lib/auth-context";
import { totalCells } from "../../../lib/plan/compat-stats";
import {
  bucketRank,
  countRows,
  type MatrixJourney,
  type MatrixSection,
  matrixSections,
  NONE,
} from "../../../lib/plan/compat-view";
import {
  requestStatusLabel,
  TrackJourneyButton,
  useOpenContentRequests,
} from "../../review/ContentRequests";
import { CellDetail, STATUS_LABEL, SYMBOL, sinceLabel } from "./CellDetail";
import type { ViewProps } from "./CompatExplorer";
import { SortHeader } from "./SortHeader";
import { ariaSort, type SortingState, sortingFeatures } from "./table";

type MatrixColumn = ColumnDef<typeof sortingFeatures, MatrixJourney, unknown>;

export function MatrixView({ state, rows, labels, set }: ViewProps) {
  const { isAllowlisted } = useAuth();
  const requested = useOpenContentRequests().filter((r) => r.kind === ContentRequestKind.JOURNEY);
  const byTable = state.group === "tables";
  // Requests are placed on a docs table, and a filtered table would misplace them.
  const showRequests = byTable && !state.q && !state.gaps && !Object.keys(state.filters).length;
  const sections = matrixSections(rows, state.group, state.gaps);
  const onSort = (u: Updater<SortingState>) =>
    set({ ...state, sort: functionalUpdate(u, state.sort), cell: null });
  return (
    <>
      {sections.map((section) => {
        const title = section.table
          ? section.table.title
          : state.group
            ? labels(state.group, section.value)
            : "All journeys";
        const asked = showRequests
          ? requested.filter((r) => r.project === section.project && r.placement === section.value)
          : [];
        return (
          <div key={section.key} className="mt-6">
            <div className="compat-table-head">
              <h2 className="blog-aside-title">
                {state.project === "all" && (
                  <span className="muted">
                    {PROJECT_LABELS[section.project] ?? section.project} ·{" "}
                  </span>
                )}
                {title}
                {state.group && section.value === NONE && (
                  <span className="muted"> (no {state.group})</span>
                )}
              </h2>
              {isAllowlisted && byTable && (
                <TrackJourneyButton project={section.project} table={section.value} />
              )}
            </div>
            <SectionTable
              section={section}
              sorting={state.sort}
              onSortingChange={onSort}
              selected={state.cell}
              onSelect={(id) => set({ ...state, cell: state.cell === id ? null : id })}
            />
            {asked.length > 0 && (
              <ul className="draft-list compact">
                {asked.map((r) => (
                  <li key={r.id} title={r.bodyMd || undefined}>
                    {r.title}{" "}
                    <span className="muted">
                      {requestStatusLabel(r.status)} by {r.requestedByLogin}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function SectionTable({
  section,
  sorting,
  onSortingChange,
  selected,
  onSelect,
}: {
  section: MatrixSection;
  sorting: SortingState;
  onSortingChange: (u: Updater<SortingState>) => void;
  selected: string | null;
  onSelect: (rowId: string) => void;
}) {
  const columns: MatrixColumn[] = [
    {
      id: "journeyTitle",
      header: "Journey",
      accessorFn: (j) => j.journey.title,
      cell: ({ row }) => {
        const { journey } = row.original;
        return (
          <>
            {journey.title} <code className="muted">{journey.id}</code>
            {journey.feature && (
              <span className="compat-version" title={`${journey.feature.spec} feature`}>
                {journey.feature.name}
                {journey.feature.since && ` · ${sinceLabel(journey.feature)}`}
              </span>
            )}
            <p className="muted">{journey.summary}</p>
          </>
        );
      },
    },
    ...section.columns.map(
      (iface): MatrixColumn => ({
        id: iface.key,
        header: () => {
          const counts = countRows(section.journeys.flatMap((j) => j.cells.get(iface.key) ?? []));
          const total = totalCells(counts);
          return (
            <>
              {iface.label}
              {iface.version && <span className="compat-version">{iface.version}</span>}
              {total > 0 && (
                <span
                  className="compat-col-stat"
                  title={`${counts.proven} of ${total} proven by a ready page`}
                >
                  <span className="compat-col-bar" aria-hidden="true">
                    <span style={{ width: `${(counts.proven / total) * 100}%` }} />
                  </span>
                  {counts.proven}/{total}
                </span>
              )}
            </>
          );
        },
        accessorFn: (j) => bucketRank(j.cells.get(iface.key)?.bucket ?? "unknown"),
        // Ranks are best-first, so the first click puts proven cells on top.
        sortDescFirst: false,
        cell: ({ row }) => {
          const r = row.original.cells.get(iface.key);
          if (!r) return null;
          const status = r.status;
          return (
            <button
              type="button"
              className={cn(
                "compat-cell",
                `compat-${status}`,
                r.draft && "is-draft",
                selected === r.id && "is-selected",
              )}
              aria-expanded={selected === r.id}
              aria-label={`${iface.label}: ${STATUS_LABEL[status]}${r.draft ? " (draft)" : ""}`}
              title={STATUS_LABEL[status]}
              onClick={() => onSelect(r.id)}
            >
              {SYMBOL[status]}
              {r.draft && <span className="compat-draft">draft</span>}
            </button>
          );
        },
      }),
    ),
  ];
  const known = new Set(columns.map((c) => c.id));
  const table = useTable({
    features: sortingFeatures,
    data: section.journeys,
    columns,
    getRowId: (j) => j.key,
    // A sort on an interface another section lacks leaves this one in table order.
    state: { sorting: sorting.filter((s) => known.has(s.id)) },
    onSortingChange,
  });
  return (
    <table className="admin-table compat-table">
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
          const open = [...row.original.cells.values()].find((r) => r.id === selected);
          return (
            <Fragment key={row.id}>
              <tr>
                {row.getAllCells().map((c, i) =>
                  i === 0 ? (
                    <th key={c.id} scope="row">
                      <table.FlexRender cell={c} />
                    </th>
                  ) : (
                    <td key={c.id}>
                      <table.FlexRender cell={c} />
                    </td>
                  ),
                )}
              </tr>
              {open && (
                <tr className="compat-detail-row">
                  <td colSpan={row.getAllCells().length}>
                    <CellDetail
                      iface={open.source.iface}
                      journey={open.source.journey}
                      matrix={open.source.matrix}
                      cell={cellOf(open.source.journey, open.interface)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
