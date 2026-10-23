// An implementation's journeys × its headline columns, grouped by path.
import { Fragment } from "react";
import { catalog } from "../../../estate";
import type { ImplementationProfile, ProfileCell } from "../../../lib/estate-graph";
import { BucketMark, JourneyRef, PathRef } from "./primitives";

export default function JourneyGrid({ profile }: { profile: ImplementationProfile }) {
  const columns = profile.columns.filter((c) =>
    profile.cells.some((x) => x.project === c.project && x.interface === c.key),
  );
  const byJourney = new Map<string, Map<string, ProfileCell>>();
  for (const c of profile.cells) {
    const row = byJourney.get(c.journey) ?? new Map();
    row.set(`${c.project}:${c.interface}`, c);
    byJourney.set(c.journey, row);
  }
  const byPath = new Map<string, string[]>();
  for (const j of byJourney.keys()) {
    const path = catalog.journeys[j]?.path ?? "—";
    byPath.set(path, [...(byPath.get(path) ?? []), j]);
  }
  return (
    <div className="graph-scroll">
      <table className="compat-table graph-grid">
        <thead>
          <tr>
            <th scope="col">Journey</th>
            {columns.map((c) => (
              <th key={`${c.project}:${c.key}`} scope="col">
                {c.label}
                <span className="compat-version">
                  {c.project}
                  {c.version ? ` · ${c.version}` : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...byPath.entries()].map(([path, journeys]) => (
            <Fragment key={path}>
              <tr className="graph-group-row">
                <th colSpan={columns.length + 1} scope="colgroup">
                  {path === "—" ? "No path" : <PathRef id={path} />}{" "}
                  <span className="plan-chip-count">{journeys.length}</span>
                </th>
              </tr>
              {journeys.map((j) => (
                <tr key={j}>
                  <th scope="row">
                    <JourneyRef id={j} />
                  </th>
                  {columns.map((c) => {
                    const cell = byJourney.get(j)?.get(`${c.project}:${c.key}`);
                    return (
                      <td key={`${c.project}:${c.key}`}>
                        {cell && <BucketMark bucket={cell.bucket} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
