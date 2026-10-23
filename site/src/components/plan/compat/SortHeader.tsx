// A column header that sorts on click (shift-click adds a sort key).
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

interface Sortable {
  getCanSort(): boolean;
  getIsSorted(): false | "asc" | "desc";
  getToggleSortingHandler(): ((event: unknown) => void) | undefined;
}

export function SortHeader({ column, children }: { column: Sortable; children: ReactNode }) {
  if (!column.getCanSort()) return <>{children}</>;
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="compat-sort"
      onClick={column.getToggleSortingHandler()}
      title="Sort; shift-click to add"
    >
      <span>{children}</span>
      {sorted === "asc" && <ArrowUp size={12} aria-hidden="true" />}
      {sorted === "desc" && <ArrowDown size={12} aria-hidden="true" />}
    </button>
  );
}
