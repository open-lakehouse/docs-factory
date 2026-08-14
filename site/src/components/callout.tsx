import { Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CalloutType = "tip" | "note" | "info" | "warning" | "caution" | "danger";

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
    <Alert className="callout" data-type={type}>
      <Icon className="callout-icon" />
      <AlertTitle className="callout-title">{title ?? label}</AlertTitle>
      <AlertDescription className="callout-body">{children}</AlertDescription>
    </Alert>
  );
}
