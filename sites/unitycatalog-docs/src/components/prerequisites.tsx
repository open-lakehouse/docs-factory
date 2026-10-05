// `@/components/prerequisites` is the import path the vendored remark-prerequisites emits.
import { ClipboardCheck, Container } from "lucide-react";
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

/** The emitter-derived part: how to download and start the page's stack. */
export function PrerequisitesEnvironment({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="prereqs-env" aria-label="Start the environment">
      <p className="prereqs-env-title">
        <Container aria-hidden="true" />
        <span>Start the environment{title ? `: ${title}` : ""}</span>
      </p>
      {children}
    </section>
  );
}
