// Model gaps docsnip reports alongside a matrix (`compat.diagnostics`).
import type { CompatMatrix } from "../../../compat";
import { ModelRef } from "../../ModelRef";

export function ModelCoverageGaps({ matrix }: { matrix: CompatMatrix }) {
  const actionable = matrix.diagnostics.filter((d) =>
    ["unmodeled", "missing-edge", "missing-asset-edge", "unverified-asset-edge"].includes(d.kind),
  );
  if (actionable.length === 0) return null;
  return (
    <aside className="compat-model-gaps">
      <h2 className="blog-aside-title">Model coverage</h2>
      <ul className="draft-list compact">
        {actionable.map((gap) => (
          <li
            key={`${gap.kind}:${gap.interface ?? ""}:${gap.source ?? ""}:${gap.target ?? ""}:${gap.asset ?? ""}:${gap.journeys?.join(",") ?? ""}`}
          >
            {gap.kind === "unmodeled" && (
              <>
                <code>{gap.interface}</code> has ready evidence but no model element.
              </>
            )}
            {gap.kind === "missing-edge" && (
              <>
                <code>{gap.interface}</code> proves {gap.journeys?.join(", ")} but{" "}
                {gap.source && <ModelRef id={gap.source} />} has no contract edge to{" "}
                {gap.target && <ModelRef id={gap.target} />}.
              </>
            )}
            {gap.kind === "missing-asset-edge" && (
              <>
                <code>{gap.interface}</code> proves {gap.journeys?.join(", ")} but{" "}
                {gap.source && <ModelRef id={gap.source} />} has no <code>operatesOn</code> edge to{" "}
                {gap.asset && <ModelRef id={gap.asset} />}.
              </>
            )}
            {gap.kind === "unverified-asset-edge" && (
              <>
                {gap.source && <ModelRef id={gap.source} />} is modeled to operate on{" "}
                {gap.asset && <ModelRef id={gap.asset} />}, but no ready journey verifies it.
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
