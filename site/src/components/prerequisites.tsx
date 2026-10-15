// The `:::prerequisites` box. Its Docker bullet (and a how-to's environment
// pointer) are derived from the page's scripts (remark-prerequisites-env.mjs).

import { ClipboardCheck } from "lucide-react";
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
