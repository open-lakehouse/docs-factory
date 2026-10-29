// Where the server's re-anchoring placed a thread on the latest version
// (server/src/anchor.ts), in reviewer terms: what the thread's card says, and
// which text to look for in the rendered page.

import { normalizeText } from "../content-core/normalize.mjs";
import {
  AnchorState,
  type Comment,
  SuggestionState,
} from "../gen/docs_factory/review/v1/messages_pb";

export interface AnchorPlacement {
  kind: "moved" | "rewritten" | "section" | "orphaned";
  /** A word or two for the collapsed card. */
  badge: string;
  /** One sentence for the expanded thread. */
  detail: string;
}

/** Undefined for a thread that sits where it was written. */
export function anchorPlacement(root: Comment | undefined): AnchorPlacement | undefined {
  if (!root) return undefined;
  if (root.orphaned) {
    return {
      kind: "orphaned",
      badge: "Removed",
      detail: "The text this comment was on is no longer on the page.",
    };
  }
  // An applied suggestion replaced the quote on purpose; that isn't drift.
  if (root.suggestion?.state === SuggestionState.APPLIED) return undefined;
  const elsewhere = root.authoredHeading && root.authoredAnchorSlug !== root.anchorSlug;
  const from = elsewhere ? ` It was written under “${root.authoredHeading}”.` : "";
  switch (root.anchorState) {
    case AnchorState.MOVED:
      return {
        kind: "moved",
        badge: "Moved",
        detail: `The passage moved since this comment.${from}`,
      };
    case AnchorState.REWRITTEN:
      return {
        kind: "rewritten",
        badge: "Reworded",
        detail: `The passage was reworded since this comment; the closest match is highlighted.${from}`,
      };
    case AnchorState.SECTION:
      return {
        kind: "section",
        badge: "Quote gone",
        detail: "The quoted text is no longer on the page; the comment stays on its section.",
      };
    default:
      return undefined;
  }
}

/**
 * The selector to resolve in the rendered page: for a reworded passage, the
 * text the server matched (the original quote no longer occurs verbatim); for
 * an applied suggestion, its replacement in the quote's place. An applied
 * deletion has nothing left to highlight, and any remaining copy of its quote
 * is a different passage.
 */
export function currentSelector(
  root: Comment | undefined,
): { quote: string; prefix?: string; suffix?: string } | undefined {
  const sel = root?.selector;
  if (!root || !sel?.quote) return undefined;
  if (root.suggestion?.state === SuggestionState.APPLIED) {
    const quote = normalizeText(root.suggestion.replacement);
    return quote ? { quote, prefix: sel.prefix, suffix: sel.suffix } : undefined;
  }
  if (root.anchorState === AnchorState.REWRITTEN && root.anchorCurrentQuote) {
    return { quote: root.anchorCurrentQuote };
  }
  return sel;
}
