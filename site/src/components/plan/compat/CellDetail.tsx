// What one compatibility cell rests on: its status, the model context, and the
// scripts and evidence behind it.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  CellStatus,
  CompatCell,
  CompatEvidence,
  CompatInterface,
  CompatJourney,
  CompatMatrix,
  CompatProof,
  PageRef,
} from "../../../compat";
import { docRef, refHref } from "../../../lib/content-ref";
import type { FeatureGroup } from "../../../lib/plan/compat-stats";
import { ModelRef } from "../../ModelRef";

export const SYMBOL: Record<CellStatus, string> = {
  tested: "✓",
  fails: "✗",
  missing: "✗",
  documented: "docs",
  unknown: "—",
};

export const STATUS_LABEL: Record<CellStatus, string> = {
  tested: "Tested",
  fails: "Fails",
  missing: "Missing API",
  documented: "Documented upstream, not tested here",
  unknown: "Unknown",
};

const SPEC_LABEL: Record<string, string> = {
  deltaSpec: "Delta",
  icebergSpec: "Iceberg",
  icebergRestSpec: "Iceberg REST",
};

export function sinceLabel(g: Pick<FeatureGroup, "spec" | "since">): string {
  return [SPEC_LABEL[g.spec] ?? g.spec, g.since].filter(Boolean).join(" ");
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

export function CellDetail({
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

/** A cell's symbol, tinted by status, with the draft mark. */
export function CellMark({ cell }: { cell: CompatCell | null }) {
  const status = cell?.status ?? "unknown";
  return (
    <>
      <span className={`compat-${status}`}>{SYMBOL[status]}</span>
      {cell?.draft && <span className="compat-draft">draft</span>}
    </>
  );
}
