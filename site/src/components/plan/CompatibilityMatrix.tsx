// Which engines and clients can do which journeys, per project, from the
// committed compatibility.json artifacts. Draft pages' claims show here (marked)
// although public tables wait for `ready`.
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  type CellStatus,
  type CompatCell,
  type CompatEvidence,
  type CompatInterface,
  type CompatJourney,
  type CompatMatrix,
  type CompatProof,
  cellOf,
  isGap,
  matrices,
  type PageRef,
} from "../../compat";
import { PROJECT_LABELS } from "../../doc-nav";
import { ContentRequestKind } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { docRef, refHref } from "../../lib/content-ref";
import {
  answeredShare,
  columnCounts,
  type FeatureGroup,
  featureGroups,
  featureKey,
  matrixCounts,
  totalCells,
} from "../../lib/plan/compat-stats";
import { ModelRef } from "../ModelRef";
import {
  requestStatusLabel,
  TrackJourneyButton,
  useOpenContentRequests,
} from "../review/ContentRequests";

const SYMBOL: Record<CellStatus, string> = {
  tested: "✓",
  fails: "✗",
  missing: "✗",
  documented: "docs",
  unknown: "—",
};

const STATUS_LABEL: Record<CellStatus, string> = {
  tested: "Tested",
  fails: "Fails",
  missing: "Missing API",
  documented: "Documented upstream, not tested here",
  unknown: "Unknown",
};

interface Selected {
  journey: string;
  iface: string;
}

// `?cell=<journey>:<iface>`; journey ids are dotted and interface keys dashed.
function parseCell(raw: string | null): Selected | null {
  const i = raw?.lastIndexOf(":") ?? -1;
  if (!raw || i <= 0) return null;
  return { journey: raw.slice(0, i), iface: raw.slice(i + 1) };
}

export default function CompatibilityMatrix() {
  const [params, setParams] = useSearchParams();
  const matrix = matrices.find((m) => m.project === params.get("project")) ?? matrices[0];
  const gapsOnly = params.get("gaps") === "1";
  const byAsset = params.get("group") === "asset";
  const selected = parseCell(params.get("cell"));
  const groups = matrix ? featureGroups(matrix) : [];
  const since = groups.find((g) => g.key === params.get("since")) ?? null;
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  const counts = matrix ? matrixCounts(matrix) : null;

  return (
    <div className="compat">
      <div className="plan-toolbar">
        <fieldset className="plan-chips">
          <legend className="sr-only">Project</legend>
          {matrices.map((m) => (
            <button
              key={m.project}
              type="button"
              aria-pressed={m.project === matrix?.project}
              className={cn("plan-chip", m.project === matrix?.project && "is-active")}
              onClick={() => set({ project: m.project, cell: null, since: null })}
            >
              {PROJECT_LABELS[m.project] ?? m.project}
            </button>
          ))}
        </fieldset>
        <span className="compat-gaps-toggle">
          <Switch
            id="compat-by-asset"
            checked={byAsset}
            onCheckedChange={(on) => set({ group: on ? "asset" : null })}
          />
          <label htmlFor="compat-by-asset">By asset</label>
        </span>
        <span className="compat-gaps-toggle">
          <Switch
            id="compat-gaps"
            checked={gapsOnly}
            onCheckedChange={(on) => set({ gaps: on ? "1" : null })}
          />
          <label htmlFor="compat-gaps">Gaps only</label>
        </span>
      </div>
      {counts && (
        <p className="compat-summary muted">
          {Math.round(answeredShare(counts) * 100)}% of cells answered by a ready page ·{" "}
          {counts.draft} draft-only · {counts.documented} documented upstream · {counts.unknown}{" "}
          unknown
        </p>
      )}
      {groups.length > 0 && (
        <fieldset className="plan-chips">
          <legend className="sr-only">Spec version</legend>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={g.key === since?.key}
              className={cn("plan-chip", g.key === since?.key && "is-active")}
              title={`${g.journeys.size} journeys; ${Math.round(answeredShare(g.counts) * 100)}% of their cells answered by a ready page`}
              onClick={() => set({ since: g.key === since?.key ? null : g.key, cell: null })}
            >
              {sinceLabel(g)}{" "}
              <span className="muted">{Math.round(answeredShare(g.counts) * 100)}%</span>
            </button>
          ))}
        </fieldset>
      )}
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
      {matrix ? (
        <MatrixTables
          matrix={matrix}
          byAsset={byAsset}
          gapsOnly={gapsOnly}
          since={since}
          selected={selected}
          onSelect={(s) => set({ cell: s ? `${s.journey}:${s.iface}` : null })}
        />
      ) : (
        <p className="review-empty">No compatibility matrix yet.</p>
      )}
    </div>
  );
}

const SPEC_LABEL: Record<string, string> = {
  deltaSpec: "Delta",
  icebergSpec: "Iceberg",
  icebergRestSpec: "Iceberg REST",
};

function sinceLabel(g: Pick<FeatureGroup, "spec" | "since">): string {
  return [SPEC_LABEL[g.spec] ?? g.spec, g.since].filter(Boolean).join(" ");
}

function MatrixTables({
  matrix,
  byAsset,
  gapsOnly,
  since,
  selected,
  onSelect,
}: {
  matrix: CompatMatrix;
  byAsset: boolean;
  gapsOnly: boolean;
  since: FeatureGroup | null;
  selected: Selected | null;
  onSelect: (s: Selected | null) => void;
}) {
  const journeys = new Map(matrix.journeys.map((j) => [j.id, j]));
  const interfaces = new Map(matrix.interfaces.map((i) => [i.key, i]));
  const { isAllowlisted } = useAuth();
  const requested = useOpenContentRequests().filter(
    (r) => r.kind === ContentRequestKind.JOURNEY && r.project === matrix.project,
  );
  return (
    <>
      <ModelCoverageGaps matrix={matrix} />
      {(byAsset ? matrix.assets : matrix.tables).map((table) => {
        const rows = table.rows
          .map((id) => journeys.get(id))
          .filter(
            (j): j is CompatJourney =>
              !!j &&
              (!gapsOnly || isGap(j, table.columns)) &&
              (!since || featureKey(j) === since.key),
          );
        // Journey requests are placed on a table, so asset groups show none.
        const asked = byAsset || since ? [] : requested.filter((r) => r.placement === table.id);
        const columnStats = columnCounts(matrix, table);
        if (rows.length === 0 && asked.length === 0) return null;
        return (
          <div key={table.id} className="mt-6">
            <div className="compat-table-head">
              <h2 className="blog-aside-title">{table.title}</h2>
              {isAllowlisted && !byAsset && (
                <TrackJourneyButton project={matrix.project} table={table.id} />
              )}
            </div>
            <table className="admin-table compat-table">
              <thead>
                <tr>
                  <th scope="col">Journey</th>
                  {table.columns.map((key) => {
                    const iface = interfaces.get(key);
                    const stat = columnStats.get(key);
                    const total = stat ? totalCells(stat) : 0;
                    return (
                      <th key={key} scope="col">
                        {iface?.label ?? key}
                        {iface?.version && <span className="compat-version">{iface.version}</span>}
                        {stat && total > 0 && (
                          <span
                            className="compat-col-stat"
                            title={`${stat.proven} of ${total} proven by a ready page`}
                          >
                            <span className="compat-col-bar" aria-hidden="true">
                              <span style={{ width: `${(stat.proven / total) * 100}%` }} />
                            </span>
                            {stat.proven}/{total}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((journey) => (
                  <JourneyRows
                    key={journey.id}
                    journey={journey}
                    matrix={matrix}
                    columns={table.columns}
                    interfaceOf={(k) => interfaces.get(k)}
                    selected={selected?.journey === journey.id ? selected.iface : null}
                    onSelect={(iface) =>
                      onSelect(
                        selected?.journey === journey.id && selected.iface === iface
                          ? null
                          : { journey: journey.id, iface },
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
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

function JourneyRows({
  journey,
  matrix,
  columns,
  interfaceOf,
  selected,
  onSelect,
}: {
  journey: CompatJourney;
  matrix: CompatMatrix;
  columns: string[];
  interfaceOf: (iface: string) => CompatInterface | undefined;
  selected: string | null;
  onSelect: (iface: string) => void;
}) {
  return (
    <>
      <tr>
        <th scope="row">
          {journey.title} <code className="muted">{journey.id}</code>
          {journey.feature && (
            <span className="compat-version" title={`${journey.feature.spec} feature`}>
              {journey.feature.name}
              {journey.feature.since && ` · ${sinceLabel(journey.feature)}`}
            </span>
          )}
          <p className="muted">{journey.summary}</p>
        </th>
        {columns.map((iface) => {
          const cell = cellOf(journey, iface);
          return (
            <td key={iface}>
              <button
                type="button"
                className={cn(
                  "compat-cell",
                  `compat-${cell.status}`,
                  cell.draft && "is-draft",
                  selected === iface && "is-selected",
                )}
                aria-expanded={selected === iface}
                aria-label={`${interfaceOf(iface)?.label ?? iface}: ${STATUS_LABEL[cell.status]}${cell.draft ? " (draft)" : ""}`}
                title={STATUS_LABEL[cell.status]}
                onClick={() => onSelect(iface)}
              >
                {SYMBOL[cell.status]}
                {cell.draft && <span className="compat-draft">draft</span>}
              </button>
            </td>
          );
        })}
      </tr>
      {selected && (
        <tr className="compat-detail-row">
          <td colSpan={columns.length + 1}>
            <CellDetail
              iface={interfaceOf(selected)}
              journey={journey}
              matrix={matrix}
              cell={cellOf(journey, selected)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ModelCoverageGaps({ matrix }: { matrix: CompatMatrix }) {
  const actionable = matrix.diagnostics.filter((d) =>
    ["unmodeled", "missing-edge", "missing-asset-edge", "unverified-asset-edge"].includes(d.kind),
  );
  if (actionable.length === 0) return null;
  return (
    <aside className="compat-model-gaps">
      <h2 className="blog-aside-title">Model coverage</h2>
      <ul className="draft-list compact">
        {actionable.map((gap) => (
          <li
            key={`${gap.kind}:${gap.interface ?? ""}:${gap.source ?? ""}:${gap.target ?? ""}:${gap.asset ?? ""}:${gap.journeys?.join(",") ?? ""}`}
          >
            {gap.kind === "unmodeled" && (
              <>
                <code>{gap.interface}</code> has ready evidence but no model element.
              </>
            )}
            {gap.kind === "missing-edge" && (
              <>
                <code>{gap.interface}</code> proves {gap.journeys?.join(", ")} but{" "}
                {gap.source && <ModelRef id={gap.source} />} has no{" "}
                <code>{gap.edge ?? "contract"}</code> edge to{" "}
                {gap.target && <ModelRef id={gap.target} />}.
              </>
            )}
            {gap.kind === "missing-asset-edge" && (
              <>
                <code>{gap.interface}</code> proves {gap.journeys?.join(", ")} but{" "}
                {gap.source && <ModelRef id={gap.source} />} has no <code>operatesOn</code> edge to{" "}
                {gap.asset && <ModelRef id={gap.asset} />}.
              </>
            )}
            {gap.kind === "unverified-asset-edge" && (
              <>
                {gap.source && <ModelRef id={gap.source} />} is modeled to operate on{" "}
                {gap.asset && <ModelRef id={gap.asset} />}, but no ready journey verifies it.
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function JourneyModelContext({
  journey,
  iface,
  matrix,
  cell,
}: {
  journey: CompatJourney;
  iface: CompatInterface | undefined;
  matrix: CompatMatrix;
  cell: CompatCell;
}) {
  const modelId = iface?.model;
  const verified = Boolean(
    modelId &&
      journey.asset &&
      matrix.verifiedEdges.some(
        (edge) =>
          edge.kind === "operatesOn" &&
          edge.source === modelId &&
          edge.target === journey.asset &&
          edge.interfaces.includes(iface.key),
      ),
  );
  const missing = matrix.diagnostics.some(
    (gap) =>
      gap.kind === "missing-asset-edge" &&
      gap.interface === iface?.key &&
      gap.asset === journey.asset,
  );
  const modeledUnverified = matrix.diagnostics.some(
    (gap) =>
      gap.kind === "unverified-asset-edge" && gap.source === modelId && gap.asset === journey.asset,
  );
  const modelState = missing
    ? "missing operatesOn edge"
    : verified
      ? "modeled and verified by a ready journey"
      : cell.draft && (modeledUnverified || modelId)
        ? "modeled; evidence is draft-only"
        : modeledUnverified
          ? "modeled; no ready journey verifies it"
          : modelId
            ? "not modeled for this asset"
            : "interface has no model element";
  return (
    <div className="compat-model-context">
      <p>
        Asset: {journey.asset ? <ModelRef id={journey.asset} /> : "not declared"} · Model:{" "}
        {modelState}
      </p>
      {Object.entries(journey.requires).length > 0 && (
        <ul className="compat-requirements">
          {Object.entries(journey.requires).flatMap(([role, edges]) =>
            Object.entries(edges).map(([edge, ids]) => (
              <li key={`${role}:${edge}`}>
                <strong>{role}</strong> {edge}{" "}
                {ids.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ", "}
                    <ModelRef id={id} />
                  </span>
                ))}
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}

function CellDetail({
  iface,
  journey,
  matrix,
  cell,
}: {
  iface: CompatInterface | undefined;
  journey: CompatJourney;
  matrix: CompatMatrix;
  cell: CompatCell;
}) {
  const label = iface?.label ?? "Unknown interface";
  return (
    <div className="compat-detail">
      <p>
        <strong>{label}</strong>: {STATUS_LABEL[cell.status]}
        {cell.draft && " (only a draft page proves it)"}
      </p>
      <JourneyModelContext journey={journey} iface={iface} matrix={matrix} cell={cell} />
      {cell.proofs.length === 0 && cell.evidence.length === 0 && (
        <p className="muted">No script or evidence covers this cell yet.</p>
      )}
      {cell.proofs.length > 0 && (
        <ul className="compat-detail-list">
          {cell.proofs.map((p) => (
            <ProofItem key={`${p.script}:${p.anchor}`} proof={p} />
          ))}
        </ul>
      )}
      {cell.evidence.length > 0 && (
        <ul className="compat-detail-list">
          {cell.evidence.map((e) => (
            <EvidenceItem key={`${e.source}:${e.why}`} evidence={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PageLink({
  page,
  anchor,
  children,
}: {
  page: PageRef;
  anchor: string | null;
  children: ReactNode;
}) {
  return (
    <Link
      className="compat-link"
      to={refHref(docRef(page.project, page.bucket, page.slug), anchor ?? undefined)}
    >
      {children}
    </Link>
  );
}

function ProofItem({ proof }: { proof: CompatProof }) {
  return (
    <li>
      <span className={proof.works ? "compat-tested" : "compat-fails"}>
        {proof.works ? "works" : "fails"}
      </span>{" "}
      <PageLink page={proof.page} anchor={proof.anchor}>
        {proof.page.project}/{proof.page.bucket}/{proof.page.slug}
        {proof.anchor && `#${proof.anchor}`}
      </PageLink>
      {!proof.ready && <span className="compat-draft">draft</span>}
      <div className="muted">
        <code>{proof.script}</code>
        {proof.version && ` · ${proof.version}`}
      </div>
      {proof.api && (
        <div>
          API: <code>{proof.api}</code>
        </div>
      )}
      {proof.fails && (
        <div>
          Asserts: <code>{proof.fails}</code>
        </div>
      )}
      {proof.note && <div className="muted">{proof.note}</div>}
    </li>
  );
}

function EvidenceItem({ evidence }: { evidence: CompatEvidence }) {
  return (
    <li>
      <span className={`compat-${evidence.outcome === "works" ? "documented" : "fails"}`}>
        {evidence.outcome}
      </span>{" "}
      {evidence.implementation && (
        <>
          blocked by <ModelRef id={evidence.implementation} />:{" "}
        </>
      )}
      {evidence.why}
      <div className="muted">
        {evidence.page ? (
          <PageLink page={evidence.page} anchor={evidence.source.split("#")[1] ?? null}>
            {evidence.source}
          </PageLink>
        ) : (
          <a href={evidence.source} target="_blank" rel="noreferrer">
            {evidence.source}
          </a>
        )}
        {evidence.verified && ` · verified with ${evidence.verified}`}
      </div>
      {evidence.api && (
        <div>
          API: <code>{evidence.api}</code>
        </div>
      )}
      {evidence.note && <div className="muted">{evidence.note}</div>}
    </li>
  );
}
