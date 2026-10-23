// The Model section's pages, in sub-nav order. `path` is relative to /model.
import {
  BookOpen,
  Boxes,
  Braces,
  Columns3,
  FileText,
  type LucideIcon,
  Network,
  Route,
  Waypoints,
} from "lucide-react";

export interface ModelSection {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const MODEL_SECTIONS: readonly ModelSection[] = [
  { path: "", label: "Explorer", icon: Network },
  { path: "implementations", label: "Implementations", icon: Boxes },
  { path: "specs", label: "Specifications", icon: FileText },
  { path: "journeys", label: "Journeys", icon: Route },
  { path: "paths", label: "Paths", icon: Waypoints },
  { path: "crosswalk", label: "Format crosswalk", icon: Columns3 },
  { path: "concepts", label: "Concepts", icon: Braces },
  { path: "coverage", label: "Coverage gaps", icon: BookOpen },
];

export const modelSectionHref = (path: string) => (path ? `/model/${path}` : "/model");
