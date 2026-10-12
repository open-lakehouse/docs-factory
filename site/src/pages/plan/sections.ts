// The Plan section's pages, in sub-nav order. `path` is relative to /plan.
import {
  BookOpen,
  GitCompareArrows,
  Grid3x3,
  type LucideIcon,
  Map as MapIcon,
  Newspaper,
} from "lucide-react";

export interface PlanSection {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const PLAN_SECTIONS: readonly PlanSection[] = [
  { path: "roadmap", label: "Docs roadmap", icon: MapIcon },
  { path: "compat", label: "Compatibility", icon: Grid3x3 },
  { path: "pipeline", label: "Blog pipeline", icon: Newspaper },
  { path: "coverage", label: "Coverage gaps", icon: BookOpen },
  { path: "changes", label: "Product changes", icon: GitCompareArrows },
];

export function planHref(path: string, params?: Record<string, string>): string {
  const base = path ? `/plan/${path}` : "/plan";
  const search = params ? new URLSearchParams(params).toString() : "";
  return search ? `${base}?${search}` : base;
}
