import { Fragment, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { matrices } from "../../compat";
import {
  ElementRef,
  elementHref,
  GraphSection,
  JourneyRef,
  specHref,
} from "../../components/model/graph/primitives";
import { catalog } from "../../estate";
import { likec4model } from "../../explain";
import { answered, specColumns } from "../../lib/estate-graph";
import { PlanPage } from "../plan/PlanLayout";

const STATUS_MARK: Record<string, string> = {
  tested: "✓",
  documented: "docs",
  fails: "✗",
  missing: "✗",
  blocked: "⊘",
  unknown: "—",
  untracked: "·",
};

const STATUS_TITLE: Record<string, string> = {
  untracked: "no journey a table shows in this column covers it",
  blocked: "the server this project binds doesn't serve it",
};

export default function SpecPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const impl = params.get("impl");
  const spec = catalog.specs[id];
  const all = useMemo(() => specColumns(id, matrices), [id]);
  if (!spec) {
    return (
      <PlanPage title="No obligations recorded">
        <p className="muted">
          <ElementRef id={id} /> has no <code>architecture/journeys/obligations/{id}.yml</code>, so
          nothing measures engines against it yet.
        </p>
      </PlanPage>
    );
  }
  const columns = impl ? all.filter((c) => c.model === impl) : all;
  const equivalences = catalog.equivalences.filter((e) => e.sides[id]);
  const facts = catalog.facts.filter((f) => f.obligations.some((o) => o.spec === id));
  return (
    <PlanPage
      title={spec.title}
      intro={
        <>
          What the spec asks of each role, and how far each interface the docs measure has answered
          it. Every obligation counts once per role, so the denominator comes from the spec.{" "}
          {spec.source && (
            <a href={spec.source} target="_blank" rel="noreferrer">
              Spec text
            </a>
          )}
        </>
      }
      actions={
        <Link to={elementHref(id)} className="plan-chip">
          Show in the model
        </Link>
      }
    >
      {impl && (
        <p className="text-sm">
          Showing <ElementRef id={impl} /> only.{" "}
          <button
            type="button"
            className="model-element-link"
            onClick={() => setParams({}, { replace: true })}
          >
            Show every interface
          </button>
        </p>
      )}
      {spec.roles.map((role) => {
        const rows = spec.obligations.filter((o) => o.roles.includes(role));
        return (
          <GraphSection
            key={role}
            title={`${role[0].toUpperCase()}${role.slice(1)} obligations`}
            count={rows.length}
          >
            <div className="graph-scroll">
              <table className="compat-table graph-grid graph-heatmap">
                <thead>
                  <tr>
                    <th scope="col">Obligation</th>
                    <th scope="col">Since</th>
                    {columns.map((c) => {
                      const n = c.roles[role];
                      const share = n ? answered(n) : null;
                      return (
                        <th key={`${c.project}:${c.interface}`} scope="col">
                          {c.model ? (
                            <Link to={`/model/implementations/${c.model}`} className="graph-link">
                              {c.label}
                            </Link>
                          ) : (
                            c.label
                          )}
                          <span className="compat-version">
                            {c.project}
                            {share ? ` · ${share.answered}/${share.total}` : ""}
                          </span>
                        </th>
                      );
                    })}
                    <th scope="col">Covered by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.name}>
                      <th scope="row">
                        <code>{o.name}</code>
                      </th>
                      <td className="muted text-xs">{o.since ?? ""}</td>
                      {columns.map((c) => {
                        const status = c.status.get(`${o.name}:${role}`) ?? "untracked";
                        return (
                          <td key={`${c.project}:${c.interface}`}>
                            <span
                              className={`compat-cell compat-${status}`}
                              title={STATUS_TITLE[status] ?? status}
                            >
                              {STATUS_MARK[status] ?? status}
                            </span>
                          </td>
                        );
                      })}
                      <td className="graph-chips">
                        {(o.journeys[role] ?? []).map((j) => (
                          <JourneyRef key={j} id={j} />
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GraphSection>
        );
      })}
      {facts.length > 0 && (
        <GraphSection title="Servers that don't serve it" count={facts.length}>
          <ul className="graph-facts">
            {facts.map((f) => (
              <li key={f.why}>
                <ElementRef id={f.implementation} />: {f.why}
              </li>
            ))}
          </ul>
        </GraphSection>
      )}
      {equivalences.length > 0 && (
        <GraphSection title="The same thing in other formats" count={equivalences.length}>
          <table className="model-table">
            <tbody>
              {equivalences.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.title}</th>
                  <td>
                    {Object.entries(e.sides)
                      .filter(([s]) => s !== id)
                      .map(([s, side]) => (
                        <Fragment key={s}>
                          <Link to={specHref(s)} className="graph-link">
                            {likec4model.findElement(s)?.title ?? s}
                          </Link>
                          : {side.text ?? side.obligations.join(", ")}{" "}
                        </Fragment>
                      ))}
                    {e.differ && <p className="muted text-xs">{e.differ}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GraphSection>
      )}
    </PlanPage>
  );
}

export function SpecsIndex() {
  return (
    <PlanPage
      title="Specifications"
      intro="Each open specification's obligations, per role, and how many interfaces the docs measure against it."
    >
      <div className="impl-grid">
        {Object.entries(catalog.specs).map(([id, s]) => {
          const cols = specColumns(id, matrices);
          return (
            <article key={id} className="impl-card">
              <Link to={specHref(id)} className="impl-title graph-link">
                {s.title}
              </Link>
              <p className="muted text-xs">
                {s.obligations.length} obligations ·{" "}
                {s.roles
                  .map((r) => `${s.obligations.filter((o) => o.roles.includes(r)).length} ${r}`)
                  .join(" · ")}
              </p>
              <p className="muted text-xs">
                {cols.length} interfaces measured across {new Set(cols.map((c) => c.project)).size}{" "}
                projects
              </p>
            </article>
          );
        })}
      </div>
    </PlanPage>
  );
}
