// `@/components/prerequisites` is the import path the vendored remark-prerequisites emits.
import { ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";

export function Prerequisites({
  title = "Prerequisites",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="callout prereqs" data-type="prerequisites" id="prerequisites">
      <ClipboardCheck className="callout-icon" />
      <p className="callout-title">{title}</p>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
