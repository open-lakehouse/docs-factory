// The Plan section's pages, in sub-nav order. `path` is relative to /plan.
import {
  BookOpen,
  GitCompareArrows,
  Grid3x3,
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
  { path: "roadmap", label: "Docs roadmap", icon: MapIcon },
  { path: "compat", label: "Compatibility", icon: Grid3x3 },
  { path: "pipeline", label: "Blog pipeline", icon: Newspaper },
  { path: "requests", label: "Content requests", icon: MessageSquarePlus },
  { path: "coverage", label: "Coverage gaps", icon: BookOpen },
  { path: "changes", label: "Product changes", icon: GitCompareArrows },
];
