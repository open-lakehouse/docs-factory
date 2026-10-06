// Shared state between the SelectionLayer / HeadingCommentAffordance (which
// capture a text, code, or section target over the article) and the
// CommentSidebar / InlineReviewSurface (which open a composer for it). Kept
// in a tiny context so the page wiring stays a drop-in without threading
// callbacks through the page.
import { createContext, type ReactNode, useContext, useState } from "react";
import type { CapturedSelector } from "../../lib/content-ref";

/**
 * A pending comment target the user picked by selecting text/code or a heading.
 * `original` is the passage a suggested edit would replace, verbatim: the
 * selected prose as rendered, or the whole source lines of a code selection.
 * Absent when the selection can't take a suggestion (it spans blocks).
 */
export type PendingAnchor =
  | {
      kind: "prose";
      anchorSlug: string;
      headingText: string;
      selector: CapturedSelector;
      original?: string;
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
      original?: string;
    }
  | {
      kind: "section";
      anchorSlug: string;
      headingText: string;
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
