// The Plan section's pages, in sub-nav order. `path` is relative to /plan.
import {
  GitCompareArrows,
  Grid3x3,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  MessageSquarePlus,
  Newspaper,
} from "lucide-react";

export { planHref } from "../../lib/plan/href";

export interface PlanSection {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const PLAN_SECTIONS: readonly PlanSection[] = [
  { path: "", label: "Summary", icon: LayoutDashboard },
  { path: "roadmap", label: "Docs roadmap", icon: MapIcon },
  { path: "compat", label: "Compatibility", icon: Grid3x3 },
  { path: "pipeline", label: "Blog pipeline", icon: Newspaper },
  { path: "requests", label: "Content requests", icon: MessageSquarePlus },
  { path: "changes", label: "Product changes", icon: GitCompareArrows },
];
