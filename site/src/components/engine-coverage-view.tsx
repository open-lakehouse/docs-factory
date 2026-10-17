// An engine's coverage report (content-core/coverage.mjs `engineReport`):
// a bar per journey group, expandable to each journey's proof links.
//
// site/src/components/ and sites/docs-shell/src/components/ hold byte-identical
// copies of this file and engine-coverage.css;
// site/src/components/engine-coverage-view.test.ts fails when they differ.
import "./engine-coverage.css";

type Bucket = "proven" | "draft" | "documented" | "no" | "unknown";
type Counts = Record<Bucket, number>;

interface Proof {
  href: string | null;
  script: string | null;
  api: string | null;
  note: string | null;
  fails: string | null;
  draft: boolean;
}

interface Evidence {
  outcome: "works" | "fails" | "missing";
  why: string;
  href: string | null;
  api: string | null;
}

interface Variant {
  key: string;
  label: string;
  bucket: Bucket;
  proofs: Proof[];
  evidence: Evidence[];
}

interface JourneyReport {
  id: string;
  title: string;
  summary: string;
  bucket: Bucket;
  variants: Variant[];
}

export interface EngineReport {
  id: string;
  title: string;
  href: string | null;
  interfaces: { key: string; label: string; version: string | null }[];
  counts: Counts;
  groups: { id: string; title: string; counts: Counts; journeys: JourneyReport[] }[];
}

// Bar order, left to right.
const SEGMENTS: { bucket: Bucket; label: string }[] = [
  { bucket: "proven", label: "Verified here" },
  { bucket: "draft", label: "Verified on a draft page" },
  { bucket: "documented", label: "Upstream docs only" },
  { bucket: "no", label: "Doesn't work" },
  { bucket: "unknown", label: "Not yet verified" },
];

const MARK: Record<Bucket, string> = {
  proven: "✓",
  draft: "✓",
  documented: "docs",
  no: "✗",
  unknown: "—",
};

function total(c: Counts): number {
  return c.proven + c.draft + c.documented + c.no + c.unknown;
}

function Bar({ counts }: { counts: Counts }) {
  const all = total(counts);
  return (
    <span className="cov-bar" role="img" aria-label={`${counts.proven} of ${all} verified`}>
      {SEGMENTS.map(({ bucket }) =>
        counts[bucket] ? (
          <span
            key={bucket}
            className={`cov-seg cov-${bucket}`}
            style={{ flexGrow: counts[bucket] }}
          />
        ) : null,
      )}
    </span>
  );
}

function Legend({ counts }: { counts: Counts }) {
  return (
    <ul className="cov-legend">
      {SEGMENTS.filter(({ bucket }) => counts[bucket]).map(({ bucket, label }) => (
        <li key={bucket}>
          <span className={`cov-swatch cov-${bucket}`} />
          {label} <span className="cov-num">{counts[bucket]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Evidence and notes are authored Markdown; only their `code` spans matter here. */
function Prose({ text }: { text: string }) {
  return (
    <span className="cov-note">
      {text.split(/`([^`]+)`/).map((part, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: a static split of one string
        i % 2 ? <code key={i}>{part}</code> : part,
      )}
    </span>
  );
}

function VariantLinks({ variant }: { variant: Variant }) {
  const proof = variant.proofs[0];
  if (proof) {
    return (
      <>
        {proof.api && <code>{proof.api}</code>}
        {proof.href && <a href={proof.href}>Example</a>}
        {proof.script && (
          <a href={proof.script} download>
            Script
          </a>
        )}
        {proof.fails && (
          <span className="cov-note">
            Fails with <code>{proof.fails}</code>
          </span>
        )}
        {proof.note && <Prose text={proof.note} />}
      </>
    );
  }
  const ev = variant.evidence[0];
  if (!ev) return null;
  return (
    <>
      {ev.api && !ev.why.includes(ev.api) && <code>{ev.api}</code>}
      <Prose text={ev.why} />
      {ev.href && <a href={ev.href}>Source</a>}
    </>
  );
}

function JourneyRow({ journey, labels }: { journey: JourneyReport; labels: boolean }) {
  const answered = journey.variants.filter((v) => v.bucket !== "unknown");
  return (
    <li className="cov-journey">
      <span className={`cov-mark cov-${journey.bucket}`}>{MARK[journey.bucket]}</span>
      <div>
        <span className="cov-journey-title" title={journey.summary}>
          {journey.title}
        </span>
        {answered.map((v) => (
          <div key={v.key} className="cov-variant">
            {labels && (
              <span className={`cov-tag cov-${v.bucket}`}>
                {MARK[v.bucket]} {v.label}
              </span>
            )}
            <VariantLinks variant={v} />
          </div>
        ))}
      </div>
    </li>
  );
}

export function EngineCoverageView({ report }: { report: EngineReport }) {
  const labels = new Set(report.interfaces.map((i) => i.label)).size > 1;
  return (
    <section className="cov" aria-label={`${report.title} coverage`}>
      <header className="cov-head">
        <p className="cov-summary">
          <strong>{report.counts.proven}</strong> of {total(report.counts)} journeys verified here
        </p>
        <p className="cov-ifaces">
          {report.interfaces.map((i) => (
            <span key={i.key} className="cov-iface">
              {i.label}
              {i.version && <span className="cov-num"> {i.version}</span>}
            </span>
          ))}
        </p>
        <Bar counts={report.counts} />
        <Legend counts={report.counts} />
      </header>
      {report.groups.map((group) => (
        <details key={group.id} className="cov-group">
          <summary>
            <span className="cov-group-title">{group.title}</span>
            <Bar counts={group.counts} />
            <span className="cov-num">
              {group.counts.proven}/{total(group.counts)}
            </span>
          </summary>
          <ul className="cov-journeys">
            {group.journeys.map((j) => (
              <JourneyRow key={j.id} journey={j} labels={labels} />
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

export function EngineSupportView({ reports }: { reports: EngineReport[] }) {
  return (
    <ul className="cov-hub">
      {reports.map((r) => (
        <li key={r.id}>
          {r.href ? <a href={r.href}>{r.title}</a> : <span>{r.title}</span>}
          <span className="cov-ifaces">
            {[...new Set(r.interfaces.map((i) => i.label))].join(", ")}
          </span>
          <Bar counts={r.counts} />
          <span className="cov-num">
            {r.counts.proven}/{total(r.counts)}
          </span>
        </li>
      ))}
    </ul>
  );
}
