// Which engines and clients can do which journeys, per project, from the
// committed compatibility.json artifacts. Draft pages' claims show here (marked)
// although public tables wait for `ready`.
import { type ReactNode, useState } from "react";
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
import { docRef } from "../../lib/content-ref";
import { requestStatusLabel, TrackJourneyButton, useOpenContentRequests } from "./ContentRequests";
import { useWorkspaceTabs } from "./workspace/workspace-tabs-context";

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

export default function CompatibilityMatrix() {
  const [project, setProject] = useState(matrices[0]?.project ?? "");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const matrix = matrices.find((m) => m.project === project);

  return (
    <section aria-label="Compatibility" className="compat">
      <h1>Compatibility</h1>
      <p className="muted">
        Which engines and clients can do each journey. ✓ links to the page whose CI-tested script
        does it; “docs” means the engine&apos;s own docs say so; claims from draft pages are marked.
      </p>
      <div className="compat-toolbar">
        <fieldset className="compat-projects">
          <legend className="sr-only">Project</legend>
          {matrices.map((m) => (
            <button
              key={m.project}
              type="button"
              aria-pressed={m.project === project}
              className={cn("compat-project", m.project === project && "is-active")}
              onClick={() => {
                setProject(m.project);
                setSelected(null);
              }}
            >
              {PROJECT_LABELS[m.project] ?? m.project}
            </button>
          ))}
        </fieldset>
        <span className="compat-gaps-toggle">
          <Switch id="compat-gaps" checked={gapsOnly} onCheckedChange={setGapsOnly} />
          <label htmlFor="compat-gaps">Gaps only</label>
        </span>
      </div>
      {matrix ? (
        <MatrixTables
          matrix={matrix}
          gapsOnly={gapsOnly}
          selected={selected}
          onSelect={setSelected}
        />
      ) : (
        <p className="review-empty">No compatibility matrix yet.</p>
      )}
    </section>
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
                    return (
                      <th key={key} scope="col">
                        {iface?.label ?? key}
                        {iface?.version && <span className="compat-version">{iface.version}</span>}
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
  const { openTab } = useWorkspaceTabs();
  return (
    <button
      type="button"
      className="compat-link"
      onClick={() =>
        openTab(docRef(page.project, page.bucket, page.slug), { anchor: anchor ?? undefined })
      }
    >
      {children}
    </button>
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
