import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { matrices } from "../../compat";
import {
  BucketMark,
  ElementRef,
  GraphSection,
  PathRef,
  specHref,
} from "../../components/model/graph/primitives";
import RoleDiagram from "../../components/model/graph/RoleDiagram";
import { EvidenceItem, ProofItem } from "../../components/plan/CompatEvidence";
import { catalog } from "../../estate";
import { bucketOf, journeyCells } from "../../lib/estate-graph";
import { PlanPage } from "../plan/PlanLayout";

export default function JourneyPage() {
  const { id = "" } = useParams();
  const resolved = catalog.journeys[id]
    ? id
    : (Object.entries(catalog.journeys).find(([, j]) => j.aliases.includes(id))?.[0] ?? id);
  const journey = catalog.journeys[resolved];
  const [open, setOpen] = useState<string | null>(null);
  if (!journey) {
    return (
      <PlanPage title="No such journey">
        <p className="muted">
          <code>{id}</code> isn&apos;t a journey in <code>architecture/journeys/</code>.
        </p>
      </PlanPage>
    );
  }
  const projects = journeyCells(resolved, matrices);
  const facts = catalog.facts.filter((f) => f.blocks.some((b) => b.journeys.includes(resolved)));
  return (
    <PlanPage
      title={journey.title}
      intro={journey.summary}
      actions={
        <Link
          to={`/plan/compat?${new URLSearchParams({ project: journey.projects[0] ?? "", group: "none", q: resolved })}`}
          className="plan-chip"
        >
          Open in the matrix
        </Link>
      }
    >
      <p className="graph-meta">
        <code>{resolved}</code>
        {resolved !== id && <span className="muted"> (was {id})</span>}
        {journey.asset && (
          <span>
            on <ElementRef id={journey.asset} />
          </span>
        )}
        {journey.path && (
          <span>
            through <PathRef id={journey.path} />
          </span>
        )}
        {journey.aliases.length > 0 && (
          <span className="muted">formerly {journey.aliases.join(", ")}</span>
        )}
      </p>

      <GraphSection
        title="Who takes part"
        intro="Each role needs these contracts. The model allowing an implementation never makes a cell pass; a claim does."
      >
        <RoleDiagram requires={journey.requires} path={journey.path} />
      </GraphSection>

      {journey.covers.length > 0 && (
        <GraphSection title="Spec obligations it exercises" count={journey.covers.length}>
          <ul className="model-link-list">
            {journey.covers.map((c) => (
              <li key={`${c.spec}${c.name}${c.role}`}>
                <Link to={specHref(c.spec)} className="graph-link">
                  {catalog.specs[c.spec]?.title ?? c.spec}
                </Link>{" "}
                <code>{c.name}</code> <span className="muted">as {c.role}</span>
              </li>
            ))}
          </ul>
        </GraphSection>
      )}

      {projects.map((p) => (
        <GraphSection key={p.project} title={`In ${p.project}`}>
          <table className="model-table graph-cells">
            <thead>
              <tr>
                <th>Interface</th>
                <th>Version</th>
                <th>Cell</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {p.columns.map((c) => {
                const key = `${p.project}:${c.key}`;
                const n = (c.cell?.proofs.length ?? 0) + (c.cell?.evidence.length ?? 0);
                return (
                  <tr key={key}>
                    <td>{c.label}</td>
                    <td className="muted">{c.version ?? "—"}</td>
                    <td>
                      <BucketMark bucket={bucketOf(c.cell)} />
                    </td>
                    <td>
                      {n === 0 ? (
                        <span className="muted text-xs">nothing yet</span>
                      ) : open === key ? (
                        <ul className="compat-detail-list">
                          {c.cell?.proofs.map((pr) => (
                            <ProofItem key={`${pr.script}:${pr.anchor}`} proof={pr} />
                          ))}
                          {c.cell?.evidence.map((e) => (
                            <EvidenceItem key={`${e.source}:${e.why}`} evidence={e} />
                          ))}
                        </ul>
                      ) : (
                        <button
                          type="button"
                          className="model-element-link text-xs"
                          onClick={() => setOpen(key)}
                        >
                          {c.cell?.proofs.length ?? 0} proofs, {c.cell?.evidence.length ?? 0}{" "}
                          evidence
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GraphSection>
      ))}

      {facts.length > 0 && (
        <GraphSection title="Blocked by a server" count={facts.length}>
          <ul className="graph-facts">
            {facts.map((f) => (
              <li key={f.why}>
                <ElementRef id={f.implementation} />: {f.why}
              </li>
            ))}
          </ul>
        </GraphSection>
      )}
    </PlanPage>
  );
}

export function JourneysIndex() {
  const [q, setQ] = useState("");
  const needle = q.toLowerCase();
  const byPath = new Map<string, [string, (typeof catalog.journeys)[string]][]>();
  for (const [id, j] of Object.entries(catalog.journeys)) {
    if (needle && !`${id} ${j.title} ${j.summary}`.toLowerCase().includes(needle)) continue;
    const path = j.path ?? "—";
    byPath.set(path, [...(byPath.get(path) ?? []), [id, j]]);
  }
  return (
    <PlanPage
      title="Journeys"
      intro="What readers set out to do: one task on one asset kind through one path, defined once for the estate."
      actions={
        <input
          type="search"
          className="model-view-filter"
          placeholder="Filter journeys"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      {[...byPath.entries()].map(([path, rows]) => (
        <GraphSection key={path} title={path} count={rows.length}>
          <table className="model-table">
            <tbody>
              {rows.map(([id, j]) => (
                <tr key={id}>
                  <td>
                    <Link to={`/model/journeys/${encodeURIComponent(id)}`} className="graph-link">
                      {j.title}
                    </Link>
                    <p className="muted text-xs">{j.summary}</p>
                  </td>
                  <td>{j.asset && <ElementRef id={j.asset} />}</td>
                  <td className="muted text-xs">{j.projects.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GraphSection>
      ))}
    </PlanPage>
  );
}
