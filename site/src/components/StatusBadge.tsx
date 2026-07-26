import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusBadgeClass } from "../lib/frontmatter-status";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Shared shape and typography for authoring and review lifecycle statuses. */
export function StatusBadge({
  children,
  variant = "outline",
  toneClass,
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  toneClass?: string;
  className?: string;
}) {
  return (
    <Badge variant={variant} className={cn("status-badge", toneClass, className)}>
      {children}
    </Badge>
  );
}

/** Git-frontmatter authoring status using the shared status-badge geometry. */
export function FrontmatterStatusBadge({ status }: { status: string }) {
  const toneClass = statusBadgeClass(status);
  return (
    <StatusBadge
      toneClass={toneClass}
      className={cn("frontmatter-status-badge", !toneClass && "status-badge--idle")}
    >
      {status}
    </StatusBadge>
  );
}
