// An engine's coverage report (content-core/coverage.mjs `engineReport`): a
// journeys × interfaces matrix per journey group, whose cells open the example
// and script behind them, and a hub grid of engines × groups.
//
// site/src/components/ and sites/docs-shell/src/components/ hold byte-identical
// copies of this file and engine-coverage.css;
// site/src/components/engine-coverage-view.test.ts fails when they differ.
import { Fragment, useEffect, useRef, useState } from "react";
import "./engine-coverage.css";

type Bucket = "proven" | "draft" | "documented" | "no" | "unknown";
type Counts = Record<Bucket, number>;

interface Proof {
  href: string | null;
  /** The proving page's title, when the consumer knows it. */
  page: string | null;
  script: string | null;
  api: string | null;
  note: string | null;
  fails: string | null;
  version: string | null;
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

interface Column {
  key: string;
  label: string;
  version: string | null;
  counts: Counts;
}

interface GroupReport {
  id: string;
  title: string;
  counts: Counts;
  columns: Column[];
  journeys: JourneyReport[];
}

export interface EngineReport {
  id: string;
  title: string;
  href: string | null;
  interfaces: { key: string; label: string; version: string | null }[];
  counts: Counts;
  groups: GroupReport[];
}

// Bar and ring order, and the legend's wording.
const SEGMENTS: { bucket: Bucket; label: string }[] = [
  { bucket: "proven", label: "Verified here" },
  { bucket: "draft", label: "Verified on a draft page" },
  { bucket: "documented", label: "Upstream docs only" },
  { bucket: "no", label: "Doesn't work" },
  { bucket: "unknown", label: "Not verified here" },
];
const LABEL = Object.fromEntries(SEGMENTS.map((s) => [s.bucket, s.label])) as Record<
  Bucket,
  string
>;

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

function share(c: Counts): number {
  const all = total(c);
  return all ? Math.round((c.proven / all) * 100) : 0;
}

/** The anchor a hub cell links to; one page can hold several engines' reports. */
export function groupAnchor(engine: string, group: string): string {
  return `coverage-${engine}-${group}`;
}

function Bar({ counts, label }: { counts: Counts; label?: string }) {
  return (
    <span
      className="cov-bar"
      role="img"
      aria-label={label ?? `${counts.proven} of ${total(counts)} verified`}
    >
      {SEGMENTS.map(({ bucket }) =>
        counts[bucket] && bucket !== "unknown" ? (
          <span
            key={bucket}
            className={`cov-seg cov-${bucket}`}
            style={{ flexGrow: counts[bucket] }}
          />
        ) : null,
      )}
      {counts.unknown > 0 && <span className="cov-seg" style={{ flexGrow: counts.unknown }} />}
    </span>
  );
}

const RING_R = 15.9155; // circumference 100, so dash lengths are percentages

function Ring({ counts, size = 64 }: { counts: Counts; size?: number }) {
  const all = total(counts) || 1;
  let offset = 0;
  return (
    <svg
      className="cov-ring"
      width={size}
      height={size}
      viewBox="0 0 36 36"
      role="img"
      aria-label={`${share(counts)}% verified`}
    >
      <circle className="cov-ring-track" cx="18" cy="18" r={RING_R} />
      {SEGMENTS.filter(({ bucket }) => bucket !== "unknown" && counts[bucket]).map(({ bucket }) => {
        const length = (counts[bucket] / all) * 100;
        const arc = (
          <circle
            key={bucket}
            className={`cov-ring-seg cov-${bucket}`}
            cx="18"
            cy="18"
            r={RING_R}
            strokeDasharray={`${length} ${100 - length}`}
            strokeDashoffset={25 - offset}
          />
        );
        offset += length;
        return arc;
      })}
      <text x="18" y="18" className="cov-ring-text">
        {share(counts)}%
      </text>
    </svg>
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
    <>
      {text.split(/`([^`]+)`/).map((part, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: a static split of one string
        i % 2 ? <code key={i}>{part}</code> : part,
      )}
    </>
  );
}

function Detail({ journey, variant }: { journey: JourneyReport; variant: Variant }) {
  return (
    <div className="cov-detail">
      <p className="cov-detail-head">
        <span className={`cov-cell cov-${variant.bucket}`} aria-hidden="true">
          {MARK[variant.bucket]}
        </span>
        <strong>{variant.label}</strong> · {LABEL[variant.bucket]}
      </p>
      {journey.summary && <p className="cov-note">{journey.summary}</p>}
      {variant.proofs.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: proofs have no id and never reorder
        <div key={i} className="cov-proof">
          {p.api && <code>{p.api}</code>}
          {p.version && <span className="cov-num">{p.version}</span>}
          {p.href && (
            <a className="cov-action" href={p.href}>
              {p.page ? `Example: ${p.page}` : "See the example"}
            </a>
          )}
          {p.script && (
            <a className="cov-action" href={p.script} download>
              Download the script
            </a>
          )}
          {p.draft && <span className="cov-badge">draft page</span>}
          {p.fails && (
            <span className="cov-note">
              Fails with <code>{p.fails}</code>
            </span>
          )}
          {p.note && (
            <span className="cov-note">
              <Prose text={p.note} />
            </span>
          )}
        </div>
      ))}
      {variant.proofs.length === 0 &&
        variant.evidence.map((e, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: evidence has no id and never reorders
          <div key={i} className="cov-proof">
            {e.api && !e.why.includes(e.api) && <code>{e.api}</code>}
            <span className="cov-note">
              <Prose text={e.why} />
            </span>
            {e.href && (
              <a className="cov-action" href={e.href}>
                Source
              </a>
            )}
          </div>
        ))}
      {variant.bucket === "unknown" && (
        <p className="cov-note">
          No example on this site runs this. The tool may still support it.
        </p>
      )}
    </div>
  );
}

function GroupMatrix({
  engine,
  group,
  gapsOnly,
}: {
  engine: string;
  group: GroupReport;
  gapsOnly: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const rows = gapsOnly
    ? group.journeys.filter((j) => j.variants.some((v) => v.bucket !== "proven"))
    : group.journeys;
  const id = groupAnchor(engine, group.id);
  const details = useRef<HTMLDetailsElement>(null);
  // Groups start collapsed; one the overview links to opens on arrival.
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${id}` && details.current) {
        details.current.open = true;
        details.current.scrollIntoView();
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id]);
  return (
    <details className="cov-group" id={id} ref={details}>
      <summary>
        <span className="cov-group-title">{group.title}</span>
        <Bar counts={group.counts} />
        <span className="cov-num">
          {group.counts.proven}/{total(group.counts)}
        </span>
      </summary>
      {rows.length === 0 ? (
        <p className="cov-empty">Every journey here is verified.</p>
      ) : (
        <div className="cov-scroll">
          <table className="cov-matrix">
            <thead>
              <tr>
                <th scope="col">Journey</th>
                {group.columns.map((c) => (
                  <th key={c.key} scope="col">
                    <span className="cov-col-label">{c.label}</span>
                    {c.version && <span className="cov-num"> {c.version}</span>}
                    <span className="cov-col-stat">
                      <Bar counts={c.counts} />
                      <span className="cov-num">
                        {c.counts.proven}/{total(c.counts)}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((journey) => {
                const open = journey.variants.find((v) => `${journey.id}:${v.key}` === selected);
                // A click anywhere on the row opens it: on a cell, that interface;
                // elsewhere, the first one with something to show.
                const fallback =
                  journey.variants.find((v) => v.bucket !== "unknown") ?? journey.variants[0];
                const toggle = (key: string | undefined) => {
                  const id = `${journey.id}:${key ?? fallback?.key}`;
                  setSelected(open && (!key || selected === id) ? null : id);
                };
                return (
                  <Fragment key={journey.id}>
                    <tr
                      className={`cov-row${open ? " is-open" : ""}`}
                      onClick={(e) =>
                        toggle(
                          (e.target as HTMLElement).closest<HTMLElement>("[data-variant]")?.dataset
                            .variant,
                        )
                      }
                    >
                      <th scope="row" title={journey.summary}>
                        {journey.title}
                      </th>
                      {journey.variants.map((v) => {
                        const id = `${journey.id}:${v.key}`;
                        return (
                          <td key={v.key} data-variant={v.key}>
                            <button
                              type="button"
                              className={`cov-cell cov-${v.bucket}${selected === id ? " is-selected" : ""}`}
                              aria-expanded={selected === id}
                              aria-label={`${journey.title}, ${v.label}: ${LABEL[v.bucket]}`}
                              title={LABEL[v.bucket]}
                            >
                              {MARK[v.bucket]}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                    {open && (
                      <tr className="cov-detail-row">
                        <td colSpan={group.columns.length + 1}>
                          <Detail journey={journey} variant={open} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export function EngineCoverageView({ report }: { report: EngineReport }) {
  const [gapsOnly, setGapsOnly] = useState(false);
  return (
    <section className="cov" aria-label={`${report.title} coverage`}>
      <header className="cov-head">
        <Ring counts={report.counts} />
        <div className="cov-head-text">
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
          <Legend counts={report.counts} />
        </div>
      </header>
      <div className="cov-toolbar">
        <label className="cov-toggle">
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setGapsOnly(e.target.checked)}
          />
          Only journeys not verified here
        </label>
        <span className="cov-hint">Select a cell to see its example and script.</span>
      </div>
      {report.groups.map((group) => (
        <GroupMatrix key={group.id} engine={report.id} group={group} gapsOnly={gapsOnly} />
      ))}
    </section>
  );
}

export function EngineSupportView({ reports }: { reports: EngineReport[] }) {
  const groups = new Map<string, string>();
  for (const r of reports) for (const g of r.groups) groups.set(g.id, g.title);
  return (
    <div className="cov cov-hub">
      <div className="cov-scroll">
        <table className="cov-matrix cov-hub-matrix">
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Overall</th>
              {[...groups].map(([id, title]) => (
                <th key={id} scope="col">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.href ? <a href={r.href}>{r.title}</a> : r.title}
                  <span className="cov-ifaces">
                    {[...new Set(r.interfaces.map((i) => i.label))].join(", ")}
                  </span>
                </th>
                <td className="cov-hub-overall">
                  <Ring counts={r.counts} size={40} />
                  <span className="cov-num">
                    {r.counts.proven}/{total(r.counts)}
                  </span>
                </td>
                {[...groups.keys()].map((id) => {
                  const g = r.groups.find((x) => x.id === id);
                  if (!g) return <td key={id} className="cov-hub-na" aria-label="Not applicable" />;
                  const body = (
                    <>
                      <Bar counts={g.counts} />
                      <span className="cov-num">
                        {g.counts.proven}/{total(g.counts)}
                      </span>
                    </>
                  );
                  return (
                    <td key={id}>
                      {r.href ? (
                        <a
                          className="cov-hub-cell"
                          href={`${r.href.split("#")[0]}#${groupAnchor(r.id, id)}`}
                        >
                          {body}
                        </a>
                      ) : (
                        <span className="cov-hub-cell">{body}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend counts={sum(reports.map((r) => r.counts))} />
    </div>
  );
}

function sum(all: Counts[]): Counts {
  const out: Counts = { proven: 0, draft: 0, documented: 0, no: 0, unknown: 0 };
  for (const c of all) for (const k of Object.keys(out) as Bucket[]) out[k] += c[k];
  return out;
}
