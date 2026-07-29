// "What changed for <product>?" — the product/topic rollup. Pick a topic
// (Delta, Unity Catalog, DuckDB, …) and the server diffs every artifact tagged
// with it against its baseline, returning the changed sections + open-comment
// counts per document. Read-only, allowlist-gated. The diff is done server-side
// (ProductChanges) because it fans out over a whole product's version pairs;
// this component just renders the result. A topic with no tagged content (e.g.
// duckdb before we've written about it) renders a valid empty state — itself a
// useful DevRel signal.
import { useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import {
  productChanges,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ChangeKind } from "../../gen/docs_factory/review/v1/review_service_pb";
import { useAuth } from "../../lib/auth-context";
import { TOPICS } from "../../vocab";

const CHANGE_LABEL: Record<number, string> = {
  [ChangeKind.ADDED]: "added",
  [ChangeKind.REMOVED]: "removed",
  [ChangeKind.MODIFIED]: "modified",
  [ChangeKind.MODIFIED_DESCENDANTS]: "sub-changed",
  [ChangeKind.MOVED]: "moved",
};
const CHANGE_CLASS: Record<number, string> = {
  [ChangeKind.ADDED]: "added",
  [ChangeKind.REMOVED]: "removed",
  [ChangeKind.MODIFIED]: "modified",
  [ChangeKind.MODIFIED_DESCENDANTS]: "modified-descendants",
  [ChangeKind.MOVED]: "moved",
};

/** Pretty product label from a topic id (e.g. "unity-catalog" → "Unity Catalog"). */
function topicLabel(topic: string): string {
  return topic
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ProductRollup() {
  const { reviewActive } = useAuth();
  const [topic, setTopic] = useState(TOPICS[0] ?? "");

  const { data, isLoading } = useQuery(
    productChanges,
    { topic },
    { enabled: reviewActive && !!topic },
  );

  if (!reviewActive) return null;

  const entries = data?.entries ?? [];
  const docCount = data?.docCount ?? 0;
  const blogCount = data?.blogCount ?? 0;

  return (
    <div className="product-rollup">
      <div className="product-rollup-head">
        <p className="blog-aside-title">What changed for…</p>
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {topicLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : docCount + blogCount === 0 ? (
        <p className="review-empty">No content tagged “{topicLabel(topic)}” yet.</p>
      ) : (
        <>
          <p className="product-rollup-summary muted">
            {docCount} {docCount === 1 ? "doc" : "docs"} + {blogCount}{" "}
            {blogCount === 1 ? "blog" : "blogs"} tagged {topicLabel(topic)};{" "}
            {entries.length} with changes.
          </p>
          {entries.length === 0 ? (
            <p className="review-empty">Nothing changed since the baseline.</p>
          ) : (
            <ul className="product-rollup-list">
              {entries.map((e) => (
                <li key={e.latestVersionId} className="product-rollup-entry">
                  <div className="product-rollup-entry-head">
                    <span className="product-rollup-title">{e.title}</span>
                    {e.openCommentCount > 0 && (
                      <span className="product-rollup-comments">
                        {e.openCommentCount} open{" "}
                        {e.openCommentCount === 1 ? "comment" : "comments"} on changed sections
                      </span>
                    )}
                  </div>
                  <ul className="product-rollup-changes">
                    {e.changedNodes.map((n) => (
                      <li key={n.key} className={`version-diff-row change-${CHANGE_CLASS[n.change]}`}>
                        <span className={`change-badge change-${CHANGE_CLASS[n.change]}`}>
                          {CHANGE_LABEL[n.change] ?? "changed"}
                        </span>
                        <span className="version-diff-kind">{n.kind}</span>
                        <span className="version-diff-label">{n.label}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
