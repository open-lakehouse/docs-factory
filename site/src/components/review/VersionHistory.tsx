// The version-history + structural-diff view for one artifact. Lists registered
// content versions (most-recent first), lets a reviewer pick a baseline and a
// target, fetches both Merkle trees, and renders the changed nodes with
// added/removed/modified/moved groups. Read-only, allowlist-gated (enabled only
// in review mode). The heavy machinery — the tree diff — is the shared client
// util (lib/tree-diff.ts), the same algorithm the server runs for ProductChanges.
import { useMemo, useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { GitCompareArrows } from "lucide-react";
import {
  listVersions,
  getVersionTree,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef, MerkleNode } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { reviewDiff, type DiffEntry } from "../../lib/tree-diff";
import { useScrollContainer } from "./scroll-container-context";
import type { ScrollContainer } from "../../lib/scroll-to-context";
import StructuralDiff from "./StructuralDiff";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function shortSha(sha: string): string {
  return sha && sha !== "unknown" ? sha.slice(0, 8) : "—";
}

interface IndexedNode {
  node: MerkleNode;
  parentKey: string | null;
}

function indexTree(root?: MerkleNode): Map<string, IndexedNode> {
  const index = new Map<string, IndexedNode>();
  if (!root) return index;

  const walk = (node: MerkleNode, parentKey: string | null) => {
    index.set(node.key, { node, parentKey });
    node.children.forEach((child) => walk(child, node.key));
  };
  walk(root, null);
  return index;
}

function nearestHeading(
  entry: DiffEntry,
  beforeIndex: Map<string, IndexedNode>,
  afterIndex: Map<string, IndexedNode>,
): MerkleNode | undefined {
  const index = entry.change === "removed" ? beforeIndex : afterIndex;
  let current = index.get(entry.key);
  while (current) {
    if (current.node.kind === "heading") return current.node;
    current = current.parentKey === null ? undefined : index.get(current.parentKey);
  }
  return undefined;
}

/** Smooth-scroll a heading into view under the sticky topbar (same path as OnThisPage). */
function scrollToAnchor(id: string, container: ScrollContainer) {
  const el = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  if (!el) return;
  if (container instanceof HTMLElement) {
    const view = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const marginTop = Number.parseFloat(style.scrollMarginTop) || 0;
    const top = container.scrollTop + (rect.top - view.top) - marginTop;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return;
  }
  // Honors CSS scroll-margin-top so the sticky topbar doesn't cover the heading.
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function VersionHistory({ contentRef }: { contentRef: ContentRef }) {
  const { reviewActive } = useAuth();
  const scrollContainer = useScrollContainer();
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

  const { data: targetTree, isLoading: isTargetLoading } = useQuery(
    getVersionTree,
    { versionId: target ?? "" },
    { enabled: reviewActive && !!target },
  );
  const { data: baselineTree, isLoading: isBaselineLoading } = useQuery(
    getVersionTree,
    { versionId: baseline ?? "" },
    { enabled: reviewActive && !!baseline },
  );

  const diff = useMemo(
    () => reviewDiff(baselineTree?.tree ?? null, targetTree?.tree ?? null),
    [baselineTree, targetTree],
  );
  const beforeIndex = useMemo(() => indexTree(baselineTree?.tree), [baselineTree]);
  const afterIndex = useMemo(() => indexTree(targetTree?.tree), [targetTree]);
  const treesLoading =
    (!!target && isTargetLoading) || (!!baseline && isBaselineLoading);
  const selectedTarget = versions.find((version) => version.id === target);
  const selectedBaseline = versions.find((version) => version.id === baseline);

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
          <div className="version-history-pickers" aria-label="Versions to compare">
            <label>
              <span className="version-picker-label">From</span>
              <Select value={baseline ?? ""} onValueChange={setBaselineId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {shortSha(v.gitSha)} · {v.createdAt ? timestampDate(v.createdAt).toLocaleDateString() : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span className="version-picker-label">To</span>
              <Select value={target ?? ""} onValueChange={setTargetId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {shortSha(v.gitSha)} · {v.createdAt ? timestampDate(v.createdAt).toLocaleDateString() : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          {selectedBaseline && selectedTarget && (
            <div className="version-comparison" aria-label="Selected comparison">
              <GitCompareArrows aria-hidden="true" />
              <span>{shortSha(selectedBaseline.gitSha)}</span>
              <span className="version-comparison-arrow">→</span>
              <span>{shortSha(selectedTarget.gitSha)}</span>
            </div>
          )}
          {treesLoading ? (
            <p className="review-empty">Comparing versions…</p>
          ) : (
            <StructuralDiff
              entries={diff}
              rowProps={(entry) => {
                const heading = nearestHeading(entry, beforeIndex, afterIndex);
                const headingLabel = entry.kind === "heading" ? null : heading?.label;
                return {
                  context: [
                    headingLabel ? `in ${headingLabel}` : null,
                    entry.kind === "snippet" ? entry.label : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null,
                  onNavigate:
                    entry.anchorSlug && entry.change !== "removed"
                      ? () => scrollToAnchor(entry.anchorSlug!, scrollContainer)
                      : undefined,
                };
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
