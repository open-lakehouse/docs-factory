// The `:::prerequisites` box. Its Docker bullet and "Start the environment"
// section are derived from the page's scripts (remark-prerequisites-env.mjs).

import { ClipboardCheck, Container } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PrerequisitesProps {
  title?: string;
  children: ReactNode;
}

export function Prerequisites({ title = "Prerequisites", children }: PrerequisitesProps) {
  return (
    <Alert className="callout prereqs" data-type="prerequisites" id="prerequisites">
      <ClipboardCheck className="callout-icon" />
      <AlertTitle className="callout-title">{title}</AlertTitle>
      <AlertDescription className="callout-body">{children}</AlertDescription>
    </Alert>
  );
}

export function PrerequisitesEnvironment({ title, children }: PrerequisitesProps) {
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
