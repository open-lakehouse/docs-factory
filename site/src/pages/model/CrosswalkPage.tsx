import { Link } from "react-router-dom";
import { matrices } from "../../compat";
import { JourneyRef, specHref } from "../../components/model/graph/primitives";
import { catalog } from "../../estate";
import { likec4model } from "../../explain";
import { type SpecColumn, specColumns } from "../../lib/estate-graph";
import { PlanPage } from "../plan/PlanLayout";

// Best first, so an implementation shows the best of its columns.
const RANK = ["tested", "documented", "fails", "missing", "blocked", "unknown", "untracked"];

/** Per implementation, the best status any of its columns has on the obligations. */
function support(columns: SpecColumn[], obligations: string[]) {
  const best = new Map<string, string>();
  for (const c of columns) {
    if (!c.model) continue;
    for (const [key, status] of c.status) {
      if (!obligations.includes(key.split(":")[0])) continue;
      const prev = best.get(c.model);
      if (!prev || RANK.indexOf(status) < RANK.indexOf(prev)) best.set(c.model, status);
    }
  }
  return [...best.entries()].filter(([, s]) => s !== "untracked");
}

export default function CrosswalkPage() {
  const specs: string[] = [];
  for (const eq of catalog.equivalences)
    for (const s of Object.keys(eq.sides)) if (!specs.includes(s)) specs.push(s);
  const columns = Object.fromEntries(specs.map((s) => [s, specColumns(s, matrices)]));
  return (
    <PlanPage
      title="Format crosswalk"
      intro="What one table format does that another does too, as the obligations each spec names for it, with how each engine answers each side."
    >
      <div className="graph-scroll">
        <table className="model-table crosswalk">
          <thead>
            <tr>
              <th>What it does</th>
              {specs.map((s) => (
                <th key={s}>
                  <Link to={specHref(s)} className="graph-link">
                    {likec4model.findElement(s)?.title ?? s}
                  </Link>
                </th>
              ))}
              <th>How they differ</th>
            </tr>
          </thead>
          <tbody>
            {catalog.equivalences.map((eq) => (
              <tr key={eq.id}>
                <th scope="row">{eq.title}</th>
                {specs.map((s) => {
                  const side = eq.sides[s];
                  if (!side)
                    return (
                      <td key={s} className="muted">
                        —
                      </td>
                    );
                  return (
                    <td key={s}>
                      <p>{side.text ?? side.obligations.map((o) => <code key={o}>{o} </code>)}</p>
                      <p className="graph-chips">
                        {side.journeys.map((j) => (
                          <JourneyRef key={j} id={j} />
                        ))}
                      </p>
                      <p className="graph-chips">
                        {support(columns[s], side.obligations).map(([impl, status]) => (
                          <span
                            key={impl}
                            className={`crosswalk-support compat-${status}`}
                            title={status}
                          >
                            {likec4model.findElement(impl)?.title ?? impl}
                          </span>
                        ))}
                      </p>
                    </td>
                  );
                })}
                <td className="muted text-xs">{eq.differ}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PlanPage>
  );
}
