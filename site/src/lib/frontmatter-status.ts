// Presentation for the git frontmatter status (idea | draft | ready | private) —
// the author-intent vocabulary, distinct from the DB review lifecycle
// (see review-status.tsx). One source of truth for the status-badge tone so the
// index tables and the RevOps pipeline view render it identically.

/** Extra badge class for a frontmatter status, or "" for the plain (draft) tone. */
export function statusBadgeClass(status: string | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "ready":
      return "status-badge-ready";
    case "idea":
      return "status-badge-idea";
    case "private":
      return "status-badge-private";
    default:
      return "";
  }
}

/** Extra class for a compact tree-row status dot (always returns a tone class). */
export function statusDotClass(status: string | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "ready":
      return "tree-status-dot-ready";
    case "idea":
      return "tree-status-dot-idea";
    case "private":
      return "tree-status-dot-private";
    default:
      return "tree-status-dot-draft";
  }
}
