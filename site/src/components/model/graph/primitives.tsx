// What every journey-graph page shares: an href and a link per entity kind, and
// the marks that summarize cells (bucket badge, stacked bar, answered ring).
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CompatCoverageCounts } from "../../../compat";
import { catalog } from "../../../estate";
import { likec4model } from "../../../explain";
import { answered, BUCKETS, type Bucket, type BucketCounts } from "../../../lib/estate-graph";

export const implHref = (id: string) => `/model/implementations/${encodeURIComponent(id)}`;
export const journeyHref = (id: string) => `/model/journeys/${encodeURIComponent(id)}`;
export const specHref = (id: string) => `/model/specs/${encodeURIComponent(id)}`;
export const pathHref = (id: string) => `/model/paths/${encodeURIComponent(id)}`;
export const elementHref = (id: string) => `/model?el=${encodeURIComponent(id)}`;

const titleOf = (id: string) => likec4model.findElement(id)?.title ?? id;

/** A model element: its implementation or spec page when it has one, else the explorer. */
export function ElementRef({ id }: { id: string }) {
  const kind = likec4model.findElement(id)?.kind;
  const to =
    kind === "implementation"
      ? implHref(id)
      : kind === "openSpecification" && catalog.specs[id]
        ? specHref(id)
        : elementHref(id);
  return (
    <Link to={to} className="graph-link">
      {titleOf(id)}
    </Link>
  );
}

export function JourneyRef({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <Link to={journeyHref(id)} className="graph-link">
      {children ?? catalog.journeys[id]?.title ?? id}
    </Link>
  );
}

export function PathRef({ id }: { id: string }) {
  return (
    <Link to={pathHref(id)} className="graph-path">
      {id}
    </Link>
  );
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  tested: "tested",
  draft: "draft claim",
  documented: "documented",
  fails: "fails",
  missing: "missing",
  blocked: "blocked by a server",
  unknown: "unknown",
};

const BUCKET_MARK: Record<Bucket, string> = {
  tested: "✓",
  draft: "✓",
  documented: "docs",
  fails: "✗",
  missing: "✗",
  blocked: "⊘",
  unknown: "—",
};

export function BucketMark({ bucket }: { bucket: Bucket }) {
  return (
    <span className={`compat-cell compat-${bucket}`} title={BUCKET_LABEL[bucket]}>
      {BUCKET_MARK[bucket]}
    </span>
  );
}

/** One stacked bar of bucket counts, unknown last. */
export function BucketBar({ counts }: { counts: BucketCounts }) {
  const total = BUCKETS.reduce((n, b) => n + counts[b], 0);
  if (total === 0) return <span className="muted text-xs">no cells</span>;
  return (
    <span className="graph-bar-wrap">
      <span className="graph-bar" role="img" aria-label={barLabel(counts)}>
        {BUCKETS.filter((b) => counts[b] > 0).map((b) => (
          <span
            key={b}
            className={`graph-bar-${b}`}
            style={{ flexGrow: counts[b] }}
            title={`${counts[b]} ${BUCKET_LABEL[b]}`}
          />
        ))}
      </span>
      <span className="graph-bar-legend">
        {counts.tested} of {total} tested
      </span>
    </span>
  );
}

const barLabel = (counts: BucketCounts) =>
  BUCKETS.filter((b) => counts[b] > 0)
    .map((b) => `${counts[b]} ${BUCKET_LABEL[b]}`)
    .join(", ");

/** A role's answered share of a spec's obligations, as a ring. */
export function CoverageRing({
  counts,
  label,
  to,
}: {
  counts: CompatCoverageCounts;
  label: string;
  to?: string;
}) {
  const { answered: done, total } = answered(counts);
  const share = total ? done / total : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  const ring = (
    <span className="graph-ring" title={ringTitle(counts, total)}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="graph-ring-track" />
        <circle
          cx="18"
          cy="18"
          r={r}
          className="graph-ring-value"
          strokeDasharray={`${share * c} ${c}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="graph-ring-text">
        <strong>
          {done}/{total}
        </strong>
        <span>{label}</span>
      </span>
    </span>
  );
  return to ? (
    <Link to={to} className="graph-ring-link">
      {ring}
    </Link>
  ) : (
    ring
  );
}

const ringTitle = (n: CompatCoverageCounts, total: number) =>
  `${total} obligations: ${n.tested} tested, ${n.documented} documented, ` +
  `${n.fails + n.missing} fail or missing, ${n.blocked} blocked, ` +
  `${n.unknown} unknown, ${n.untracked} untracked`;

export function GraphSection({
  title,
  count,
  intro,
  children,
}: {
  title: string;
  count?: number;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="graph-section">
      <h2>
        {title} {count !== undefined && <span className="plan-chip-count">{count}</span>}
      </h2>
      {intro && <p className="muted text-sm">{intro}</p>}
      {children}
    </section>
  );
}
