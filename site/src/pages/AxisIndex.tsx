// AxisIndex — the shared index for the four Diátaxis axes (tutorials, how-to,
// reference, explanation). Each axis lists ALL content of that Diátaxis type
// across projects as the same expandable table the blog uses, filtered by the
// active site scope (breadcrumb root) and the concept/engine facet chips
// carried over from the old /docs index.
//
// The `explanation` axis lists authored explanation pages like any other axis.
// It additionally surfaces the LikeC4 estate concepts (capabilities /
// specifications / implementations) that have NO explanation page yet as
// explicit "No explanation yet" coverage-gap rows — so the axis is the ground
// truth for what's explained AND what's still missing. Concepts that DO have a
// page are already represented by their content-page row (no duplicate). There
// is no /explain route: a concept's canonical URL is its doc page.
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, FileText, GraduationCap, Library, Wrench } from "lucide-react";
import Shell from "../components/layout/Shell";
import SemanticChip from "../components/SemanticChip";
import ContentTable, { type ContentRow } from "../components/ContentTable";
import AuthorBadge from "../components/AuthorBadge";
import TagList from "../components/TagList";
import { pages } from "../content";
import {
  bucketByDiataxis,
  pagesByRefs,
  referencedConcepts,
  type DiataxisKey,
} from "../graph";
import { explainEntries, kindLabel } from "../explain";
import { hasExplanationPage } from "../explain-bindings";
import {
  elementInScope,
  filterByScope,
  scopeAccent,
  useScope,
} from "../scope";
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
    icon: <GraduationCap className="blog-row-icon" aria-hidden="true" />,
  },
  "how-to": {
    key: "how-to",
    title: "How-to guides",
    blurb: "Task-oriented recipes for getting a specific job done.",
    icon: <Wrench className="blog-row-icon" aria-hidden="true" />,
  },
  reference: {
    key: "reference",
    title: "Reference",
    blurb: "Information-oriented, engine-neutral technical description.",
    icon: <Library className="blog-row-icon" aria-hidden="true" />,
  },
  explanation: {
    key: "explanation",
    title: "Explanation",
    blurb:
      "Understanding-oriented discussion — authored explanation plus the Open Lakehouse reference model drawn live from the estate.",
    icon: <BookOpen className="blog-row-icon" aria-hidden="true" />,
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

export default function AxisIndex({ axis }: { axis: DiataxisKey }) {
  const meta = AXES[axis];
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

  // Content pages of this Diátaxis type, scope- then facet-filtered, then
  // narrowed to what the current viewer may see (anonymous viewers get only
  // published content; reviewers get everything — see useContentVisibility).
  const scoped = filterByScope(pages, scopeId);
  const bucketed = bucketByDiataxis(scoped)[axis];
  const filtered = vis
    .filterVisible(pagesByRefs(bucketed, activeRefs))
    .slice()
    .sort((a, b) =>
      (a.frontmatter.title ?? a.slug).localeCompare(b.frontmatter.title ?? b.slug),
    );

  const conceptFacets = referencedConcepts("docs");
  const rows: ContentRow[] = [
    ...filtered.map((page) => docRow(page, vis)),
    // Coverage-gap rows are an authoring/review aid (what's still unexplained),
    // so they appear only for allowlisted viewers, only on the explanation axis,
    // and only when facets (which key off content pages) are not active.
    ...(vis.isAllowlisted && axis === "explanation" && !faceted
      ? coverageGapRows(scopeId)
      : []),
  ];

  return (
    <Shell wide accent={scopeAccent(scopeId)}>
      <div className="index-scroll-layout">
        <div className="index-scroll-header">
          <h1>{meta.title}</h1>
          <p className="muted">{meta.blurb}</p>

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

          {vis.isLoading && rows.length === 0 && (
            <p className="muted">Loading {meta.title.toLowerCase()}…</p>
          )}
          {!vis.isLoading && rows.length === 0 && (
            <p className="muted">
              {faceted
                ? `No ${meta.title.toLowerCase()} match the current filters.`
                : `No published ${meta.title.toLowerCase()} yet.`}
            </p>
          )}
        </div>

        {rows.length > 0 && (
          <div className="index-scroll-body">
            <ContentTable rows={rows} showStatus={vis.showStatusColumns} />
          </div>
        )}
      </div>
    </Shell>
  );
}
