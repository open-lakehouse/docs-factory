// The compatibility table: one project's journeys × interfaces, with every
// control in the table itself. The caption picks the project, grouping, and
// which rows show; each column header sorts, filters, or hides its column; a
// group's header row counts its columns. /plan/compat keeps the state in the
// URL; the Model pages embed it scoped to an implementation or a path.
import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  type CompatInterface,
  type CompatJourney,
  type CompatMatrix,
  matrices,
} from "../../compat";
import { PROJECT_LABELS } from "../../doc-nav";
import { catalog } from "../../estate";
import { likec4model } from "../../explain";
import { ContentRequestKind } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { BUCKETS, type Bucket, type BucketCounts, bucketOf } from "../../lib/estate-graph";
import {
  buildTable,
  DEFAULT_STATE,
  GROUP_LABEL,
  GROUPS,
  type GroupBy,
  parseCell,
  parseState,
  SHOW_LABEL,
  SHOWS,
  type Show,
  scopedMatrices,
  stateParams,
  type TableGroup,
  type TableScope,
  type TableState,
} from "../../lib/plan/compat-table";
import { BUCKET_LABEL, implHref, JourneyRef, PathRef } from "../model/graph/primitives";
import {
  requestStatusLabel,
  TrackJourneyButton,
  useOpenContentRequests,
} from "../review/ContentRequests";
import { CellDetail, ModelCoverageGaps } from "./CompatEvidence";

const MARK: Record<Bucket, string> = {
  tested: "✓",
  draft: "✓",
  documented: "docs",
  fails: "✗",
  missing: "✗",
  blocked: "⊘",
  unknown: "—",
};

function useTableState(
  url: boolean,
  defaults: Partial<TableState>,
): [TableState, (patch: Partial<TableState>) => void] {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<TableState>({ ...DEFAULT_STATE, ...defaults });
  if (!url) return [local, (patch) => setLocal((s) => ({ ...s, ...patch }))];
  const state = parseState(params);
  return [state, (patch) => setParams(stateParams({ ...state, ...patch }), { replace: true })];
}

function groupTitle(group: GroupBy, key: string): string {
  if (group === "asset") return likec4model.findElement(key)?.title ?? key;
  if (group === "spec") {
    const [spec, since] = key.split(":");
    return [catalog.specs[spec]?.title ?? spec, since].filter(Boolean).join(" ");
  }
  return key;
}

const answered = (n: BucketCounts) => {
  const total = BUCKETS.reduce((a, b) => a + n[b], 0);
  return { done: total - n.unknown - n.documented - n.draft, tested: n.tested, total };
};

export default function CompatTable({
  scope = {},
  url = false,
  defaults = {},
}: {
  scope?: TableScope;
  /** Keep the state in the query string (the /plan/compat page). */
  url?: boolean;
  defaults?: Partial<TableState>;
}) {
  const [state, set] = useTableState(url, defaults);
  const projects = scopedMatrices(matrices, scope);
  const matrix = projects.find((m) => m.project === state.project) ?? projects[0];
  const model = matrix ? buildTable(matrix, state, scope, groupTitle) : null;
  if (!matrix || !model) return <p className="review-empty">No compatibility matrix yet.</p>;
  const selected = parseCell(state.cell);
  const scoped = Boolean(scope.model || scope.path);
  const share = answered(model.totals);
  const toggleCell = (journey: string, iface: string) =>
    set({ cell: state.cell === `${journey}:${iface}` ? null : `${journey}:${iface}` });

  return (
    <div className="ctable-wrap">
      {!scoped && <ModelCoverageGaps matrix={matrix} />}
      <table className="admin-table compat-table ctable">
        <caption>
          <div className="ctable-bar">
            {projects.length > 1 && (
              <fieldset className="ctable-segment">
                <legend className="sr-only">Project</legend>
                {projects.map((m) => (
                  <button
                    key={m.project}
                    type="button"
                    aria-pressed={m.project === matrix.project}
                    className={cn(m.project === matrix.project && "is-active")}
                    onClick={() =>
                      set({ project: m.project, cell: null, sort: null, where: null, hidden: [] })
                    }
                  >
                    {PROJECT_LABELS[m.project] ?? m.project}
                  </button>
                ))}
              </fieldset>
            )}
            <input
              type="search"
              className="ctable-search"
              placeholder="Find a journey"
              aria-label="Find a journey"
              value={state.q}
              onChange={(e) => set({ q: e.target.value })}
            />
            <Picker
              label="Group"
              value={state.group}
              options={GROUPS.filter((g) => !(g === "table" && scope.model))}
              labels={GROUP_LABEL}
              onChange={(group) => set({ group })}
            />
            <Picker
              label="Rows"
              value={state.show}
              options={SHOWS}
              labels={SHOW_LABEL}
              onChange={(show: Show) => set({ show })}
            />
            <ColumnsPicker
              available={model.available}
              hidden={state.hidden}
              onChange={(hidden) => set({ hidden })}
            />
            {state.sort && (
              <ActiveChip onClear={() => set({ sort: null })}>
                {state.sort.desc ? "Gaps first" : "Proven first"} in{" "}
                {labelOf(matrix, state.sort.col)}
              </ActiveChip>
            )}
            {state.where && (
              <ActiveChip onClear={() => set({ where: null })}>
                {labelOf(matrix, state.where.col)} is {BUCKET_LABEL[state.where.bucket]}
              </ActiveChip>
            )}
            <span className="ctable-summary">
              {model.rows} journeys · {share.tested} of {share.total} cells tested ·{" "}
              {share.total ? Math.round((share.done / share.total) * 100) : 0}% answered
            </span>
          </div>
          <Legend />
        </caption>
        <thead>
          <tr>
            <th scope="col" className="ctable-journey-col">
              Journey
            </th>
            {model.columns.map((c) => (
              <th key={c.key} scope="col">
                <ColumnMenu
                  iface={c}
                  state={state}
                  onSort={(desc) => set({ sort: desc === null ? null : { col: c.key, desc } })}
                  onWhere={(bucket) => set({ where: bucket ? { col: c.key, bucket } : null })}
                  onHide={() => set({ hidden: [...state.hidden, c.key] })}
                />
              </th>
            ))}
          </tr>
        </thead>
        {model.groups.map((g) => (
          <GroupBody
            key={g.key}
            group={g}
            matrix={matrix}
            columns={model.columns}
            showPath={state.group !== "path" && !scope.path}
            trackable={!scoped && state.group === "table"}
            selected={selected}
            onCell={toggleCell}
          />
        ))}
      </table>
      {model.rows === 0 && <p className="muted text-sm">No journey matches.</p>}
    </div>
  );
}

const labelOf = (m: CompatMatrix, key: string) =>
  m.interfaces.find((i) => i.key === key)?.label ?? key;

function Picker<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ctable-picker">
        <span className="muted">{label}</span> {labels[value]}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o} value={o}>
              {labels[o]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnsPicker({
  available,
  hidden,
  onChange,
}: {
  available: CompatInterface[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ctable-picker">
        <span className="muted">Columns</span> {available.length - hidden.length}/{available.length}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {available.map((i) => (
          <DropdownMenuCheckboxItem
            key={i.key}
            checked={!hidden.includes(i.key)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(on ? hidden.filter((k) => k !== i.key) : [...hidden, i.key])
            }
          >
            {i.label} {i.version && <span className="muted text-xs">{i.version}</span>}
          </DropdownMenuCheckboxItem>
        ))}
        {hidden.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Show every column</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActiveChip({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="ctable-chip">
      {children}
      <button type="button" aria-label="Clear" onClick={onClear}>
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

function ColumnMenu({
  iface,
  state,
  onSort,
  onWhere,
  onHide,
}: {
  iface: CompatInterface;
  state: TableState;
  onSort: (desc: boolean | null) => void;
  onWhere: (bucket: Bucket | null) => void;
  onHide: () => void;
}) {
  const navigate = useNavigate();
  const sorted = state.sort?.col === iface.key ? state.sort : null;
  const where = state.where?.col === iface.key ? state.where.bucket : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("ctable-col", (sorted || where) && "is-active")}>
        <span>
          {iface.label}
          {sorted && (sorted.desc ? " ↓" : " ↑")}
        </span>
        {iface.version && <span className="compat-version">{iface.version}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Sort rows</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSort(false)}>Proven first</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSort(true)}>Gaps first</DropdownMenuItem>
        {sorted && <DropdownMenuItem onSelect={() => onSort(null)}>Clear sort</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Only rows where it is</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={where ?? "any"}
          onValueChange={(v) => onWhere(v === "any" ? null : (v as Bucket))}
        >
          <DropdownMenuRadioItem value="any">anything</DropdownMenuRadioItem>
          {BUCKETS.map((b) => (
            <DropdownMenuRadioItem key={b} value={b}>
              <span className={`compat-${b}`}>{MARK[b]}</span> {BUCKET_LABEL[b]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onHide}>Hide column</DropdownMenuItem>
        {iface.model && (
          <DropdownMenuItem onSelect={() => navigate(implHref(iface.model ?? ""))}>
            Open {likec4model.findElement(iface.model)?.title ?? iface.model}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Legend() {
  const shown: Bucket[] = ["tested", "draft", "documented", "fails", "blocked", "unknown"];
  return (
    <ul className="compat-legend" aria-label="Legend">
      {shown.map((b) => (
        <li key={b}>
          <span
            className={cn("compat-cell", `compat-${b}`, b === "draft" && "is-draft")}
            aria-hidden="true"
          >
            {MARK[b]}
          </span>
          {b === "fails" ? "fails or missing API" : BUCKET_LABEL[b]}
        </li>
      ))}
    </ul>
  );
}

function GroupBody({
  group,
  matrix,
  columns,
  showPath,
  trackable,
  selected,
  onCell,
}: {
  group: TableGroup;
  matrix: CompatMatrix;
  columns: CompatInterface[];
  showPath: boolean;
  trackable: boolean;
  selected: { journey: string; iface: string } | null;
  onCell: (journey: string, iface: string) => void;
}) {
  const { isAllowlisted } = useAuth();
  const requested = useOpenContentRequests().filter(
    (r) =>
      r.kind === ContentRequestKind.JOURNEY &&
      r.project === matrix.project &&
      group.table &&
      r.placement === group.table,
  );
  return (
    <tbody>
      <tr className="ctable-group">
        <th scope="colgroup">
          <span className="ctable-group-title">{group.title}</span>{" "}
          <span className="plan-chip-count">{group.rows.length}</span>
          {trackable && isAllowlisted && group.table && (
            <TrackJourneyButton project={matrix.project} table={group.table} />
          )}
        </th>
        {columns.map((c) => {
          const n = group.counts.get(c.key);
          if (!n) return <td key={c.key} className="ctable-out" />;
          const { tested, total } = answered(n);
          return (
            <td key={c.key} title={`${tested} of ${total} tested`}>
              <span className="compat-col-stat">
                <span className="compat-col-bar" aria-hidden="true">
                  <span style={{ width: total ? `${(tested / total) * 100}%` : 0 }} />
                </span>
                {tested}/{total}
              </span>
            </td>
          );
        })}
      </tr>
      {group.rows.map((j) => (
        <Row
          key={j.id}
          journey={j}
          matrix={matrix}
          columns={columns}
          inGroup={group.counts}
          showPath={showPath}
          selected={selected?.journey === j.id ? selected.iface : null}
          onCell={(iface) => onCell(j.id, iface)}
        />
      ))}
      {requested.map((r) => (
        <tr key={r.id} className="ctable-request">
          <th scope="row" colSpan={columns.length + 1} title={r.bodyMd || undefined}>
            Requested: {r.title}{" "}
            <span className="muted">
              {requestStatusLabel(r.status)} by {r.requestedByLogin}
            </span>
          </th>
        </tr>
      ))}
    </tbody>
  );
}

function Row({
  journey,
  matrix,
  columns,
  inGroup,
  showPath,
  selected,
  onCell,
}: {
  journey: CompatJourney;
  matrix: CompatMatrix;
  columns: CompatInterface[];
  inGroup: Map<string, BucketCounts>;
  showPath: boolean;
  selected: string | null;
  onCell: (iface: string) => void;
}) {
  const open = columns.find((c) => c.key === selected);
  return (
    <>
      <tr>
        <th scope="row">
          <JourneyRef id={journey.id}>{journey.title}</JourneyRef>{" "}
          <code className="muted text-xs">{journey.id}</code>
          <span className="ctable-row-meta">
            {showPath && journey.path && <PathRef id={journey.path} />}
            {journey.feature && (
              <span className="muted">
                {journey.feature.name}
                {journey.feature.since && ` · ${journey.feature.since}`}
              </span>
            )}
          </span>
          <p className="muted">{journey.summary}</p>
        </th>
        {columns.map((c) => {
          if (!inGroup.has(c.key)) return <td key={c.key} className="ctable-out" />;
          const cell = journey.cells[c.key];
          const bucket = bucketOf(cell);
          return (
            <td key={c.key}>
              <button
                type="button"
                className={cn(
                  "compat-cell",
                  `compat-${bucket === "draft" ? (cell?.status ?? "unknown") : bucket}`,
                  bucket === "draft" && "is-draft",
                  selected === c.key && "is-selected",
                )}
                aria-expanded={selected === c.key}
                aria-label={`${c.label}: ${BUCKET_LABEL[bucket]}`}
                title={BUCKET_LABEL[bucket]}
                onClick={() => onCell(c.key)}
              >
                {bucket === "draft" ? MARK[cell?.status ?? "unknown"] : MARK[bucket]}
                {bucket === "draft" && <span className="compat-draft">draft</span>}
              </button>
            </td>
          );
        })}
      </tr>
      {open && (
        <tr className="compat-detail-row">
          <td colSpan={columns.length + 1}>
            <CellDetail
              iface={open}
              journey={journey}
              matrix={matrix}
              cell={
                journey.cells[open.key] ?? {
                  status: "unknown",
                  draft: false,
                  proofs: [],
                  evidence: [],
                }
              }
            />
            <Link to={implHref(open.model ?? "")} className="text-xs" hidden={!open.model}>
              Open {likec4model.findElement(open.model ?? "")?.title ?? open.model} →
            </Link>
          </td>
        </tr>
      )}
    </>
  );
}
