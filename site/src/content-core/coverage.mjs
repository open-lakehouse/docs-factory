/**
 * An engine's coverage report, counted from a resolved compatibility matrix
 * (content/<project>/compatibility.json). docsnip owns which journeys apply to
 * an engine (`matrix.engines`); this module only counts and links them, because
 * what counts depends on what the consumer publishes: the docs sites drop draft
 * claims unless they emit drafts, and the review app keeps them.
 *
 * Pure and browser-safe: the docs emitter writes a site's coverage.json with it,
 * and the review app renders the same report in its preview.
 */

export const COVERAGE_FORMAT = "docs-factory-coverage";
export const COVERAGE_VERSION = 1;

/**
 * `proven`: a ready page's script shows it; `draft`: only a draft page does;
 * `documented`: upstream docs say so, untested here; `no`: known to fail or
 * lack the API; `unknown`: nothing says anything.
 * @typedef {"proven" | "draft" | "documented" | "no" | "unknown"} CellBucket
 */

/** Best first: what a journey shows when an engine has several interfaces. */
export const BUCKETS = /** @type {const} */ (["proven", "no", "documented", "draft", "unknown"]);

/** @returns {Record<CellBucket, number>} */
export function emptyCounts() {
  return { proven: 0, draft: 0, documented: 0, no: 0, unknown: 0 };
}

/**
 * A cell as the review app sees it: draft claims included.
 * @param {{status: string, draft: boolean} | undefined} cell
 * @returns {CellBucket}
 */
export function bucketOf(cell) {
  if (!cell) return "unknown";
  switch (cell.status) {
    case "tested":
      return cell.draft ? "draft" : "proven";
    case "documented":
      return "documented";
    case "fails":
    case "missing":
      return "no";
    default:
      return "unknown";
  }
}

/**
 * The claims a cell counts and its bucket. Mirrors docsnip `compat.cell`: ready
 * claims beat draft claims (only with `drafts`), which beat evidence.
 */
function resolveCell(cell, drafts) {
  if (!cell) return { bucket: "unknown", proofs: [], evidence: [] };
  const ready = cell.proofs.filter((p) => p.ready);
  const counted = ready.length ? ready : drafts ? cell.proofs.filter((p) => !p.ready) : [];
  if (counted.length) {
    const works = counted[0].works;
    const bucket = works ? (counted[0].ready ? "proven" : "draft") : "no";
    return { bucket, proofs: counted.filter((p) => p.works === works), evidence: cell.evidence };
  }
  const ev = cell.evidence[0];
  if (ev)
    return {
      bucket: ev.outcome === "works" ? "documented" : "no",
      proofs: [],
      evidence: cell.evidence,
    };
  return { bucket: "unknown", proofs: [], evidence: [] };
}

function evidenceHref(ev, href) {
  if (/^https?:\/\//.test(ev.source)) return ev.source;
  return ev.page ? href(ev.page, ev.source.split("#")[1] || null) : null;
}

/**
 * @param {any} matrix a compatibility.json
 * @param {any} engine one of `matrix.engines`
 * @param {{
 *   href: (page: {project: string, bucket: string, slug: string}, anchor: string | null) => string | null,
 *   scriptUrl: (gitPath: string) => string | null,
 *   drafts: boolean,
 * }} options `href` returns null for a page the consumer doesn't publish.
 */
export function engineReport(matrix, engine, { href, scriptUrl, drafts }) {
  const ifaces = new Map(matrix.interfaces.map((i) => [i.key, i]));
  const journeys = new Map(matrix.journeys.map((j) => [j.id, j]));
  const tables = new Map(matrix.tables.map((t) => [t.id, t]));
  const counts = emptyCounts();
  const groups = engine.groups.map((group) => {
    const groupCounts = emptyCounts();
    const columnCounts = new Map(group.columns.map((key) => [key, emptyCounts()]));
    const rows = group.rows.map((id) => {
      const journey = journeys.get(id);
      const variants = group.columns.map((key) => {
        const iface = ifaces.get(key);
        const found = resolveCell(journey?.cells[key], drafts);
        columnCounts.get(key)[found.bucket]++;
        return {
          key,
          label: iface?.label ?? key,
          bucket: found.bucket,
          proofs: found.proofs.map((p) => ({
            href: href(p.page, p.anchor),
            script: scriptUrl(p.script),
            api: p.api,
            note: p.note,
            fails: p.fails,
            version: p.version,
            draft: !p.ready,
          })),
          evidence: found.evidence.map((e) => ({
            outcome: e.outcome,
            why: e.why,
            href: evidenceHref(e, href),
            api: e.api,
          })),
        };
      });
      const bucket = BUCKETS.find((b) => variants.some((v) => v.bucket === b)) ?? "unknown";
      groupCounts[bucket]++;
      counts[bucket]++;
      return { id, title: journey?.title ?? id, summary: journey?.summary ?? "", bucket, variants };
    });
    return {
      id: group.table,
      title: tables.get(group.table)?.title ?? group.table,
      counts: groupCounts,
      // Per interface, so a matrix header can show each one's progress.
      columns: group.columns.map((key) => ({
        key,
        label: ifaces.get(key)?.label ?? key,
        version: ifaces.get(key)?.version ?? null,
        counts: columnCounts.get(key),
      })),
      journeys: rows,
    };
  });
  return {
    id: engine.id,
    title: engine.title,
    href: engine.page ? href(engine.page, null) : null,
    interfaces: engine.interfaces.map((key) => ({
      key,
      label: ifaces.get(key)?.label ?? key,
      version: ifaces.get(key)?.version ?? null,
    })),
    counts,
    groups,
  };
}

/**
 * Every engine of a matrix, in its order.
 * @param {any} matrix
 * @param {Parameters<typeof engineReport>[2]} options
 */
export function coverageReports(matrix, options) {
  return (matrix.engines ?? []).map((engine) => engineReport(matrix, engine, options));
}
