import { BookOpen, GraduationCap, Library, Wrench } from "lucide-react";
import { diataxisKeyOf, type DiataxisKey } from "../graph";

const ICONS = {
  tutorial: GraduationCap,
  "how-to": Wrench,
  reference: Library,
  explanation: BookOpen,
} satisfies Record<DiataxisKey, typeof BookOpen>;

export default function DiataxisIcon({
  axis,
  className = "blog-row-icon",
}: {
  /** Diátaxis key or on-disk bucket folder (e.g. `tutorials`). */
  axis: string;
  className?: string;
}) {
  const key = diataxisKeyOf(axis);
  const Icon = key ? ICONS[key] : BookOpen;
  return <Icon className={className} aria-hidden="true" />;
}
