// Generic tree-node row for the review workspace's left nav. Adapted from the
// sibling mangrove repo's TreeRow, rewired to docs-factory's shadcn setup
// (@/lib/utils cn). A branch row toggles on body-click; a leaf row selects.
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const INDENT_REM = 0.875;

export function rowPadding(depth: number) {
  return `${depth * INDENT_REM + 0.5}rem`;
}

export function TreeRow({
  depth,
  icon,
  label,
  expandable,
  open,
  selected,
  onToggle,
  onSelect,
}: {
  depth: number;
  icon?: ReactNode;
  label: string;
  expandable?: boolean;
  open?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** When provided, clicking the row body selects the node (opens its tab). */
  onSelect?: () => void;
}) {
  // Body click selects when selectable; otherwise (branch containers) it falls
  // back to toggling expansion so the whole row stays interactive.
  const onBodyClick = onSelect ?? (expandable ? onToggle : undefined);

  return (
    <div
      className={cn(
        "group flex items-center rounded pr-1 hover:bg-accent",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: rowPadding(depth) }}>
        {expandable ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
            className="flex h-6 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="h-6 w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={onBodyClick}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left text-sm"
        >
          {icon}
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        </button>
      </div>
    </div>
  );
}
