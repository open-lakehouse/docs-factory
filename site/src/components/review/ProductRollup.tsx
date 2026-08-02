// "What changed for <product>?" — the product/topic rollup. Pick a topic
// (Delta, Unity Catalog, DuckDB, …) and the server diffs every artifact tagged
// with it against its baseline, returning the changed sections + open-comment
// counts per document. Read-only, allowlist-gated. The diff is done server-side
// (ProductChanges / reviewDiff) because it fans out over a whole product's
// version pairs; this component just renders the result with the same
// StructuralDiff chrome as VersionHistory. A topic with no tagged content
// (e.g. duckdb before we've written about it) renders a valid empty state —
// itself a useful DevRel signal.

import { useQuery } from "@connectrpc/connect-query";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { productChanges } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { changeKindFromProto, type DiffEntry } from "../../lib/tree-diff";
import { TOPICS } from "../../vocab";
import StructuralDiff from "./StructuralDiff";

/** Pretty product label from a topic id (e.g. "unity-catalog" → "Unity Catalog"). */
function topicLabel(topic: string): string {
  return topic
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function shortSha(sha: string): string {
  return sha && sha !== "unknown" ? sha.slice(0, 8) : "—";
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
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Choose a product" />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t} value={t}>
                {topicLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : docCount + blogCount === 0 ? (
        <p className="review-empty">No content tagged “{topicLabel(topic)}” yet.</p>
      ) : (
        <>
          <p className="product-rollup-summary muted">
            {docCount} {docCount === 1 ? "doc" : "docs"} + {blogCount}{" "}
            {blogCount === 1 ? "blog" : "blogs"} tagged {topicLabel(topic)}; {entries.length} with
            changes.
          </p>
          {entries.length === 0 ? (
            <p className="review-empty">Nothing changed since the baseline.</p>
          ) : (
            <ul className="product-rollup-list">
              {entries.map((e) => {
                const diff: DiffEntry[] = e.changedNodes.map((n) => ({
                  key: n.key,
                  kind: n.kind,
                  change: changeKindFromProto(n.change),
                  label: n.label,
                  ...(n.anchorSlug ? { anchorSlug: n.anchorSlug } : {}),
                }));
                return (
                  <li key={e.latestVersionId} className="product-rollup-entry">
                    <div className="product-rollup-entry-head">
                      <div className="product-rollup-entry-title-block">
                        <span className="product-rollup-title">{e.title}</span>
                        <span className="product-rollup-sha">
                          {shortSha(e.latestGitSha)}
                          {!e.baselineVersionId && " · new"}
                        </span>
                      </div>
                      {e.openCommentCount > 0 && (
                        <span className="product-rollup-comments">
                          <MessageSquare aria-hidden="true" />
                          {e.openCommentCount} open{" "}
                          {e.openCommentCount === 1 ? "comment" : "comments"}
                        </span>
                      )}
                    </div>
                    <StructuralDiff entries={diff} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
