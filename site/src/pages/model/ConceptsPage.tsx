// /model/concepts: each docs site's concepts.json as its emit writes it, the
// index that the pages' JSON-LD `about` / `mentions` terms take their @id from.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CodeCopyButton from "../../components/CodeCopyButton";
import { kindLabel, likec4model } from "../../explain";
import { modelHref } from "../../lib/content-ref";
import { CONCEPT_SITES, type ConceptsJson, useConcepts } from "../../lib/model-index";
import { PlanPage } from "../plan/PlanLayout";

type Tab = "concepts" | "edges" | "environments" | "journeys" | "raw";
const TABS: { tab: Tab; label: string }[] = [
  { tab: "concepts", label: "Concepts" },
  { tab: "edges", label: "Edges" },
  { tab: "environments", label: "Environments" },
  { tab: "journeys", label: "Journeys" },
  { tab: "raw", label: "Raw JSON" },
];

function ElementId({ id }: { id: string }) {
  return (
    <Link to={modelHref({ kind: "element", id })} title={likec4model.findElement(id)?.title}>
      <code>{id}</code>
    </Link>
  );
}

function Concepts({ json }: { json: ConceptsJson }) {
  return (
    <table className="model-table">
      <thead>
        <tr>
          <th>Concept</th>
          <th>Kind</th>
          <th>Title</th>
          <th>url</th>
        </tr>
      </thead>
      <tbody>
        {json.concepts.map((c) => (
          <tr key={c.id}>
            <td>
              <ElementId id={c.id} />
            </td>
            <td>{kindLabel(c.kind)}</td>
            <td>
              {c.title}
              {c.summary && <p className="muted text-xs">{c.summary}</p>}
            </td>
            <td className="text-xs">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.url.startsWith(json.site.origin)
                    ? c.url.slice(json.site.origin.length)
                    : c.url}
                </a>
              ) : (
                <span className="muted">none</span>
              )}
              {c.sameAs.map((u) => (
                <div key={u} className="muted">
                  sameAs {u}
                </div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Edges({ json }: { json: ConceptsJson }) {
  return (
    <table className="model-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Kind</th>
          <th>Target</th>
          <th>Proof</th>
        </tr>
      </thead>
      <tbody>
        {json.edges.map((e) => (
          <tr key={`${e.source} ${e.kind} ${e.target}`}>
            <td>
              <ElementId id={e.source} />
            </td>
            <td>
              {e.kind ?? "relates"}
              {e.partial && <span className="model-status"> partial</span>}
            </td>
            <td>
              <ElementId id={e.target} />
            </td>
            <td className="text-xs">
              {e.verified ? (
                <span className="model-status model-status-ready">
                  verified by {e.journeys.length}
                </span>
              ) : (
                <span className="muted">unverified</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Environments({ json }: { json: ConceptsJson }) {
  if (json.environments.length === 0)
    return <p className="muted">This site ships no environments.</p>;
  return (
    <ul className="model-link-list">
      {json.environments.map((env) => (
        <li key={env.key} className="mb-3">
          <strong>{env.title}</strong> <code className="muted text-xs">{env.key}</code>
          <div className="text-xs muted">
            guide: {env.guide ?? "none (unpublished)"} · archive: {env.archive ?? "none"}
          </div>
          {env.services.length > 0 && (
            <div className="text-xs">
              runs{" "}
              {env.services.map((s, i) => (
                <span key={s.element}>
                  {i > 0 && ", "}
                  <ElementId id={s.element} />
                  {s.role && <span className="muted"> ({s.role})</span>}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Journeys({ json }: { json: ConceptsJson }) {
  if (json.journeys.length === 0)
    return <p className="muted">No ready page on this site proves a journey yet.</p>;
  return (
    <table className="model-table">
      <thead>
        <tr>
          <th>Journey</th>
          <th>Interface</th>
          <th>Asset</th>
          <th>Pages</th>
        </tr>
      </thead>
      <tbody>
        {json.journeys.map((j) => (
          <tr key={`${j.id} ${j.interface}`}>
            <td>
              {j.title} <code className="muted text-xs">{j.id}</code>
            </td>
            <td>{j.element ? <ElementId id={j.element} /> : j.interface}</td>
            <td>{j.asset ? <ElementId id={j.asset} /> : <span className="muted">none</span>}</td>
            <td className="text-xs">
              {j.pages.map((u) => (
                <div key={u}>{u.slice(json.site.origin.length)}</div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Raw({ json, site }: { json: ConceptsJson; site: string }) {
  // Pretty-printed exactly as emit-docs writes public/concepts.json.
  const text = `${JSON.stringify(json, null, 2)}\n`;
  return (
    <div className="prose max-w-none">
      <div className="cb" data-has-filename="true">
        <div className="cb-head">
          <span className="cb-file">sites/{site}/public/concepts.json</span>
        </div>
        <CodeCopyButton code={text} />
        <pre className="cb-pre">
          <code>{text}</code>
        </pre>
      </div>
    </div>
  );
}

export default function ConceptsPage() {
  const [params, setParams] = useSearchParams();
  const site = CONCEPT_SITES.includes(params.get("site") ?? "")
    ? (params.get("site") as string)
    : CONCEPT_SITES[0];
  const [tab, setTab] = useState<Tab>("concepts");
  const { concepts, isLoading } = useConcepts(site);

  return (
    <PlanPage
      title="Concepts"
      intro={
        <>
          The model elements a docs site publishes: those tagged <code>#public</code>, with the
          ready page that explains each, the typed edges between them, the environments that run
          them, and the journeys its ready pages prove. Page JSON-LD names these terms by{" "}
          <code>@id</code> (<code>/concepts.json#&lt;id&gt;</code>). Drafts don&apos;t count.
        </>
      }
    >
      <div className="plan-toolbar mb-4">
        <fieldset className="plan-chips" aria-label="Site">
          {CONCEPT_SITES.map((s) => (
            <button
              key={s}
              type="button"
              className={s === site ? "plan-chip is-active" : "plan-chip"}
              aria-pressed={s === site}
              onClick={() => setParams({ site: s })}
            >
              {s}
            </button>
          ))}
        </fieldset>
        <fieldset className="plan-chips" aria-label="Section">
          {TABS.map(({ tab: t, label }) => {
            const count = concepts && t !== "raw" ? (concepts[t] as unknown[]).length : undefined;
            return (
              <button
                key={t}
                type="button"
                className={t === tab ? "plan-chip is-active" : "plan-chip"}
                aria-pressed={t === tab}
                onClick={() => setTab(t)}
              >
                {label}
                {count !== undefined && <span className="plan-chip-count">{count}</span>}
              </button>
            );
          })}
        </fieldset>
      </div>
      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && !concepts && (
        <p className="muted">No concepts.json for {site} in this build.</p>
      )}
      {concepts && tab === "concepts" && <Concepts json={concepts} />}
      {concepts && tab === "edges" && <Edges json={concepts} />}
      {concepts && tab === "environments" && <Environments json={concepts} />}
      {concepts && tab === "journeys" && <Journeys json={concepts} />}
      {concepts && tab === "raw" && <Raw json={concepts} site={site} />}
    </PlanPage>
  );
}
