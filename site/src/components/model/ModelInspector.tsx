// The explorer's right pane: one model element or view, what the docs pipeline
// derives from it (model-index.json), and its review threads.
import type { ElementModel } from "likec4/model";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { elementSummary, getExplainElement, kindLabel, likec4model } from "../../explain";
import { blogRef, docRef, type ModelTarget, modelSlug, refHref } from "../../lib/content-ref";
import {
  CONCEPT_SITES,
  type ElementIndex,
  type PageLink,
  useModelIndex,
} from "../../lib/model-index";
import { useModelThreadStats } from "../../lib/model-threads";
import { RequestExplanationButton } from "../review/ContentRequests";
import ModelThreads from "./ModelThreads";

/** How the explorer selects a target: `?el=`, `?view=`, `?scope=estate`. */
export type Select = (next: { el?: string | null; view?: string | null }) => void;

function pageHref(p: PageLink): string {
  return refHref(
    p.area === "blogs" ? blogRef(p.slug) : docRef(p.project ?? "", p.bucket ?? "", p.slug),
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="model-inspector-section">
      <h3 className="blog-aside-title">
        {title} {count !== undefined && <span className="plan-chip-count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function PageList({ title, pages }: { title: string; pages: PageLink[] }) {
  if (pages.length === 0) return null;
  return (
    <Section title={title} count={pages.length}>
      <ul className="model-link-list">
        {pages.map((p) => (
          <li key={pageHref(p)}>
            <Link to={pageHref(p)}>{p.title}</Link>{" "}
            <span className={`model-status model-status-${p.status}`}>{p.status}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ElementLink({ id, select }: { id: string; select: Select }) {
  const el = likec4model.findElement(id);
  return (
    <button type="button" className="model-element-link" onClick={() => select({ el: id })}>
      {el?.title ?? id}
    </button>
  );
}

function Published({ entry }: { entry: ElementIndex }) {
  const citedByReady = [...entry.explainedBy, ...entry.referencedBy, ...entry.linkedFrom].some(
    (p) => p.status === "ready",
  );
  return (
    <Section title="Published">
      <ul className="model-link-list">
        {CONCEPT_SITES.map((site) => {
          const p = entry.published[site];
          return (
            <li key={site}>
              <code>{site}</code>{" "}
              {p?.inConcepts ? (
                <>
                  <span className="model-status model-status-ready">in concepts.json</span>{" "}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className="muted text-xs">
                      {p.url}
                    </a>
                  )}
                </>
              ) : (
                <span className="model-status">not published</span>
              )}
            </li>
          );
        })}
      </ul>
      {!entry.public && citedByReady && (
        <p className="muted text-xs">
          Ready pages cite this element, but it isn&apos;t tagged <code>#public</code>, so no site
          publishes it.
        </p>
      )}
    </Section>
  );
}

function Relations({ el, select }: { el: ElementModel; select: Select }) {
  const rows = [
    ...[...el.outgoing()].map((r) => ({ dir: "→", kind: r.kind, other: String(r.target.id) })),
    ...[...el.incoming()].map((r) => ({ dir: "←", kind: r.kind, other: String(r.source.id) })),
  ];
  if (rows.length === 0) return null;
  return (
    <Section title="Relationships" count={rows.length}>
      <ul className="model-link-list">
        {rows.map((r) => (
          <li key={`${r.dir}${r.kind}${r.other}`}>
            <span className="muted">
              {r.dir} {r.kind ?? "relates"}
            </span>{" "}
            <ElementLink id={r.other} select={select} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

const JOURNEYS_SHOWN = 8;

function Journeys({ journeys }: { journeys: ElementIndex["journeys"] }) {
  const [all, setAll] = useState(false);
  if (journeys.length === 0) return null;
  const shown = all ? journeys : journeys.slice(0, JOURNEYS_SHOWN);
  return (
    <Section title="Compatibility journeys" count={journeys.length}>
      <ul className="model-link-list">
        {shown.map((j) => (
          <li key={`${j.project}${j.id}${j.interface ?? ""}`}>
            {j.title}{" "}
            <span className="muted text-xs">
              {j.project} · {j.role === "interface" ? `${j.interface}: ` : ""}
              {j.status}
            </span>
          </li>
        ))}
      </ul>
      {journeys.length > JOURNEYS_SHOWN && (
        <button type="button" className="model-element-link text-xs" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${journeys.length}`}
        </button>
      )}
    </Section>
  );
}

function ElementPanel({ id, select }: { id: string; select: Select }) {
  const el = likec4model.findElement(id);
  const { index } = useModelIndex();
  const entry = index?.elements[id];
  if (!el) return <p className="muted">No element {id} in the model.</p>;
  const summary = elementSummary(el);
  const views = [...el.views()];
  const pageWorthy = Boolean(getExplainElement(id));
  return (
    <>
      <header className="model-inspector-head">
        <span className="kind-badge">{kindLabel(el.kind)}</span>
        <h2>{el.title}</h2>
        <code className="muted">{id}</code>
        {el.tags.length > 0 && (
          <p className="model-tags">
            {el.tags.map((t) => (
              <span key={t} className={t === "public" ? "model-tag is-public" : "model-tag"}>
                #{t}
              </span>
            ))}
          </p>
        )}
        {summary && <p className="muted text-sm">{summary}</p>}
        {el.links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs">
            {l.title ?? l.url}
          </a>
        ))}
      </header>
      {entry ? (
        <>
          <Published entry={entry} />
          <PageList title="Explained by" pages={entry.explainedBy} />
          {pageWorthy && entry.explainedBy.length === 0 && (
            <Section title="Explained by">
              <p className="muted text-xs">No page explains this concept yet.</p>
              <RequestExplanationButton id={id} title={el.title} />
            </Section>
          )}
          <PageList title="Referenced by" pages={entry.referencedBy} />
          <PageList title="Linked from (model: links)" pages={entry.linkedFrom} />
          <Journeys journeys={entry.journeys} />
          {entry.verifiedEdges.length > 0 && (
            <Section title="Verified relationships" count={entry.verifiedEdges.length}>
              <ul className="model-link-list">
                {entry.verifiedEdges.map((e) => (
                  <li key={`${e.project}${e.source}${e.kind}${e.target}`}>
                    <ElementLink id={e.source} select={select} />{" "}
                    <span className="muted">{e.kind}</span>{" "}
                    <ElementLink id={e.target} select={select} />{" "}
                    <span className="muted text-xs">
                      {e.project} · {e.journeys} journeys
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {entry.environments.length > 0 && (
            <Section title="Runs in environments" count={entry.environments.length}>
              <ul className="model-link-list">
                {entry.environments.map((e) => (
                  <li key={e.key}>
                    {e.title} <code className="muted text-xs">{e.key}</code>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <p className="muted text-xs">Loading what the docs derive from it…</p>
      )}
      <Relations el={el} select={select} />
      {views.length > 0 && (
        <Section title="In views" count={views.length}>
          <ul className="model-link-list">
            {views.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="model-element-link"
                  onClick={() => select({ view: v.id, el: id })}
                >
                  {v.titleOrId}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function ViewPanel({ id, select }: { id: string; select: Select }) {
  const view = likec4model.findView(id);
  const { index } = useModelIndex();
  if (!view) return <p className="muted">No view {id} in the model.</p>;
  const of = view.viewOf;
  return (
    <>
      <header className="model-inspector-head">
        <span className="kind-badge">{view._type} view</span>
        <h2>{view.titleOrId}</h2>
        <code className="muted">{id}</code>
        {!view.description.isEmpty && <p className="muted text-sm">{view.description.text}</p>}
        {of && (
          <p className="text-sm">
            View of <ElementLink id={String(of.id)} select={select} />
          </p>
        )}
      </header>
      <PageList title="Embedded by" pages={index?.views[id]?.embeddedBy ?? []} />
    </>
  );
}

/** The target's details without its threads (the workspace rail shows those). */
export function ModelTargetDetails({ target, select }: { target: ModelTarget; select: Select }) {
  const { bySlug } = useModelThreadStats();
  const open = bySlug.get(modelSlug(target))?.open ?? 0;
  if (target.kind === "element") return <ElementPanel id={target.id} select={select} />;
  if (target.kind === "view") return <ViewPanel id={target.id} select={select} />;
  return (
    <header className="model-inspector-head">
      <h2>The whole model</h2>
      <p className="muted text-sm">
        Threads about the model as a whole: its structure, naming, or what it&apos;s missing.
        {open > 0 && ` ${open} open.`}
      </p>
    </header>
  );
}

export default function ModelInspector({
  target,
  select,
}: {
  target: ModelTarget;
  select: Select;
}) {
  return (
    <div className="model-inspector">
      <ModelTargetDetails target={target} select={select} />
      <ModelThreads target={target} />
    </div>
  );
}
