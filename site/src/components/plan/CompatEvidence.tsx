// A cell's proofs and evidence, as the compatibility matrix and the journey
// pages list them.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CompatEvidence, CompatProof, PageRef } from "../../compat";
import { docRef, refHref } from "../../lib/content-ref";
import { ModelRef } from "../ModelRef";

export function PageLink({
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

export function ProofItem({ proof }: { proof: CompatProof }) {
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

export function EvidenceItem({ evidence }: { evidence: CompatEvidence }) {
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
