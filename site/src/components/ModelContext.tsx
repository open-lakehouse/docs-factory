// ModelContext — the estate-model context panel for a content page that is the
// canonical explanation of a C4 element (frontmatter `explains: <id>`).
//
// Renders the relationship meta table ("Specified by / Realized by / …"), the
// "In context" diagram, and the model-derived "Referenced by" index. The page's
// PROSE is the surrounding doc page; this component contributes only the model
// context that used to live on the standalone /explain/<id> route.

import type { ElementModel } from "likec4/model";
import { Link } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { backlinksFor } from "../backlinks";
import { getExplainElement, kindLabel } from "../explain";
import { explanationHref, hasExplanationPage } from "../explain-bindings";
import { bucketByDiataxis, DIATAXIS_LABELS, DIATAXIS_ORDER } from "../graph";
import ExplainDiagram from "./ExplainDiagram";
import MetaLinks from "./MetaLinks";

// --- Neighbor helpers (SDK-derived, deterministic) --------------------------

interface Neighbor {
  id: string;
  title: string;
  href: string | null;
  externalUrl: string | null;
}

/** Link an element to its explanation doc page when one exists, else its
 * external link. Resolved "by the relationships": there is no /explain route. */
function toNeighbor(el: ElementModel): Neighbor {
  const id = String(el.id);
  return {
    id,
    title: el.title,
    href: hasExplanationPage(id) ? explanationHref(id) : null,
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
  return dedupe([...el.incoming()].filter((r) => r.kind === kind).map((r) => r.source)).map(
    toNeighbor,
  );
}

function outgoingBy(el: ElementModel, kind: string): Neighbor[] {
  return dedupe([...el.outgoing()].filter((r) => r.kind === kind).map((r) => r.target)).map(
    toNeighbor,
  );
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

// --- Metadata table ---------------------------------------------------------

interface ViewItem {
  id: string;
  title: string;
}

const MATURITY_TAGS = ["built", "designed", "prototype"] as const;

function ModelMeta({
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
          <tr>
            <th scope="row">Concept</th>
            <td>
              <span className="kind-badge">{kindLabel(el.kind)}</span>
            </td>
          </tr>
          {maturity && (
            <tr>
              <th scope="row">Maturity</th>
              <td>
                <span className={`maturity-badge maturity-${maturity}`}>{maturity}</span>
              </td>
            </tr>
          )}
          {sections.map((section) => (
            <tr key={section.label}>
              <th scope="row">{section.label}</th>
              <td>
                <MetaLinks items={section.neighbors} />
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

// --- Panel ------------------------------------------------------------------

/** Which part of the model context to render. The compact `summary` meta table
 * sits at the top of the page; the richer `context` (diagram + backlinks) stays
 * at the bottom. */
type ModelContextSlot = "summary" | "context";

/**
 * The model-context panel for a doc page that `explains` element `id`. Renders
 * nothing if the id doesn't resolve to a page-worthy model element (so a stray
 * `explains:` never blows up the page). `selfHref` is the current page's href,
 * excluded from the "Referenced by" list so a page doesn't cite itself.
 *
 * `slot` selects which part renders so the summary can lead the page while the
 * diagram + backlinks trail it (see DocPage).
 */
export default function ModelContext({
  id,
  selfHref,
  slot = "context",
}: {
  id: string;
  selfHref?: string;
  slot?: ModelContextSlot;
}) {
  const el = getExplainElement(id);
  if (!el) return null;

  if (slot === "summary") {
    const maturity = MATURITY_TAGS.find((t) => el.tags.includes(t));
    const sections = contextSections(el);
    const views: ViewItem[] = [...el.views()].map((v) => ({
      id: String(v.id),
      title: v.title ?? String(v.id),
    }));
    return (
      <aside className="model-context model-context--summary">
        <ModelMeta el={el} sections={sections} maturity={maturity} views={views} />
      </aside>
    );
  }

  const backlinks = backlinksFor(id).filter((p) => p.href !== selfHref);
  const docBacklinks = backlinks.filter((p) => p.area === "docs");
  const blogBacklinks = backlinks.filter((p) => p.area === "blogs");
  const buckets = bucketByDiataxis(docBacklinks);

  return (
    <aside className="model-context">
      <section className="explain-section">
        <h2 className="section-heading">In context</h2>
        <ExplainDiagram elementId={id} />
      </section>

      {backlinks.length > 0 && (
        <section className="explain-section">
          <h3>Referenced by</h3>
          {DIATAXIS_ORDER.filter((key) => buckets[key].length > 0).map((key) => (
            <div key={key} className="nav-bucket">
              <h4>{DIATAXIS_LABELS[key]}</h4>
              <ul className="draft-list compact">
                {buckets[key].map((page) => (
                  <li key={page.href}>
                    <Link to={page.href}>{page.frontmatter.title ?? page.slug}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {blogBacklinks.length > 0 && (
            <div className="nav-bucket">
              <h4>From the blog</h4>
              <ul className="draft-list compact">
                {blogBacklinks.map((page) => (
                  <li key={page.href}>
                    <Link to={page.href}>{page.frontmatter.title ?? page.slug}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
