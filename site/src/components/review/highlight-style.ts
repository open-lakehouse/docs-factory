// Per-tab CSS Custom Highlight styling (Phase 4 defense-in-depth).
//
// The CSS Custom Highlight registry (CSS.highlights) is DOCUMENT-GLOBAL: a
// highlight named "review-quote" is one shared slot. The workspace already
// guarantees only the ACTIVE tab registers highlights (QuoteHighlights unmounts
// with the inactive tab), so in practice they never collide — but during a tab
// switch the deactivating tab's cleanup (CSS.highlights.delete) and the
// activating tab's set can interleave, and a late delete would wipe the newly
// active tab's paint. Giving each tab its own highlight name closes that race.
//
// The catch: `::highlight(NAME)` needs a matching CSS rule, and NAME is dynamic.
// So the first time a tab uses a key we inject the (identical) style block for
// its two names into one shared <style> element. The declarations mirror the
// static `::highlight(review-quote{,-focus})` rules in index.css; the single-
// page routes keep using those static names (no key), so this only adds rules
// for the workspace's keyed names.

const STYLE_EL_ID = "review-quote-highlight-styles";
const injected = new Set<string>();

/** Style declarations, mirrored from index.css's static ::highlight rules. */
const ALL_DECL =
  "background: color-mix(in oklab, gold 30%, transparent);" +
  " color: inherit;" +
  " text-decoration: underline dotted color-mix(in oklab, gold 70%, var(--border));" +
  " text-underline-offset: 2px;";
const FOCUS_DECL = "background: color-mix(in oklab, gold 55%, transparent); color: inherit;";

/** Highlight-registry names for a given tab key (or the shared static names). */
export function highlightNames(key?: string): { all: string; focus: string } {
  if (!key) return { all: "review-quote", focus: "review-quote-focus" };
  return { all: `review-quote-${key}`, focus: `review-quote-focus-${key}` };
}

/**
 * Ensure `::highlight()` CSS rules exist for a keyed tab's highlight names.
 * No-op without a key (the static index.css rules already cover those names)
 * or in a non-DOM environment. Idempotent per key.
 */
export function ensureHighlightStyle(key?: string) {
  if (!key || typeof document === "undefined") return;
  if (injected.has(key)) return;
  injected.add(key);

  let el = document.getElementById(STYLE_EL_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_EL_ID;
    document.head.appendChild(el);
  }
  const { all, focus } = highlightNames(key);
  el.appendChild(
    document.createTextNode(
      `::highlight(${all}) { ${ALL_DECL} } ::highlight(${focus}) { ${FOCUS_DECL} }\n`,
    ),
  );
}
