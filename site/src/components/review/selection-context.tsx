// Shared state between the SelectionLayer (which captures a text/code selection
// over the article) and the CommentSidebar (which opens a composer for it). Kept
// in a tiny context so the page wiring stays a two-component drop-in in the
// review rail, without threading callbacks through the page.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { CapturedSelector } from "../../lib/content-ref";

/** A pending comment target the user picked by selecting text or code. */
export type PendingAnchor =
  | {
      kind: "prose";
      anchorSlug: string;
      headingText: string;
      selector: CapturedSelector;
    }
  | {
      kind: "code";
      path: string;
      region: string;
      line: number;
      endLine: number;
      lineHash: string;
      fileHash: string;
      // The enclosing heading, so the code thread still groups under a section.
      anchorSlug: string;
      headingText: string;
      quote: string; // the selected code text, for display
    };

interface SelectionState {
  pending: PendingAnchor | null;
  setPending: (a: PendingAnchor | null) => void;
}

const Ctx = createContext<SelectionState | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingAnchor | null>(null);
  return <Ctx.Provider value={{ pending, setPending }}>{children}</Ctx.Provider>;
}

export function useSelectionState(): SelectionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSelectionState must be used within SelectionProvider");
  return ctx;
}
