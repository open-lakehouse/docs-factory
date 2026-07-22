import { lazy, Suspense, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import MetaLinks from "./components/MetaLinks";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ElementModel } from "likec4/model";
import Shell from "./components/layout/Shell";
import ExplainSidebar from "./components/layout/ExplainSidebar";
import ExplainDiagram from "./components/ExplainDiagram";
import MdxProvider from "./MdxProvider";
import { backlinksFor } from "./backlinks";
import {
  bucketByDiataxis,
  DIATAXIS_LABELS,
  DIATAXIS_ORDER,
} from "./graph";
import {
  getExplainElement,
  explainDocLoader,
  elementSummary,
  explainHref,
  explainNav,
  orphanSpecs,
  orphanImplementations,
  kindLabel,
} from "./explain";

// --- Neighbor helpers (SDK-derived, deterministic) --------------------------

interface Neighbor {
  id: string;
  title: string;
  href: string | null;
  externalUrl: string | null;
}

function toNeighbor(el: ElementModel): Neighbor {
  const id = String(el.id);
  const page = getExplainElement(id);
  return {
    id,
    title: el.title,
    href: page ? explainHref(id) : null,
    externalUrl: el.links[0]?.url ?? null,
  };
}

function dedupe(els: ElementModel[]): ElementModel[] {
  const seen = new Set<string>();
  const out: ElementModel[] = [];
  for (const el of els) {
    const id = String(el.id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(el);
    }
  }
  return out;
}

function incomingBy(el: ElementModel, kind: string): Neighbor[] {
  return dedupe(
    [...el.incoming()].filter((r) => r.kind === kind).map((r) => r.source),
  ).map(toNeighbor);
}

function outgoingBy(el: ElementModel, kind: string): Neighbor[] {
  return dedupe(
    [...el.outgoing()].filter((r) => r.kind === kind).map((r) => r.target),
  ).map(toNeighbor);
}

interface ContextSection {
  label: string;
  neighbors: Neighbor[];
}

function contextSections(el: ElementModel): ContextSection[] {
  const sections: ContextSection[] = [];

  if (el.kind === "capability") {
    sections.push({ label: "Specified by", neighbors: incomingBy(el, "specifies") });
    sections.push({ label: "Realized by", neighbors: incomingBy(el, "realizes") });
    sections.push({ label: "Consumed by", neighbors: incomingBy(el, "consumes") });
    const contains = dedupe([...el.children()]).map(toNeighbor);
    const partOf = el.parent ? [toNeighbor(el.parent)] : [];
    sections.push({ label: "Part of", neighbors: partOf });
    sections.push({ label: "Contains", neighbors: contains });
  } else if (el.kind === "openSpecification") {
    sections.push({ label: "Specifies", neighbors: outgoingBy(el, "specifies") });
    sections.push({ label: "Implemented by", neighbors: incomingBy(el, "implements") });
    sections.push({ label: "Consumed by", neighbors: incomingBy(el, "consumes") });
  } else if (el.kind === "implementation") {
    sections.push({ label: "Implements", neighbors: outgoingBy(el, "implements") });
    sections.push({ label: "Realizes", neighbors: outgoingBy(el, "realizes") });
    sections.push({ label: "Consumed by", neighbors: incomingBy(el, "consumes") });
  }

  return sections.filter((s) => s.neighbors.length > 0);
}

function NeighborLinks({ neighbors }: { neighbors: Neighbor[] }) {
  return <MetaLinks items={neighbors} />;
}

// --- Metadata table (consolidates header badges + relationship sidebar) -----

interface ViewItem {
  id: string;
  title: string;
}

function ExplainMeta({
  el,
  sections,
  maturity,
  views,
}: {
  el: ElementModel;
  sections: ContextSection[];
  maturity?: string;
  views: ViewItem[];
}) {
  return (
    <div className="meta-table-wrap">
      <table className="meta-table">
        <tbody>
          {maturity && (
            <tr>
              <th scope="row">Maturity</th>
              <td>
                <span className={`maturity-badge maturity-${maturity}`}>
                  {maturity}
                </span>
              </td>
            </tr>
          )}
          {sections.map((section) => (
            <tr key={section.label}>
              <th scope="row">{section.label}</th>
              <td>
                <NeighborLinks neighbors={section.neighbors} />
              </td>
            </tr>
          ))}
          {el.links.length > 0 && (
            <tr>
              <th scope="row">Links</th>
              <td>
                <MetaLinks
                  items={el.links.map((link) => ({
                    id: link.url,
                    title: link.title ?? link.url,
                    href: null,
                    externalUrl: link.url,
                  }))}
                />
              </td>
            </tr>
          )}
          {views.length > 0 && (
            <tr>
              <td colSpan={2} className="meta-expand-cell">
                <Collapsible>
                  <CollapsibleTrigger className="meta-expand-row">
                    <span className="meta-expand-label">Appears in</span>
                    <span className="meta-view-count">
                      {views.length} {views.length === 1 ? "view" : "views"}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="meta-view-list">
                      {views.map((v) => (
                        <li key={v.id}>{v.title}</li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// --- Fallback body (no explainDoc) ------------------------------------------

function FallbackBody({ el }: { el: ElementModel }) {
  const summary = elementSummary(el);
  const description = el.description.isEmpty ? "" : el.description.text;
  const paragraphs = description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {summary && <p className="lead muted">{summary}</p>}
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {!summary && paragraphs.length === 0 && (
        <p className="muted">No explanation authored yet.</p>
      )}
    </>
  );
}

// --- Index ------------------------------------------------------------------

export function ExplainIndex() {
  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <ExplainSidebar />
        <div className="docs-main">
          <h1>Explain</h1>
          <p className="muted">
            The Open Lakehouse reference model as navigable explanations —
            capabilities, the open specifications that specify them, and the
            implementations that realize them, drawn live from the LikeC4 estate
            model.
          </p>
          {explainNav.map((cap) => (
            <section key={cap.id} className="nav-section">
              <h2>
                <Link to={explainHref(cap.id)}>{cap.title}</Link>
              </h2>
              {cap.summary && <p className="muted">{cap.summary}</p>}
              {cap.specs.length > 0 && (
                <ul className="draft-list compact">
                  {cap.specs.map((spec) => (
                    <li key={spec.id}>
                      <Link to={explainHref(spec.id)}>{spec.title}</Link>
                      {spec.implementations.length > 0 && (
                        <ul className="draft-list compact nested">
                          {spec.implementations.map((impl) => (
                            <li key={impl.id}>
                              <Link to={explainHref(impl.id)}>{impl.title}</Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {orphanSpecs.length > 0 && (
            <section className="nav-section">
              <h2>Other specifications</h2>
              <ul className="draft-list compact">
                {orphanSpecs.map((spec) => (
                  <li key={spec.id}>
                    <Link to={explainHref(spec.id)}>{spec.title}</Link>
                    {spec.implementations.length > 0 && (
                      <ul className="draft-list compact nested">
                        {spec.implementations.map((impl) => (
                          <li key={impl.id}>
                            <Link to={explainHref(impl.id)}>{impl.title}</Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {orphanImplementations.length > 0 && (
            <section className="nav-section">
              <h2>Implementations</h2>
              <ul className="draft-list compact">
                {orphanImplementations.map((impl) => (
                  <li key={impl.id}>
                    <Link to={explainHref(impl.id)}>{impl.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}

// --- Detail -----------------------------------------------------------------

const MATURITY_TAGS = ["built", "designed", "prototype"] as const;

export function ExplainPage() {
  const { elementId = "" } = useParams();
  const el = getExplainElement(elementId);
  const articleRef = useRef<HTMLElement>(null);

  // Lazy MDX body from `explainDoc`, recomputed per element.
  const DocBody = useMemo(() => {
    if (!el) return null;
    const loader = explainDocLoader(el);
    if (!loader) return null;
    return lazy(() => loader().then((m) => ({ default: m.default })));
  }, [el]);

  if (!el) {
    return (
      <Shell showSidebarToggle wide>
        <div className="docs-grid">
          <ExplainSidebar />
          <div className="docs-main">
            <p>
              Not found: explain/{elementId}.{" "}
              <Link to="/explain">Back to Explain.</Link>
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const maturity = MATURITY_TAGS.find((t) => el.tags.includes(t));
  const sections = contextSections(el);
  const backlinks = backlinksFor(elementId);
  const views: ViewItem[] = [...el.views()].map((v) => ({
    id: String(v.id),
    title: v.title ?? String(v.id),
  }));

  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <ExplainSidebar activeId={elementId} />
        <div className="docs-main">
          <header className="explain-header">
            <div className="explain-title-row">
              <h1>{el.title}</h1>
              <span className="kind-badge">{kindLabel(el.kind)}</span>
            </div>
          </header>

          <ExplainMeta
            el={el}
            sections={sections}
            maturity={maturity}
            views={views}
          />

          <article className="prose" ref={articleRef}>
            {DocBody ? (
              <Suspense fallback={<p className="muted">Loading…</p>}>
                <MdxProvider>
                  <DocBody />
                </MdxProvider>
              </Suspense>
            ) : (
              <FallbackBody el={el} />
            )}
          </article>

          <section className="explain-section">
            <h2 className="section-heading">In context</h2>
            <ExplainDiagram elementId={elementId} />
          </section>

          {backlinks.length > 0 &&
            (() => {
              // Group doc backlinks by Diátaxis so a concept page answers
              // "how do I learn / do / look up / understand this?"; blogs go in
              // their own subsection.
              const docBacklinks = backlinks.filter((p) => p.area === "docs");
              const blogBacklinks = backlinks.filter((p) => p.area === "blogs");
              const buckets = bucketByDiataxis(docBacklinks);
              return (
                <section className="explain-section">
                  <h3>Referenced by</h3>
                  {DIATAXIS_ORDER.filter((key) => buckets[key].length > 0).map(
                    (key) => (
                      <div key={key} className="nav-bucket">
                        <h4>{DIATAXIS_LABELS[key]}</h4>
                        <ul className="draft-list compact">
                          {buckets[key].map((page) => (
                            <li key={page.href}>
                              <Link to={page.href}>
                                {page.frontmatter.title ?? page.slug}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                  {blogBacklinks.length > 0 && (
                    <div className="nav-bucket">
                      <h4>From the blog</h4>
                      <ul className="draft-list compact">
                        {blogBacklinks.map((page) => (
                          <li key={page.href}>
                            <Link to={page.href}>
                              {page.frontmatter.title ?? page.slug}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })()}
        </div>
      </div>
    </Shell>
  );
}
