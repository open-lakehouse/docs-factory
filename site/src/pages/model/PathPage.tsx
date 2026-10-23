import { useParams } from "react-router-dom";
import { matrices } from "../../compat";
import {
  BucketBar,
  ElementRef,
  GraphSection,
  JourneyRef,
  PathRef,
} from "../../components/model/graph/primitives";
import RoleDiagram from "../../components/model/graph/RoleDiagram";
import { catalog } from "../../estate";
import { BUCKETS, type BucketCounts, bucketOf } from "../../lib/estate-graph";
import { PlanPage } from "../plan/PlanLayout";

/** Every cell of a journey across the projects showing it. */
function journeyCounts(id: string): BucketCounts {
  const n = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as BucketCounts;
  for (const m of matrices) {
    const j = m.journeys.find((x) => x.id === id);
    if (!j) continue;
    for (const i of m.interfaces)
      if ((i.rollup ?? []).length === 0 && j.cells[i.key]) n[bucketOf(j.cells[i.key])] += 1;
  }
  return n;
}

export function PathsIndex() {
  return (
    <PlanPage
      title="Paths"
      intro="How a journey's participants reach the asset: the contract each role needs. Many journeys share one path."
    >
      <div className="impl-grid">
        {Object.entries(catalog.paths).map(([id, p]) => {
          const journeys = Object.values(catalog.journeys).filter((j) => j.path === id).length;
          return (
            <article key={id} className="impl-card">
              <p className="impl-title">
                <PathRef id={id} />
              </p>
              <p className="muted text-xs">{journeys} journeys</p>
              <ul className="model-link-list">
                {Object.entries(p.candidates).map(([role, found]) => (
                  <li key={role}>
                    <span className="muted">{role}:</span>{" "}
                    {found.map((c) => (
                      <span key={c.id} className="graph-chip-gap">
                        <ElementRef id={c.id} />
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </PlanPage>
  );
}

export default function PathPage() {
  const { id = "" } = useParams();
  const path = catalog.paths[id];
  if (!path) {
    return (
      <PlanPage title="No such path">
        <p className="muted">
          <code>{id}</code> isn&apos;t in <code>architecture/journeys/paths.yml</code>.
        </p>
      </PlanPage>
    );
  }
  const journeys = Object.entries(catalog.journeys).filter(([, j]) => j.path === id);
  return (
    <PlanPage title={id} intro="A named pattern of roles; each role uses the exact ADR-0008 verb.">
      <GraphSection title="Roles">
        <RoleDiagram requires={path.roles} path={id} />
      </GraphSection>
      <GraphSection title="Journeys on this path" count={journeys.length}>
        <table className="model-table">
          <thead>
            <tr>
              <th>Journey</th>
              <th>Asset</th>
              <th>Cells</th>
            </tr>
          </thead>
          <tbody>
            {journeys.map(([jid, j]) => (
              <tr key={jid}>
                <td>
                  <JourneyRef id={jid} />
                  <p className="muted text-xs">{j.summary}</p>
                </td>
                <td>{j.asset && <ElementRef id={j.asset} />}</td>
                <td>
                  <BucketBar counts={journeyCounts(jid)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GraphSection>
    </PlanPage>
  );
}
