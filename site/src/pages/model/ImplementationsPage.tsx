import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { matrices } from "../../compat";
import ImplementationCard from "../../components/model/graph/ImplementationCard";
import { ElementRef } from "../../components/model/graph/primitives";
import { catalog } from "../../estate";
import { likec4model } from "../../explain";
import { graphImplementations, implementationProfile } from "../../lib/estate-graph";
import { PlanPage } from "../plan/PlanLayout";

const KINDS = ["service", "library", "client", "infra"] as const;

export default function ImplementationsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind");
  const q = (params.get("q") ?? "").toLowerCase();
  const { inGraph, rest } = useMemo(() => {
    const cells = graphImplementations(catalog, matrices);
    const all = [...likec4model.elements()].filter((e) => e.kind === "implementation");
    return {
      inGraph: all
        .filter((e) => cells.has(e.id))
        .map((e) => implementationProfile(e.id, catalog, matrices))
        .sort((a, b) => b.cells.length - a.cells.length || a.id.localeCompare(b.id)),
      rest: all.filter((e) => !cells.has(e.id)),
    };
  }, []);
  const matches = (id: string) => {
    const el = likec4model.findElement(id);
    if (!el) return false;
    if (kind && !el.tags.includes(kind)) return false;
    return !q || el.title.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  };
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const shown = inGraph.filter((p) => matches(p.id));
  const others = rest.filter((e) => matches(e.id));
  return (
    <PlanPage
      title="Implementations"
      intro={
        <>
          Every engine, client, server, and library the journey graph measures: how its cells stand,
          how much of each spec it answers, and the paths the model lets it take part in.
        </>
      }
    >
      <div className="plan-toolbar">
        <fieldset className="plan-chips" aria-label="Kind">
          <button
            type="button"
            className={kind ? "plan-chip" : "plan-chip is-active"}
            onClick={() => set("kind", null)}
          >
            All
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? "plan-chip is-active" : "plan-chip"}
              onClick={() => set("kind", kind === k ? null : k)}
            >
              {k}
            </button>
          ))}
        </fieldset>
        <input
          type="search"
          className="model-view-filter"
          placeholder="Filter implementations"
          value={params.get("q") ?? ""}
          onChange={(e) => set("q", e.target.value || null)}
        />
      </div>
      <div className="impl-grid">
        {shown.map((p) => (
          <ImplementationCard key={p.id} profile={p} />
        ))}
      </div>
      {others.length > 0 && (
        <section className="graph-section">
          <h2>
            Not in any journey yet <span className="plan-chip-count">{others.length}</span>
          </h2>
          <p className="impl-others">
            {others.map((e) => (
              <ElementRef key={e.id} id={e.id} />
            ))}
          </p>
        </section>
      )}
    </PlanPage>
  );
}
