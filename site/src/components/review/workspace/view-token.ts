// A workspace tab token now identifies BOTH a page (ContentRef) AND which VIEW
// of that page is shown. Clicking a sidebar item opens a GROUP of sibling views
// — the rendered page (as before), its `.md` twin, and one view per runnable
// script served alongside it. Each view is its own tab; they share a groupKey
// (the ref token) so the strip can group them under the item.
//
// The token extends the existing `refToParam` output with an OPTIONAL `#view`
// suffix. No suffix ⇒ the rendered view, so existing shared /review URLs (which
// only ever carried bare ref tokens) keep working unchanged:
//
//   docs:slug:project:bucket                    → rendered
//   docs:slug:project:bucket#md                 → the .md twin
//   docs:slug:project:bucket#script:<enc>       → a served script, <enc> = the fetchUrl
//
// `#` is a fresh delimiter: `:` already separates ref fields and `,` separates
// tabs in the `?tabs=` param, so neither can appear here. The script's fetchUrl
// is encodeURIComponent'd so its `/`, `.`, `#`, `,` can't collide. The whole
// token lives inside a query-PARAM VALUE, so the `#` is not a URL fragment.
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { refFromParam, refToParam } from "../../../lib/content-ref";

/** Which view of a page a tab shows. `rendered` is the default (no `#` suffix). */
export type TabView = { kind: "rendered" } | { kind: "md" } | { kind: "script"; fetchUrl: string };

/** The `#…` suffix for a view, or "" for the rendered view (bare ref token). */
export function viewToParam(view: TabView): string {
  switch (view.kind) {
    case "rendered":
      return "";
    case "md":
      return "#md";
    case "script":
      return `#script:${encodeURIComponent(view.fetchUrl)}`;
  }
}

/** The full tab token for a (ref, view): `refToParam(ref)` + the view suffix. */
export function tabTokenFor(ref: ContentRef, view: TabView): string {
  return refToParam(ref) + viewToParam(view);
}

/**
 * Parse one tab token back into its ref + view, or null if the ref half is
 * malformed. Splits on the FIRST `#` only: the left half is a bare ref token
 * (fed to the unchanged `refFromParam`), the right half is the view suffix. An
 * unknown suffix falls back to the rendered view rather than dropping the tab.
 */
export function parseTabToken(token: string): { ref: ContentRef; view: TabView } | null {
  const hash = token.indexOf("#");
  const refPart = hash === -1 ? token : token.slice(0, hash);
  const viewPart = hash === -1 ? "" : token.slice(hash + 1);
  const ref = refFromParam(refPart);
  if (!ref) return null;

  let view: TabView = { kind: "rendered" };
  if (viewPart === "md") {
    view = { kind: "md" };
  } else if (viewPart.startsWith("script:")) {
    const fetchUrl = decodeURIComponent(viewPart.slice("script:".length));
    if (fetchUrl) view = { kind: "script", fetchUrl };
  }
  return { ref, view };
}

/**
 * The group key for a token: the bare ref token, shared by every view of one
 * item. Used to group sibling tabs in the strip and to cap/evict by item.
 */
export function refTokenOf(token: string): string {
  const hash = token.indexOf("#");
  return hash === -1 ? token : token.slice(0, hash);
}
