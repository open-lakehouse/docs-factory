import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { matrices } from "../../compat";
import {
  headlineCoverage,
  ImplementationIdentity,
  specRoleLabel,
} from "../../components/model/graph/ImplementationCard";
import {
  BucketBar,
  CoverageRing,
  ElementRef,
  elementHref,
  GraphSection,
  JourneyRef,
  PathRef,
  specHref,
} from "../../components/model/graph/primitives";
import CompatTable from "../../components/plan/CompatTable";
import { catalog } from "../../estate";
import { elementSummary, likec4model } from "../../explain";
import { blogRef, docRef, refHref } from "../../lib/content-ref";
import { implementationProfile } from "../../lib/estate-graph";
import { useModelIndex } from "../../lib/model-index";
import { PlanPage } from "../plan/PlanLayout";

const SPEC_EDGES = new Set(["implements", "consumes"]);

/** The specs it speaks, directly or through what it integrates. */
function speaks(id: string) {
  const el = likec4model.findElement(id);
  if (!el) return [];
  const found: { spec: string; verb: string; via: string | null }[] = [];
  const add = (from: typeof el, via: string | null) => {
    for (const r of from.outgoing()) {
      if (r.kind && SPEC_EDGES.has(r.kind) && r.target.kind === "openSpecification")
        found.push({ spec: String(r.target.id), verb: r.kind, via });
    }
  };
  add(el, null);
  for (const r of el.outgoing())
    if (r.kind === "integrates") add(r.target as typeof el, String(r.target.id));
  return found;
}

export default function ImplementationPage() {
  const { id = "" } = useParams();
  const el = likec4model.findElement(id);
  const profile = useMemo(() => implementationProfile(id, catalog, matrices), [id]);
  const { index } = useModelIndex();
  const entry = index?.elements[id];
  if (!el) {
    return (
      <PlanPage title="Not in the model">
        <p className="muted">
          No element <code>{id}</code>. <Link to="/model/implementations">All implementations</Link>
        </p>
      </PlanPage>
    );
  }
  const spoken = speaks(id);
  const rings = headlineCoverage(profile);
  const failures = profile.cells.filter((c) => c.bucket === "fails" || c.bucket === "missing");
  return (
    <PlanPage
      title={el.title}
      intro={elementSummary(el)}
      actions={
        <Link to={elementHref(id)} className="plan-chip">
          Show in the model
        </Link>
      }
    >
      <div className="impl-page-head">
        <ImplementationIdentity id={id} />
        <BucketBar counts={profile.counts} />
        <p className="impl-paths">
          {el.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs">
              {l.title ?? l.url}
            </a>
          ))}
          {entry?.explainedBy.map((p) => (
            <Link
              key={p.slug}
              className="text-xs"
              to={refHref(
                p.area === "blogs"
                  ? blogRef(p.slug)
                  : docRef(p.project ?? "", p.bucket ?? "", p.slug),
              )}
            >
              Explained by {p.title}
            </Link>
          ))}
        </p>
      </div>

      {spoken.length > 0 && (
        <GraphSection
          title="Speaks"
          intro="A client implements the formats it reads or writes and consumes the APIs it calls; an engine can reach a spec through what it integrates."
        >
          <ul className="model-link-list">
            {spoken.map((s) => (
              <li key={`${s.spec}${s.verb}${s.via}`}>
                <span className="muted">{s.verb}</span> <ElementRef id={s.spec} />
                {s.via && (
                  <span className="muted text-xs">
                    {" "}
                    via <ElementRef id={s.via} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </GraphSection>
      )}

      {rings.length > 0 && (
        <GraphSection
          title="Spec conformance"
          intro="How many of each spec's obligations its best column answers, per role. The denominator is the spec's own obligation list, not the rows someone tabled."
        >
          <div className="impl-rings">
            {rings.map((r) => (
              <CoverageRing
                key={`${r.spec}:${r.role}`}
                counts={r.counts}
                label={specRoleLabel(r.spec, r.role)}
                to={`${specHref(r.spec)}?impl=${encodeURIComponent(id)}`}
              />
            ))}
          </div>
        </GraphSection>
      )}

      {profile.paths.length > 0 && (
        <GraphSection title="Paths" intro="The roles the model lets it play. Claims prove them.">
          <table className="model-table">
            <thead>
              <tr>
                <th>Path</th>
                <th>Role</th>
                <th>Through</th>
                <th>Journeys it has cells on</th>
              </tr>
            </thead>
            <tbody>
              {profile.paths.map((p) => {
                const onPath = new Set(
                  profile.cells
                    .filter((c) => catalog.journeys[c.journey]?.path === p.path)
                    .map((c) => c.journey),
                );
                return (
                  <tr key={`${p.path}${p.role}`}>
                    <td>
                      <PathRef id={p.path} />
                    </td>
                    <td>{p.role}</td>
                    <td>
                      {p.via.length === 0 ? (
                        <span className="muted">itself</span>
                      ) : (
                        p.via.map((v) => (
                          <span key={v} className="graph-sep">
                            <ElementRef id={v} />
                          </span>
                        ))
                      )}
                    </td>
                    <td>{p.role === "client" ? onPath.size : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GraphSection>
      )}

      {profile.columns.length > 0 && (
        <GraphSection title="Interfaces" count={profile.columns.length}>
          <table className="model-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Interface</th>
                <th>Version</th>
                <th>Counted in</th>
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((c) => (
                <tr key={`${c.project}${c.key}`}>
                  <td>{c.project}</td>
                  <td>
                    {c.label} <code className="muted text-xs">{c.key}</code>
                  </td>
                  <td>{c.version ?? "—"}</td>
                  <td>{c.rolledInto ?? <span className="muted">its own column</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GraphSection>
      )}

      {profile.facts.length > 0 && (
        <GraphSection
          title="What it doesn't serve"
          count={profile.facts.length}
          intro="Recorded once, on the server. Every client cell on a path bound to it derives as blocked."
        >
          <ul className="graph-facts">
            {profile.facts.map((f) => {
              const blocked = f.blocks.reduce(
                (n, b) => n + b.interfaces.length * b.journeys.length,
                0,
              );
              return (
                <li key={f.why}>
                  <p>{f.why}</p>
                  <p className="muted text-xs">
                    {f.obligations.map((o) => `${o.spec}:${o.name}`).join(", ")} · {f.outcome} ·
                    blocks {blocked} cells:{" "}
                    {f.blocks
                      .flatMap((b) => b.journeys)
                      .map((j) => (
                        <JourneyRef key={j} id={j} />
                      ))}
                  </p>
                </li>
              );
            })}
          </ul>
        </GraphSection>
      )}

      {profile.blockedBy.length > 0 && (
        <GraphSection title="Blocked by" count={profile.blockedBy.length}>
          <ul className="graph-facts">
            {profile.blockedBy.map((b) => (
              <li key={`${b.project}${b.fact.why}`}>
                <p>
                  <ElementRef id={b.fact.implementation} />: {b.fact.why}
                </p>
                <p className="muted text-xs">
                  {b.project} ·{" "}
                  {b.journeys.map((j) => (
                    <JourneyRef key={j} id={j} />
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </GraphSection>
      )}

      {failures.length > 0 && (
        <GraphSection title="Known failures" count={failures.length}>
          <ul className="graph-facts">
            {failures.map((f) => (
              <li key={`${f.project}${f.journey}${f.interface}`}>
                <p>
                  <JourneyRef id={f.journey} />{" "}
                  <span className="muted text-xs">
                    {f.project} · {f.interface}
                  </span>
                </p>
                {f.cell.evidence[0] && <p className="muted text-xs">{f.cell.evidence[0].why}</p>}
                {f.cell.proofs[0]?.fails && (
                  <p className="muted text-xs">
                    <code>{f.cell.proofs[0].fails}</code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </GraphSection>
      )}

      {profile.cells.length > 0 && (
        <GraphSection title="Journeys" count={new Set(profile.cells.map((c) => c.journey)).size}>
          <CompatTable scope={{ model: id }} defaults={{ group: "path" }} />
        </GraphSection>
      )}

      {entry && entry.environments.length > 0 && (
        <GraphSection title="Runs in environments" count={entry.environments.length}>
          <ul className="model-link-list">
            {entry.environments.map((e) => (
              <li key={e.key}>
                {e.title} <code className="muted text-xs">{e.key}</code>
              </li>
            ))}
          </ul>
        </GraphSection>
      )}
    </PlanPage>
  );
}
