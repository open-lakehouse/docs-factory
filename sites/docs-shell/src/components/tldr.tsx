import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";

export function Tldr({ title = "TL;DR", children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="callout tldr" data-type="tldr">
      <ListChecks className="callout-icon" />
      <p className="callout-title">{title}</p>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
