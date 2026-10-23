import { useParams } from "react-router-dom";
import { ElementRef, GraphSection, PathRef } from "../../components/model/graph/primitives";
import RoleDiagram from "../../components/model/graph/RoleDiagram";
import CompatTable from "../../components/plan/CompatTable";
import { catalog } from "../../estate";
import { PlanPage } from "../plan/PlanLayout";

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
        <CompatTable scope={{ path: id }} defaults={{ group: "asset" }} />
      </GraphSection>
    </PlanPage>
  );
}
