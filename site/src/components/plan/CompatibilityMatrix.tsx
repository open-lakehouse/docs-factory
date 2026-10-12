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
import { answeredShare, columnCounts, matrixCounts, totalCells } from "../../lib/plan/compat-stats";
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
  const selected = parseCell(params.get("cell"));
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
              onClick={() => set({ project: m.project, cell: null })}
            >
              {PROJECT_LABELS[m.project] ?? m.project}
            </button>
          ))}
        </fieldset>
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
          gapsOnly={gapsOnly}
          selected={selected}
          onSelect={(s) => set({ cell: s ? `${s.journey}:${s.iface}` : null })}
        />
      ) : (
        <p className="review-empty">No compatibility matrix yet.</p>
      )}
    </div>
  );
}

function MatrixTables({
  matrix,
  gapsOnly,
  selected,
  onSelect,
}: {
  matrix: CompatMatrix;
  gapsOnly: boolean;
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
      {matrix.tables.map((table) => {
        const rows = table.rows
          .map((id) => journeys.get(id))
          .filter((j): j is CompatJourney => !!j && (!gapsOnly || isGap(j, table.columns)));
        const asked = requested.filter((r) => r.placement === table.id);
        const columnStats = columnCounts(matrix, table);
        if (rows.length === 0 && asked.length === 0) return null;
        return (
          <div key={table.id} className="mt-6">
            <div className="compat-table-head">
              <h2 className="blog-aside-title">{table.title}</h2>
              {isAllowlisted && <TrackJourneyButton project={matrix.project} table={table.id} />}
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
                    columns={table.columns}
                    label={(k) => interfaces.get(k)?.label ?? k}
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
  columns,
  label,
  selected,
  onSelect,
}: {
  journey: CompatJourney;
  columns: string[];
  label: (iface: string) => string;
  selected: string | null;
  onSelect: (iface: string) => void;
}) {
  return (
    <>
      <tr>
        <th scope="row">
          {journey.title} <code className="muted">{journey.id}</code>
          {journey.summary && <p className="muted">{journey.summary}</p>}
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
                aria-label={`${label(iface)}: ${STATUS_LABEL[cell.status]}${cell.draft ? " (draft)" : ""}`}
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
            <CellDetail iface={label(selected)} cell={cellOf(journey, selected)} />
          </td>
        </tr>
      )}
    </>
  );
}

function CellDetail({ iface, cell }: { iface: string; cell: CompatCell }) {
  return (
    <div className="compat-detail">
      <p>
        <strong>{iface}</strong>: {STATUS_LABEL[cell.status]}
        {cell.draft && " (only a draft page proves it)"}
      </p>
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
