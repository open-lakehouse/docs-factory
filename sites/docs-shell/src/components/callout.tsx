// `@/components/callout` is the import path the vendored remark-callouts emits.
import { Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type CalloutType = "tip" | "note" | "info" | "warning" | "caution" | "danger";

const META: Record<CalloutType, { icon: ComponentType<{ className?: string }>; label: string }> = {
  tip: { icon: Lightbulb, label: "Tip" },
  note: { icon: Info, label: "Note" },
  info: { icon: Info, label: "Info" },
  warning: { icon: TriangleAlert, label: "Warning" },
  caution: { icon: TriangleAlert, label: "Caution" },
  danger: { icon: OctagonAlert, label: "Danger" },
};

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}) {
  const { icon: Icon, label } = META[type] ?? META.note;
  return (
    <aside className="callout" data-type={type}>
      <Icon className="callout-icon" />
      <p className="callout-title">{title ?? label}</p>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
