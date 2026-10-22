// TanStack Table v9 registers features explicitly; these stay at module scope
// because a new registry per render rebuilds every row model.
import {
  columnGroupingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createGroupedRowModel,
  createSortedRowModel,
  rowExpandingFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

const sortFns = { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text };

export const sortingFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export const cellsFeatures = tableFeatures({
  columnVisibilityFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  rowSortingFeature,
  groupedRowModel: createGroupedRowModel(),
  sortedRowModel: createSortedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  sortFns,
});

export type { SortingState };

export function ariaSort(sorted: false | "asc" | "desc"): "ascending" | "descending" | undefined {
  return sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined;
}
