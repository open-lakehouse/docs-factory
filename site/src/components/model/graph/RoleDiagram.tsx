// A path's roles side by side: the contracts each needs, and the
// implementations the model lets play it.
import type { CompatRequirements } from "../../../compat";
import { catalog } from "../../../estate";
import { ElementRef } from "./primitives";

export default function RoleDiagram({
  requires,
  path,
}: {
  requires: CompatRequirements;
  path: string | null;
}) {
  const candidates = path ? (catalog.paths[path]?.candidates ?? {}) : {};
  return (
    <ol className="role-diagram">
      {Object.entries(requires).map(([role, edges]) => (
        <li key={role} className="role-card">
          <p className="role-name">{role}</p>
          <ul className="role-contracts">
            {Object.entries(edges).flatMap(([verb, ids]) =>
              ids.map((id) => (
                <li key={`${verb}${id}`}>
                  <span className="muted">{verb}</span> <ElementRef id={id} />
                </li>
              )),
            )}
          </ul>
          {candidates[role] ? (
            <div className="role-candidates">
              <p className="muted text-xs">The model allows</p>
              {candidates[role].map((c) => (
                <span key={c.id} className="role-candidate">
                  <ElementRef id={c.id} />
                  {c.via.length > 0 && (
                    <span className="muted text-xs">
                      {" "}
                      via{" "}
                      {c.via.map((v) => (
                        <span key={v} className="graph-sep">
                          <ElementRef id={v} />
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              ))}
              {candidates[role].length === 0 && (
                <span className="muted text-xs">no implementation yet</span>
              )}
            </div>
          ) : (
            <p className="muted text-xs">Added by this journey; the path doesn&apos;t name it.</p>
          )}
        </li>
      ))}
    </ol>
  );
}
