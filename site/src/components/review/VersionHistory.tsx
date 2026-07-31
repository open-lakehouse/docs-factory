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
  Code2,
  FileCode2,
  FileText,
  GitCompareArrows,
  Heading,
  Minus,
  Move,
  Pencil,
  Plus,
} from "lucide-react";
import {
  listVersions,
  getVersionTree,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef, MerkleNode } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import {
  diffTrees,
  CHANGE_LABEL,
  CHANGE_CLASS,
  type ChangeKind,
  type DiffEntry,
} from "../../lib/tree-diff";
import { useScrollContainer } from "./scroll-container-context";
import type { ScrollContainer } from "../../lib/scroll-to-context";
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

type VisibleChangeKind = Exclude<ChangeKind, "modified-descendants">;

const CHANGE_ORDER: readonly VisibleChangeKind[] = ["added", "modified", "moved", "removed"];

const CHANGE_ICON = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  moved: Move,
} as const;

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

/**
 * Turn the Merkle implementation detail into review-level changes:
 * - descendant-only entries are context, not changes of their own;
 * - a newly added/removed subtree is represented by its highest changed node,
 *   instead of repeating every prose/code leaf below it.
 */
function compactDiff(
  entries: DiffEntry[],
  before?: MerkleNode,
  after?: MerkleNode,
): DiffEntry[] {
  const beforeIndex = indexTree(before);
  const afterIndex = indexTree(after);
  const changed = new Map(entries.map((entry) => [entry.key, entry]));

  return entries.filter((entry) => {
    if (entry.change === "modified-descendants") return false;
    if (entry.change !== "added" && entry.change !== "removed") return true;

    const index = entry.change === "removed" ? beforeIndex : afterIndex;
    let parentKey = index.get(entry.key)?.parentKey;
    while (parentKey !== null && parentKey !== undefined) {
      if (changed.get(parentKey)?.change === entry.change) return false;
      parentKey = index.get(parentKey)?.parentKey;
    }
    return true;
  });
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

function nodeDescription(entry: DiffEntry): string {
  if (entry.kind === "heading") return `Heading ${entry.change}`;
  if (entry.kind === "prose") return entry.key === "$preamble" ? "Introduction" : "Section prose";
  if (entry.kind === "code") {
    const language = entry.label.match(/^code \((.+)\)$/)?.[1];
    return language ? `${language.toUpperCase()} code block` : "Code block";
  }
  if (entry.kind === "snippet") return "Source snippet";
  return entry.kind;
}

function NodeIcon({ kind }: { kind: string }) {
  const Icon =
    kind === "heading"
      ? Heading
      : kind === "code"
        ? Code2
        : kind === "snippet"
          ? FileCode2
          : FileText;
  return <Icon aria-hidden="true" />;
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

  const rawDiff = useMemo(
    () => diffTrees(baselineTree?.tree ?? null, targetTree?.tree ?? null),
    [baselineTree, targetTree],
  );
  const diff = useMemo(
    () => compactDiff(rawDiff, baselineTree?.tree, targetTree?.tree),
    [rawDiff, baselineTree, targetTree],
  );
  const beforeIndex = useMemo(() => indexTree(baselineTree?.tree), [baselineTree]);
  const afterIndex = useMemo(() => indexTree(targetTree?.tree), [targetTree]);
  const groups = useMemo(
    () =>
      CHANGE_ORDER.map((change) => ({
        change,
        entries: diff.filter((entry) => entry.change === change),
      })).filter((group) => group.entries.length > 0),
    [diff],
  );
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
          ) : diff.length === 0 ? (
            <p className="review-empty">No structural changes between these versions.</p>
          ) : (
            <>
              <div className="version-diff-summary">
                <strong>{diff.length}</strong>
                <span>{diff.length === 1 ? "meaningful change" : "meaningful changes"}</span>
                <div className="version-diff-counts" aria-label="Change counts">
                  {groups.map(({ change, entries }) => (
                    <span key={change} className={`change-count change-${CHANGE_CLASS[change]}`}>
                      {entries.length} {CHANGE_LABEL[change]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="version-diff-groups">
                {groups.map(({ change, entries }) => {
                  const Icon = CHANGE_ICON[change];
                  return (
                    <section key={change} className={`version-diff-group change-${CHANGE_CLASS[change]}`}>
                      <h4 className="version-diff-group-title">
                        <span className="version-diff-group-icon"><Icon aria-hidden="true" /></span>
                        <span>{CHANGE_LABEL[change]}</span>
                        <span className="version-diff-group-count">{entries.length}</span>
                      </h4>
                      <ul className="version-diff-list">
                        {entries.map((entry) => {
                          const heading = nearestHeading(entry, beforeIndex, afterIndex);
                          const label = entry.kind === "heading" ? entry.label : nodeDescription(entry);
                          const context = entry.kind === "heading" ? null : heading?.label;
                          return (
                            <li key={entry.key} className="version-diff-row">
                              <span className="version-diff-node-icon">
                                <NodeIcon kind={entry.kind} />
                              </span>
                              <span className="version-diff-copy">
                                {entry.anchorSlug && entry.change !== "removed" ? (
                                  <a
                                    className="version-diff-label"
                                    href={`#${entry.anchorSlug}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      scrollToAnchor(entry.anchorSlug!, scrollContainer);
                                    }}
                                  >
                                    {label}
                                  </a>
                                ) : (
                                  <span className="version-diff-label">{label}</span>
                                )}
                                {context && <span className="version-diff-context">in {context}</span>}
                                {entry.kind === "snippet" && (
                                  <span className="version-diff-context">{entry.label}</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
