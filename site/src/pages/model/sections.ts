// The Model section's pages, in sub-nav order. `path` is relative to /model.
import { BookOpen, Braces, type LucideIcon, Network } from "lucide-react";

export interface ModelSection {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const MODEL_SECTIONS: readonly ModelSection[] = [
  { path: "", label: "Explorer", icon: Network },
  { path: "concepts", label: "Concepts", icon: Braces },
  { path: "coverage", label: "Coverage gaps", icon: BookOpen },
];

export const modelSectionHref = (path: string) => (path ? `/model/${path}` : "/model");
