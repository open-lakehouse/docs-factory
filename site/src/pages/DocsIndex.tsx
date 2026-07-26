// DocsIndex — the single Docs landing page. It replaces the four separate
// Diátaxis axis pages (/tutorials, /how-to, /reference, /explanation) with one
// route (/docs) that stacks ALL four content tables, each under its own
// heading, and drives every table from ONE shared concept filter (the `?ref=`
// chips) plus the active site scope.
//
// The concept facet is the only vocabulary that spans docs uniformly:
// effectiveRefIds() (graph.ts) unions each page's `references:` and `explains:`
// ids (and, for blogs, tag→element). Doc pages carry no free-text topic tags,
// so the chips here are estate concepts, and toggling one filters every axis
// table at once (AND semantics across selected concepts).
//
// The `explanation` section additionally surfaces the LikeC4 estate concepts
// that have NO explanation page yet as reviewer-only "No explanation yet"
// coverage-gap rows — so the axis is the ground truth for what's explained AND
// what's still missing. Concepts that DO have a page are already represented by
// their content-page row (no duplicate). There is no /explain route: a concept's
// canonical URL is its doc page.
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, FileText } from "lucide-react";
import Shell from "../components/layout/Shell";
import DiataxisIcon from "../components/DiataxisIcon";
import SemanticChip from "../components/SemanticChip";
import ContentTable, { type ContentRow } from "../components/ContentTable";
import AuthorBadge from "../components/AuthorBadge";
import TagList from "../components/TagList";
import { pages } from "../content";
import {
  bucketByDiataxis,
  pagesByRefs,
  referencedConcepts,
  DIATAXIS_ORDER,
  type DiataxisKey,
} from "../graph";
import { explainEntries, kindLabel } from "../explain";
import { hasExplanationPage } from "../explain-bindings";
import { elementInScope, filterByScope, scopeAccent, useScope } from "../scope";
import {
  useContentVisibility,
  type ContentVisibility,
} from "../lib/content-visibility";
import type { ContentPage } from "../content";

interface AxisMeta {
  key: DiataxisKey;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}

export const AXES: Record<DiataxisKey, AxisMeta> = {
  tutorial: {
    key: "tutorial",
    title: "Tutorials",
    blurb: "Learning-oriented lessons that take you through building something end to end.",
    icon: <DiataxisIcon axis="tutorial" />,
  },
  "how-to": {
    key: "how-to",
    title: "How-to guides",
    blurb: "Task-oriented recipes for getting a specific job done.",
    icon: <DiataxisIcon axis="how-to" />,
  },
  reference: {
    key: "reference",
    title: "Reference",
    blurb: "Information-oriented, engine-neutral technical description.",
    icon: <DiataxisIcon axis="reference" />,
  },
  explanation: {
    key: "explanation",
    title: "Explanation",
    blurb:
      "Understanding-oriented discussion — authored explanation plus the Open Lakehouse reference model drawn live from the estate.",
    icon: <DiataxisIcon axis="explanation" />,
  },
};

function docDetail(page: ContentPage) {
  const fm = page.frontmatter;
  return (
    <div className="blog-detail">
      {fm.summary && <p className="blog-detail-summary">{fm.summary}</p>}
      <dl className="blog-meta-grid">
        {fm.project && (
          <div className="blog-meta">
            <dt>Project</dt>
            <dd className="mono">{fm.project}</dd>
          </div>
        )}
        {fm.author && (
          <div className="blog-meta">
            <dt>Author</dt>
            <dd>
              <AuthorBadge byline={fm.author} />
            </dd>
          </div>
        )}
        {fm.date && (
          <div className="blog-meta">
            <dt>Date</dt>
            <dd className="mono">{fm.date}</dd>
          </div>
        )}
        {fm.status && (
          <div className="blog-meta">
            <dt>Status</dt>
            <dd className="mono">{fm.status}</dd>
          </div>
        )}
        {fm.tags && fm.tags.length > 0 && (
          <div className="blog-meta blog-meta-wide">
            <dt>Tags</dt>
            <dd>
              <TagList tags={fm.tags} />
            </dd>
          </div>
        )}
      </dl>
      <Link to={page.href} className="blog-detail-cta">
        Read →
      </Link>
    </div>
  );
}

function docRow(page: ContentPage, vis: ContentVisibility): ContentRow {
  const fm = page.frontmatter;
  const status = vis.statusFor(page);
  return {
    id: `doc:${page.href}`,
    icon: <FileText className="blog-row-icon" aria-hidden="true" />,
    title: fm.title ?? page.slug,
    titleHref: page.href,
    author: fm.author ? <AuthorBadge byline={fm.author} /> : <span className="author-badge-empty">—</span>,
    date: fm.date,
    frontmatterStatus: status.frontmatter || page.project,
    reviewState: status.reviewState,
    detail: docDetail(page),
  };
}

/** Coverage-gap rows: estate concepts with no explanation page yet (explanation
 * axis only). Concepts that HAVE a page are already shown as their content-page
 * row, so they're excluded here to avoid duplicates. These rows are not
 * clickable — there's nothing to open until someone authors the page. */
function coverageGapRows(scopeId: string): ContentRow[] {
  return explainEntries
    .filter((e) => elementInScope(e.id, scopeId))
    .filter((e) => !hasExplanationPage(e.id))
    .map((e) => ({
      id: `model:${e.id}`,
      icon: <BookOpen className="blog-row-icon" aria-hidden="true" />,
      title: e.title,
      titleHref: undefined,
      author: <span className="author-badge-empty">—</span>,
      date: undefined,
      frontmatterStatus: "No explanation yet",
      detail: (
        <div className="blog-detail">
          {e.summary && <p className="blog-detail-summary">{e.summary}</p>}
          <p className="muted">
            {kindLabel(e.kind)} in the Open Lakehouse reference model — no
            explanation page authored yet.
          </p>
        </div>
      ),
    }));
}

/** One Diátaxis axis: a heading + blurb followed by its filtered content table.
 * Anchored by axis id so `/docs#how-to` (and breadcrumb jumps) land here. */
function AxisSection({
  axis,
  rows,
  showStatus,
  isLoading,
  faceted,
}: {
  axis: DiataxisKey;
  rows: ContentRow[];
  showStatus: boolean;
  isLoading: boolean;
  faceted: boolean;
}) {
  const meta = AXES[axis];
  return (
    <section id={axis} className="docs-axis-section">
      <div className="docs-axis-heading">
        {meta.icon}
        <h2>{meta.title}</h2>
      </div>
      <p className="muted">{meta.blurb}</p>
      {rows.length > 0 ? (
        <ContentTable rows={rows} showStatus={showStatus} />
      ) : (
        <p className="muted docs-axis-empty">
          {isLoading
            ? `Loading ${meta.title.toLowerCase()}…`
            : faceted
              ? `No ${meta.title.toLowerCase()} match the current filters.`
              : `No published ${meta.title.toLowerCase()} yet.`}
        </p>
      )}
    </section>
  );
}

export default function DocsIndex() {
  const { scopeId } = useScope();
  const vis = useContentVisibility();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeRefs = [
    ...new Set(searchParams.getAll("ref").map((r) => r.trim()).filter(Boolean)),
  ];
  const faceted = activeRefs.length > 0;

  const setFacet = (key: "ref", values: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    for (const v of values) next.append(key, v);
    setSearchParams(next, { replace: true });
  };
  const toggleRef = (id: string) =>
    setFacet("ref", activeRefs.includes(id) ? activeRefs.filter((r) => r !== id) : [...activeRefs, id]);
  const clearAll = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("ref");
    setSearchParams(next, { replace: true });
  };

  // Scope narrows first, then Diátaxis bucketing — both computed once and shared
  // across all four axis tables so the single filter header applies equally.
  const scoped = filterByScope(pages, scopeId);
  const bucketed = bucketByDiataxis(scoped);

  const rowsByAxis: Record<DiataxisKey, ContentRow[]> = {
    tutorial: [],
    "how-to": [],
    reference: [],
    explanation: [],
  };
  for (const axis of DIATAXIS_ORDER) {
    // Facet- then visibility-filter (anonymous viewers get only published
    // content; reviewers get everything — see useContentVisibility), sorted by
    // title. Then, on the explanation axis only, append the reviewer-only
    // coverage-gap rows when no facet is active.
    const filtered = vis
      .filterVisible(pagesByRefs(bucketed[axis], activeRefs))
      .slice()
      .sort((a, b) =>
        (a.frontmatter.title ?? a.slug).localeCompare(b.frontmatter.title ?? b.slug),
      );
    rowsByAxis[axis] = [
      ...filtered.map((page) => docRow(page, vis)),
      ...(vis.isAllowlisted && axis === "explanation" && !faceted
        ? coverageGapRows(scopeId)
        : []),
    ];
  }

  const conceptFacets = referencedConcepts("docs");
  const totalRows = DIATAXIS_ORDER.reduce((n, axis) => n + rowsByAxis[axis].length, 0);

  return (
    <Shell wide accent={scopeAccent(scopeId)}>
      <div className="docs-index">
        <div className="docs-index-header">
          <h1>Docs</h1>
          <p className="muted">
            Everything under <code>content/</code>, organized by Diátaxis —
            tutorials, how-to guides, reference, and explanation. Filter by
            concept to narrow every section at once.
          </p>

          <div className="docs-facets">
            <div className="blog-tags-section">
              <div className="blog-tags-heading">
                <p className="blog-tags-label">Concepts</p>
                {faceted && (
                  <button type="button" className="blog-tags-clear" onClick={clearAll}>
                    Clear all
                  </button>
                )}
              </div>
              <div className="tag-list">
                {conceptFacets.map((c) => (
                  <SemanticChip
                    key={c.id}
                    label={c.title}
                    active={activeRefs.includes(c.id)}
                    onToggle={() => toggleRef(c.id)}
                    card={{
                      title: c.title,
                      kindLabel: c.kindLabel,
                      summary: c.summary,
                      href: c.href ?? c.externalUrl,
                      externalUrl: c.href ? c.externalUrl : null,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {vis.isLoading && totalRows === 0 && <p className="muted">Loading docs…</p>}
          {!vis.isLoading && faceted && totalRows === 0 && (
            <p className="muted">No docs match the current filters.</p>
          )}
        </div>

        <div className="docs-index-body">
          {DIATAXIS_ORDER.map((axis) => (
            <AxisSection
              key={axis}
              axis={axis}
              rows={rowsByAxis[axis]}
              showStatus={vis.showStatusColumns}
              isLoading={vis.isLoading}
              faceted={faceted}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}
