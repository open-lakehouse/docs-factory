// How much of a compatibility matrix is proven. A cell counts once per table
// it appears in, matching what a reader scans.
import type { CompatJourney, CompatMatrix, CompatTable } from "../../compat";
import { bucketOf, type CellBucket, emptyCounts } from "../../content-core/coverage.mjs";

export { bucketOf, type CellBucket };

export type CellCounts = Record<CellBucket, number>;

export function emptyCellCounts(): CellCounts {
  return emptyCounts();
}

export function totalCells(c: CellCounts): number {
  return c.proven + c.draft + c.documented + c.no + c.unknown;
}

/** Answered by a ready page: proven to work or proven not to. */
export function answeredShare(c: CellCounts): number {
  const total = totalCells(c);
  return total === 0 ? 0 : (c.proven + c.no) / total;
}

function journeysOf(matrix: CompatMatrix, table: CompatTable): CompatJourney[] {
  const byId = new Map(matrix.journeys.map((j) => [j.id, j]));
  return table.rows.map((id) => byId.get(id)).filter((j): j is CompatJourney => !!j);
}

/** Per column of one table. */
export function columnCounts(matrix: CompatMatrix, table: CompatTable): Map<string, CellCounts> {
  const out = new Map(table.columns.map((c) => [c, emptyCellCounts()]));
  for (const journey of journeysOf(matrix, table)) {
    for (const col of table.columns) {
      const counts = out.get(col);
      if (counts) counts[bucketOf(journey.cells[col])]++;
    }
  }
  return out;
}

/** Over every table of the matrix. */
export function matrixCounts(matrix: CompatMatrix): CellCounts {
  const total = emptyCellCounts();
  for (const table of matrix.tables) {
    for (const counts of columnCounts(matrix, table).values()) {
      for (const k of Object.keys(total) as CellBucket[]) total[k] += counts[k];
    }
  }
  return total;
}
