// The compatibility dataset (compatRows) explored three ways: the pivot matrix,
// the flat cell table, and a scorecard. All state lives in the URL, so a view
// is a link; PRESETS name the ones worth a click.
import { Filter, X } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type CellStatus, compatRows, matrices } from "../../../compat";
import { COMPAT_DIMENSIONS } from "../../../content-core/compat-dataset.mjs";
import { BUCKETS } from "../../../content-core/coverage.mjs";
import { PROJECT_LABELS } from "../../../doc-nav";
import { answeredShare } from "../../../lib/plan/compat-stats";
import {
  applyPreset,
  countRows,
  type Dim,
  type ExplorerState,
  type ExplorerView,
  facet,
  filterRows,
  PRESETS,
  parseState,
  stateParams,
  toggleFilter,
  VIEWS,
  withView,
} from "../../../lib/plan/compat-view";
import { STATUS_LABEL, SYMBOL } from "./CellDetail";
import { CellsView } from "./CellsView";
import { BUCKET_LABEL, DIM_LABEL, FILTERABLE, GROUPABLE, valueLabels } from "./labels";
import { MatrixView } from "./MatrixView";
import { ModelCoverageGaps } from "./ModelCoverageGaps";
import { ScorecardView } from "./ScorecardView";

const PROJECTS = matrices.map((m) => m.project);
const DIMS = COMPAT_DIMENSIONS.map((d) => d.id as string);
const VIEW_LABEL: Record<ExplorerView, string> = {
  matrix: "Matrix",
  cells: "Cells",
  scorecard: "Scorecard",
};

export interface ViewProps {
  state: ExplorerState;
  rows: typeof compatRows;
  labels: ReturnType<typeof valueLabels>;
  set: (next: ExplorerState) => void;
}

export default function CompatExplorer() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const state = useMemo(() => parseState(new URLSearchParams(search), PROJECTS, DIMS), [search]);
  const set = (next: ExplorerState) => setParams(stateParams(next), { replace: true });
  const labels = useMemo(() => valueLabels(compatRows), []);
  const rows = useMemo(() => filterRows(compatRows, state), [state]);
  const counts = countRows(rows);
  const matrix = matrices.find((m) => m.project === state.project);
  const bucketFacet = new Map(
    facet(filterRows(compatRows, state, "bucket"), "bucket").map((f) => [f.value, f.count]),
  );
  const preset = PRESETS.find((p) => p.id === state.preset);
  const viewProps: ViewProps = { state, rows, labels, set };

  if (matrices.length === 0) return <p className="review-empty">No compatibility matrix yet.</p>;

  return (
    <div className="compat">
      <div className="plan-toolbar">
        <fieldset className="plan-chips">
          <legend className="sr-only">Project</legend>
          {[...PROJECTS, "all"].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === state.project}
              className={cn("plan-chip", p === state.project && "is-active")}
              onClick={() => set({ ...state, project: p, cell: null })}
            >
              {p === "all" ? "All projects" : (PROJECT_LABELS[p] ?? p)}
            </button>
          ))}
        </fieldset>
        <fieldset className="plan-chips">
          <legend className="sr-only">View</legend>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === state.view}
              className={cn("plan-chip", v === state.view && "is-active")}
              onClick={() => v !== state.view && set(withView(state, v))}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="compat-explorer-controls">
        <Select
          value={preset?.id ?? ""}
          onValueChange={(id) => {
            const p = PRESETS.find((x) => x.id === id);
            if (p) set(applyPreset(state, p));
          }}
        >
          <SelectTrigger size="sm" aria-label="Saved view">
            <SelectValue placeholder="Saved views" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.group ?? "none"}
          onValueChange={(g) =>
            set({
              ...state,
              group: g === "none" ? null : (g as Dim),
              preset: null,
              cell: null,
            })
          }
        >
          <SelectTrigger size="sm" aria-label={state.view === "scorecard" ? "Rows" : "Group by"}>
            <span className="muted">{state.view === "scorecard" ? "Rows:" : "Group:"}</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {state.view !== "scorecard" && <SelectItem value="none">None</SelectItem>}
            {GROUPABLE.map((d) => (
              <SelectItem key={d} value={d}>
                {DIM_LABEL.get(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterMenu state={state} set={set} labels={labels} />
        <Input
          type="search"
          className="compat-search"
          placeholder="Search journeys, interfaces, APIs…"
          value={state.q}
          onChange={(e) => set({ ...state, q: e.target.value, preset: null, cell: null })}
        />
        <span className="compat-gaps-toggle">
          <Switch
            id="compat-gaps"
            checked={state.gaps}
            onCheckedChange={(on) => set({ ...state, gaps: on, preset: null })}
          />
          <label htmlFor="compat-gaps">Gaps only</label>
        </span>
      </div>
      <fieldset className="plan-chips compat-bucket-chips">
        <legend className="sr-only">Bucket</legend>
        {BUCKETS.map((b) => {
          const active = state.filters.bucket?.includes(b) ?? false;
          return (
            <button
              key={b}
              type="button"
              aria-pressed={active}
              className={cn("plan-chip", active && "is-active")}
              onClick={() => set(toggleFilter(state, "bucket", b))}
            >
              {BUCKET_LABEL[b]}
              <span className="plan-chip-count">{bucketFacet.get(b) ?? 0}</span>
            </button>
          );
        })}
      </fieldset>
      <ActiveFilters state={state} set={set} labels={labels} />
      <p className="compat-summary muted">
        {rows.length} cells · {Math.round(answeredShare(counts) * 100)}% answered by a ready page ·{" "}
        {counts.draft} draft-only · {counts.documented} documented upstream · {counts.unknown}{" "}
        unknown
      </p>
      <Legend />
      {state.view === "matrix" && matrix && <ModelCoverageGaps matrix={matrix} />}
      {rows.length === 0 ? (
        <p className="review-empty">No cells match.</p>
      ) : state.view === "matrix" ? (
        <MatrixView {...viewProps} />
      ) : state.view === "cells" ? (
        <CellsView {...viewProps} />
      ) : (
        <ScorecardView {...viewProps} />
      )}
    </div>
  );
}

function FilterMenu({ state, set, labels }: Omit<ViewProps, "rows">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter /> Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FILTERABLE.map((dim) => {
          const values = facet(filterRows(compatRows, state, dim), dim);
          const chosen = state.filters[dim] ?? [];
          return (
            <DropdownMenuSub key={dim}>
              <DropdownMenuSubTrigger>
                {DIM_LABEL.get(dim) ?? dim}
                {chosen.length > 0 && <span className="plan-chip-count">{chosen.length}</span>}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="compat-filter-values">
                {values.map(({ value, count }) => (
                  <DropdownMenuCheckboxItem
                    key={value}
                    checked={chosen.includes(value)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => set(toggleFilter(state, dim, value))}
                  >
                    {labels(dim, value)}
                    <span className="plan-chip-count">{count}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActiveFilters({ state, set, labels }: Omit<ViewProps, "rows">) {
  const pills = (Object.entries(state.filters) as [Dim, string[]][])
    .filter(([dim]) => dim !== "bucket")
    .flatMap(([dim, values]) => values.map((value) => ({ dim, value })));
  if (pills.length === 0) return null;
  return (
    <ul className="compat-active-filters" aria-label="Active filters">
      {pills.map(({ dim, value }) => (
        <li key={`${dim}:${value}`}>
          <span className="muted">{DIM_LABEL.get(dim)}:</span> {labels(dim, value)}
          <button
            type="button"
            aria-label={`Remove ${DIM_LABEL.get(dim)} ${labels(dim, value)}`}
            onClick={() => set(toggleFilter(state, dim, value))}
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Legend() {
  return (
    <ul className="compat-legend" aria-label="Legend">
      {(Object.keys(SYMBOL) as CellStatus[])
        .filter((s) => s !== "missing")
        .map((s) => (
          <li key={s}>
            <span className={cn("compat-cell", `compat-${s}`)} aria-hidden="true">
              {SYMBOL[s]}
            </span>
            {s === "fails" ? "Fails or missing API" : STATUS_LABEL[s]}
          </li>
        ))}
      <li>
        <span className="compat-cell is-draft" aria-hidden="true">
          ✓<span className="compat-draft">draft</span>
        </span>
        Only a draft page proves it
      </li>
    </ul>
  );
}
