// tldr.tsx — the key-takeaways box (`:::tldr`). Per blogs/QUALITY.md the TL;DR is
// "the single most-quoted block" for AI; it renders as a prominent boxed summary
// near the top of a page. Styled via shadcn Alert like Callout, with its own accent.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";

interface TldrProps {
  title?: string;
  children: ReactNode;
}

export function Tldr({ title = "TL;DR", children }: TldrProps) {
  return (
    <Alert className="callout tldr" data-type="tldr">
      <ListChecks className="callout-icon" />
      <AlertTitle className="callout-title">{title}</AlertTitle>
      <AlertDescription className="callout-body">{children}</AlertDescription>
    </Alert>
  );
}
