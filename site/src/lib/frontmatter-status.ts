// Presentation for the git frontmatter authoring status (idea | draft | ready) —
// the author-intent vocabulary, distinct from the DB review lifecycle
// (see review-status.tsx). One source of truth for the status-badge tone so the
// index tables and the RevOps pipeline view render it identically.

/** Extra badge class for a frontmatter status, or "" for the plain (draft) tone. */
export function statusBadgeClass(status: string | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "ready":
      return "blog-badge-ready";
    case "idea":
      return "blog-badge-idea";
    default:
      return "";
  }
}
