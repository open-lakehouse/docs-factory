import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ElementModel } from "likec4/model";
import Shell from "./components/layout/Shell";
import ExplainSidebar from "./components/layout/ExplainSidebar";
import Breadcrumbs from "./components/layout/Breadcrumbs";
import ExplainDiagram from "./components/ExplainDiagram";
import MdxProvider from "./MdxProvider";
import {
  getExplainElement,
  explainDocLoader,
  elementSummary,
  explainHref,
  explainNav,
  orphanSpecs,
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
  }

  return sections.filter((s) => s.neighbors.length > 0);
}

function NeighborLinks({ neighbors }: { neighbors: Neighbor[] }) {
  return (
    <span className="meta-links">
      {neighbors.map((n) =>
        n.href ? (
          <Link key={n.id} to={n.href} className="meta-link">
            {n.title}
          </Link>
        ) : n.externalUrl ? (
          <a
            key={n.id}
            href={n.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="meta-link"
          >
            {n.title} ↗
          </a>
        ) : (
          <span key={n.id} className="meta-link meta-link-plain">
            {n.title}
          </span>
        ),
      )}
    </span>
  );
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
  const [viewsOpen, setViewsOpen] = useState(false);

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
                <span className="meta-links">
                  {el.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="meta-link"
                    >
                      {link.title ?? link.url} ↗
                    </a>
                  ))}
                </span>
              </td>
            </tr>
          )}
          {views.length > 0 && (
            <>
              <tr
                className="meta-expand-row"
                onClick={() => setViewsOpen((o) => !o)}
                aria-expanded={viewsOpen}
              >
                <th scope="row">
                  <span className="meta-expand-label">
                    {viewsOpen ? (
                      <ChevronDown className="meta-chevron" aria-hidden="true" />
                    ) : (
                      <ChevronRight
                        className="meta-chevron"
                        aria-hidden="true"
                      />
                    )}
                    Appears in
                  </span>
                </th>
                <td>
                  <span className="meta-view-count">
                    {views.length} {views.length === 1 ? "view" : "views"}
                  </span>
                </td>
              </tr>
              {viewsOpen && (
                <tr className="meta-expand-detail">
                  <td colSpan={2}>
                    <ul className="meta-view-list">
                      {views.map((v) => (
                        <li key={v.id}>{v.title}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </>
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
            capabilities and the open specifications that specify them, drawn
            live from the LikeC4 estate model.
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
  const views: ViewItem[] = [...el.views()].map((v) => ({
    id: String(v.id),
    title: v.title ?? String(v.id),
  }));

  return (
    <Shell showSidebarToggle wide>
      <div className="docs-grid docs-grid-index">
        <ExplainSidebar activeId={elementId} />
        <div className="docs-main">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Explain", href: "/explain" },
              { label: el.title, activeHref: explainHref(elementId) },
            ]}
          />
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
        </div>
      </div>
    </Shell>
  );
}
