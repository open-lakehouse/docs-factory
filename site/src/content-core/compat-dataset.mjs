/**
 * The compatibility matrices (content/<project>/compatibility.json) as one tidy
 * dataset: a row per project × journey × interface in scope, with flat
 * dimensions and measures so a table can sort, filter, group, and pivot any of
 * them. compatibility.json stays the source; this is a projection of it.
 *
 * Pure and browser-safe.
 */

import { bucketOf, emptyCounts } from "./coverage.mjs";

/**
 * @typedef {import("./coverage.mjs").CellBucket} CellBucket
 *
 * @typedef {object} CompatRow
 * @property {string} id `<project>/<journey>/<interface>`
 * @property {string} project
 * @property {string} journey
 * @property {string} journeyTitle
 * @property {string} summary
 * @property {string | null} family
 * @property {string | null} asset
 * @property {string[]} tables ids of the `tables[]` placing this journey × interface
 * @property {string[]} assetGroups ids of the `assets[]` placing it
 * @property {string | null} featureSpec
 * @property {string | null} featureName
 * @property {string | null} featureSince
 * @property {string | null} featureKey `<spec>:<since>`, as compat-stats `featureKey`
 * @property {string | null} request
 * @property {string} interface
 * @property {string} interfaceLabel
 * @property {string | null} interfaceVersion
 * @property {string | null} package
 * @property {string | null} via
 * @property {string | null} engine model id
 * @property {string | null} engineTitle
 * @property {string} status
 * @property {CellBucket} bucket
 * @property {boolean} draft
 * @property {number} proofCount
 * @property {number} readyProofCount
 * @property {number} evidenceCount
 * @property {string | null} testedVersion
 * @property {string | null} api
 * @property {any} source the raw `{ matrix, journey, iface, cell }`; `cell` is null when absent
 */

/**
 * @typedef {object} Dimension
 * @property {keyof CompatRow} id
 * @property {string} label
 * @property {"dimension" | "measure"} kind
 * @property {boolean} groupable
 */

/** @type {Dimension[]} */
export const COMPAT_DIMENSIONS = [
  { id: "project", label: "Project", kind: "dimension", groupable: true },
  { id: "journey", label: "Journey", kind: "dimension", groupable: false },
  { id: "family", label: "Family", kind: "dimension", groupable: true },
  { id: "asset", label: "Asset", kind: "dimension", groupable: true },
  { id: "tables", label: "Table", kind: "dimension", groupable: true },
  { id: "featureKey", label: "Spec version", kind: "dimension", groupable: true },
  { id: "featureName", label: "Feature", kind: "dimension", groupable: true },
  { id: "interface", label: "Interface", kind: "dimension", groupable: true },
  { id: "engine", label: "Engine", kind: "dimension", groupable: true },
  { id: "interfaceVersion", label: "Version", kind: "dimension", groupable: true },
  { id: "status", label: "Status", kind: "measure", groupable: true },
  { id: "bucket", label: "Bucket", kind: "measure", groupable: true },
  { id: "draft", label: "Draft only", kind: "measure", groupable: true },
  { id: "proofCount", label: "Proofs", kind: "measure", groupable: false },
  { id: "evidenceCount", label: "Evidence", kind: "measure", groupable: false },
  { id: "testedVersion", label: "Tested with", kind: "measure", groupable: true },
];

/**
 * @param {any[]} matrices compatibility.json artifacts
 * @returns {CompatRow[]}
 */
export function compatDataset(matrices) {
  return matrices.flatMap(matrixRows);
}

/** @param {any} matrix */
function matrixRows(matrix) {
  const interfaces = new Map(matrix.interfaces.map((i) => [i.key, i]));
  const engineOf = new Map();
  for (const engine of matrix.engines ?? []) {
    for (const key of engine.interfaces) engineOf.set(key, engine);
  }
  // A journey × interface is in scope where a table or asset group places it,
  // or where a claim says something about it.
  /** @type {Map<string, Map<string, { tables: string[], assetGroups: string[] }>>} */
  const scope = new Map();
  const place = (journey, iface) => {
    let row = scope.get(journey);
    if (!row) {
      row = new Map();
      scope.set(journey, row);
    }
    let slot = row.get(iface);
    if (!slot) {
      slot = { tables: [], assetGroups: [] };
      row.set(iface, slot);
    }
    return slot;
  };
  for (const table of matrix.tables) {
    for (const j of table.rows) for (const c of table.columns) place(j, c).tables.push(table.id);
  }
  for (const group of matrix.assets ?? []) {
    for (const j of group.rows)
      for (const c of group.columns) place(j, c).assetGroups.push(group.id);
  }
  for (const journey of matrix.journeys) {
    for (const iface of Object.keys(journey.cells)) place(journey.id, iface);
  }

  /** @type {CompatRow[]} */
  const rows = [];
  for (const journey of matrix.journeys) {
    for (const [key, slot] of scope.get(journey.id) ?? []) {
      const iface = interfaces.get(key) ?? { key, label: key, version: null, package: null };
      const engine = engineOf.get(key);
      const cell = journey.cells[key] ?? null;
      const feature = journey.feature ?? null;
      const proofs = cell?.proofs ?? [];
      const evidence = cell?.evidence ?? [];
      const counted = proofs.find((p) => p.ready) ?? proofs[0];
      rows.push({
        id: `${matrix.project}/${journey.id}/${key}`,
        project: matrix.project,
        journey: journey.id,
        journeyTitle: journey.title,
        summary: journey.summary,
        family: journey.family ?? null,
        asset: journey.asset ?? null,
        tables: slot.tables,
        assetGroups: slot.assetGroups,
        featureSpec: feature?.spec ?? null,
        featureName: feature?.name ?? null,
        featureSince: feature?.since ?? null,
        featureKey: feature ? `${feature.spec}:${feature.since ?? ""}` : null,
        request: journey.request ?? null,
        interface: key,
        interfaceLabel: iface.label,
        interfaceVersion: iface.version ?? null,
        package: iface.package ?? null,
        via: iface.via ?? null,
        engine: iface.model ?? engine?.id ?? null,
        engineTitle: engine?.title ?? null,
        status: cell?.status ?? "unknown",
        bucket: bucketOf(cell ?? undefined),
        draft: cell?.draft ?? false,
        proofCount: proofs.length,
        readyProofCount: proofs.filter((p) => p.ready).length,
        evidenceCount: evidence.length,
        testedVersion: counted?.version ?? evidence[0]?.verified ?? null,
        api: counted?.api ?? evidence[0]?.api ?? null,
        source: { matrix, journey, iface, cell },
      });
    }
  }
  return rows;
}

/**
 * @param {Iterable<{ bucket: CellBucket }>} rows
 * @returns {Record<CellBucket, number>}
 */
export function countBuckets(rows) {
  const counts = emptyCounts();
  for (const row of rows) counts[row.bucket]++;
  return counts;
}
