// callout.tsx — a tip / warning / note box. remark-callouts turns
// `:::tip … :::` into <Callout type="tip">…</Callout>. Styling lives in the
// .callout-* classes in index.css (DevHub/Delta look, per-type accent).
import { Info, Lightbulb, TriangleAlert, OctagonAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type CalloutType = "tip" | "note" | "info" | "warning" | "caution" | "danger";

// Per-type icon + default heading. `caution`/`danger` share the warning family.
const META: Record<CalloutType, { icon: ComponentType<{ className?: string }>; label: string }> = {
  tip: { icon: Lightbulb, label: "Tip" },
  note: { icon: Info, label: "Note" },
  info: { icon: Info, label: "Info" },
  warning: { icon: TriangleAlert, label: "Warning" },
  caution: { icon: TriangleAlert, label: "Caution" },
  danger: { icon: OctagonAlert, label: "Danger" },
};

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = "note", title, children }: CalloutProps) {
  const { icon: Icon, label } = META[type] ?? META.note;
  return (
    <div className="callout" data-type={type}>
      <div className="callout-head">
        <Icon className="callout-icon" />
        <span className="callout-title">{title ?? label}</span>
      </div>
      <div className="callout-body">{children}</div>
    </div>
  );
}
