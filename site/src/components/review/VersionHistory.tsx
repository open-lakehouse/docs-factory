// The version-history + structural-diff view for one artifact. Lists registered
// content versions (most-recent first), lets a reviewer pick a baseline and a
// target, fetches both Merkle trees, and renders the changed nodes with
// added/removed/modified/moved badges. Read-only, allowlist-gated (enabled only
// in review mode). The heavy machinery — the tree diff — is the shared client
// util (lib/tree-diff.ts), the same algorithm the server runs for ProductChanges.
import { useMemo, useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  listVersions,
  getVersionTree,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { diffTrees, type ChangeKind } from "../../lib/tree-diff";

const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  "modified-descendants": "sub-changed",
  moved: "moved",
};

function shortSha(sha: string): string {
  return sha && sha !== "unknown" ? sha.slice(0, 8) : "—";
}

export default function VersionHistory({ contentRef }: { contentRef: ContentRef }) {
  const { reviewActive } = useAuth();
  const { data: versionsData, isLoading } = useQuery(
    listVersions,
    { ref: contentRef },
    { enabled: reviewActive },
  );
  const versions = versionsData?.versions ?? [];

  // Default comparison: latest (index 0) vs. its immediate predecessor.
  const [targetId, setTargetId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const target = targetId ?? versions[0]?.id ?? null;
  const baseline = baselineId ?? versions[1]?.id ?? null;

  const { data: targetTree } = useQuery(
    getVersionTree,
    { versionId: target ?? "" },
    { enabled: reviewActive && !!target },
  );
  const { data: baselineTree } = useQuery(
    getVersionTree,
    { versionId: baseline ?? "" },
    { enabled: reviewActive && !!baseline },
  );

  const diff = useMemo(
    () => diffTrees(baselineTree?.tree ?? null, targetTree?.tree ?? null),
    [baselineTree, targetTree],
  );

  if (!reviewActive) return null;

  return (
    <div className="version-history">
      <p className="blog-aside-title">Version history</p>
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="review-empty">No registered versions yet.</p>
      ) : (
        <>
          <div className="version-history-pickers">
            <label>
              <span className="muted">Baseline</span>
              <select value={baseline ?? ""} onChange={(e) => setBaselineId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {shortSha(v.gitSha)} · {v.createdAt ? timestampDate(v.createdAt).toLocaleDateString() : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">Compare</span>
              <select value={target ?? ""} onChange={(e) => setTargetId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {shortSha(v.gitSha)} · {v.createdAt ? timestampDate(v.createdAt).toLocaleDateString() : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {diff.length === 0 ? (
            <p className="review-empty">No structural changes between these versions.</p>
          ) : (
            <ul className="version-diff-list">
              {diff.map((d) => (
                <li key={d.key} className={`version-diff-row change-${d.change}`}>
                  <span className={`change-badge change-${d.change}`}>{CHANGE_LABEL[d.change]}</span>
                  <span className="version-diff-kind">{d.kind}</span>
                  <span className="version-diff-label">{d.label}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
