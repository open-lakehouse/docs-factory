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
export const COVERAGE_VERSION = 2;

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
 * @typedef {{
 *   href: (page: {project: string, bucket: string, slug: string}, anchor: string | null) => string | null,
 *   scriptUrl: (gitPath: string) => string | null,
 *   drafts: boolean,
 *   pageTitle?: (page: {project: string, bucket: string, slug: string}) => string | null,
 * }} ReportOptions `href` returns null for a page the consumer doesn't publish;
 *   `pageTitle` names the example a proof links to.
 */

/**
 * One journeys × interfaces grid, counted per row, per column, and in total.
 * A row's bucket is the best of its cells. `totals`, when given, also counts
 * each row into a running total across grids.
 * @param {any} matrix
 * @param {{id: string, title: string, columns: string[], rows: string[]}} grid
 * @param {ReportOptions} options
 * @param {Record<CellBucket, number>} [totals]
 */
function gridReport(matrix, grid, { href, scriptUrl, drafts, pageTitle }, totals) {
  const ifaces = new Map(matrix.interfaces.map((i) => [i.key, i]));
  const journeys = new Map(matrix.journeys.map((j) => [j.id, j]));
  const groupCounts = emptyCounts();
  const columnCounts = new Map(grid.columns.map((key) => [key, emptyCounts()]));
  const rows = grid.rows.map((id) => {
    const journey = journeys.get(id);
    const variants = grid.columns.map((key) => {
      const iface = ifaces.get(key);
      const found = resolveCell(journey?.cells[key], drafts);
      columnCounts.get(key)[found.bucket]++;
      return {
        key,
        label: iface?.label ?? key,
        bucket: found.bucket,
        proofs: found.proofs.map((p) => ({
          href: href(p.page, p.anchor),
          page: pageTitle?.(p.page) ?? null,
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
    if (totals) totals[bucket]++;
    return { id, title: journey?.title ?? id, summary: journey?.summary ?? "", bucket, variants };
  });
  return {
    id: grid.id,
    title: grid.title,
    counts: groupCounts,
    // Per interface, so a matrix header can show each one's progress.
    columns: grid.columns.map((key) => ({
      key,
      label: ifaces.get(key)?.label ?? key,
      version: ifaces.get(key)?.version ?? null,
      counts: columnCounts.get(key),
    })),
    journeys: rows,
  };
}

/**
 * @param {any} matrix a compatibility.json
 * @param {any} engine one of `matrix.engines`
 * @param {ReportOptions} options
 */
export function engineReport(matrix, engine, options) {
  const { href } = options;
  const ifaces = new Map(matrix.interfaces.map((i) => [i.key, i]));
  const tables = new Map(matrix.tables.map((t) => [t.id, t]));
  const counts = emptyCounts();
  const groups = engine.groups.map((group) =>
    gridReport(
      matrix,
      {
        id: group.table,
        title: tables.get(group.table)?.title ?? group.table,
        columns: group.columns,
        rows: group.rows,
      },
      options,
      counts,
    ),
  );
  return {
    id: engine.id,
    // The heading a report sits under is the reader's name for the engine.
    title: engine.heading ?? engine.title,
    href: engine.page ? href(engine.page, engine.anchor ?? null) : null,
    interfaces: engine.interfaces.map((key) => ({
      key,
      label: ifaces.get(key)?.label ?? key,
      version: ifaces.get(key)?.version ?? null,
      via: ifaces.get(key)?.via ?? null,
      viaVersion: ifaces.get(key)?.viaVersion ?? null,
    })),
    counts,
    groups,
  };
}

/**
 * Every engine of a matrix, in its order.
 * @param {any} matrix
 * @param {ReportOptions} options
 */
export function coverageReports(matrix, options) {
  return (matrix.engines ?? []).map((engine) => engineReport(matrix, engine, options));
}

const ROLLUP = "asset:";

/**
 * The grid docsnip renders for `compat:asset:<id>`: every tabled journey on the
 * asset, under every interface a table shows it in, dropping the columns and
 * then the rows nothing answers (unless every one would go). Mirrors docsnip
 * `compat._rollup`, which counts a documented cell as silent unless it renders
 * drafts.
 */
function rollupGrid(matrix, asset, drafts) {
  const tabled = new Set(matrix.tables.flatMap((t) => t.rows));
  const rows = matrix.journeys
    .filter((j) => j.asset === asset && tabled.has(j.id))
    .map((j) => j.id);
  if (!rows.length) return null;
  const shown = new Set(
    matrix.tables.filter((t) => t.rows.some((r) => rows.includes(r))).flatMap((t) => t.columns),
  );
  const columns = matrix.interfaces.map((i) => i.key).filter((k) => shown.has(k));
  const journeys = new Map(matrix.journeys.map((j) => [j.id, j]));
  const says = (col, row) => {
    const bucket = resolveCell(journeys.get(row)?.cells[col], drafts).bucket;
    return bucket !== "unknown" && (drafts || bucket !== "documented");
  };
  const speaking = columns.filter((c) => rows.some((r) => says(c, r)));
  const cols = speaking.length ? speaking : columns;
  const kept = rows.filter((r) => cols.some((c) => says(c, r)));
  return { id: ROLLUP + asset, title: asset, columns: cols, rows: kept.length ? kept : rows };
}

/**
 * Every grid a `compat:<table>` or `compat:asset:<id>` embed can name, keyed by
 * that name: the matrix's tables and one rollup per asset its journeys act on.
 * @param {any} matrix
 * @param {ReportOptions} options
 */
export function tableReports(matrix, options) {
  const known = new Set(matrix.interfaces.map((i) => i.key));
  /** @type {Record<string, ReturnType<typeof gridReport>>} */
  const out = {};
  for (const t of matrix.tables ?? []) {
    out[t.id] = gridReport(
      matrix,
      { ...t, columns: t.columns.filter((c) => known.has(c)) },
      options,
    );
  }
  for (const asset of new Set(matrix.journeys.map((j) => j.asset).filter(Boolean))) {
    const grid = rollupGrid(matrix, asset, options.drafts);
    if (grid) out[grid.id] = gridReport(matrix, grid, options);
  }
  return out;
}
