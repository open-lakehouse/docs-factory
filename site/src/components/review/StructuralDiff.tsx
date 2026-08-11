// Shared review-level structural-diff renderer. Used by VersionHistory (sidebar /
// review workspace) and ProductRollup (RevOps). Groups compacted DiffEntry rows
// by change kind with the same icons, counts, and readable labels — so the
// surfaces stay visually consistent.
import {
  Code2,
  FileCode2,
  FilePlus2,
  FileText,
  Heading,
  type LucideIcon,
  Minus,
  Move,
  Pencil,
  Plus,
} from "lucide-react";
import { CHANGE_CLASS, CHANGE_LABEL, type ChangeKind, type DiffEntry } from "../../lib/tree-diff";

type VisibleChangeKind = Exclude<ChangeKind, "modified-descendants">;

const CHANGE_ORDER: readonly VisibleChangeKind[] = ["added", "modified", "moved", "removed"];

const CHANGE_ICON: Record<VisibleChangeKind, LucideIcon> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  moved: Move,
};

export function nodeDescription(entry: DiffEntry): string {
  if (entry.kind === "doc" && entry.change === "added") return "Document added";
  if (entry.kind === "heading") return `Heading ${entry.change}`;
  if (entry.kind === "prose") return entry.key === "$preamble" ? "Introduction" : "Section prose";
  if (entry.kind === "code") {
    const language = entry.label.match(/^code \((.+)\)$/)?.[1];
    return language ? `${language.toUpperCase()} code block` : "Code block";
  }
  if (entry.kind === "snippet") return "Source snippet";
  return entry.kind;
}

function NodeIcon({ kind, change }: { kind: string; change: ChangeKind }) {
  const Icon =
    kind === "doc" && change === "added"
      ? FilePlus2
      : kind === "heading"
        ? Heading
        : kind === "code"
          ? Code2
          : kind === "snippet"
            ? FileCode2
            : FileText;
  return <Icon aria-hidden="true" />;
}

export function groupDiffEntries(entries: DiffEntry[]) {
  return CHANGE_ORDER.map((change) => ({
    change,
    entries: entries.filter((entry) => entry.change === change),
  })).filter((group) => group.entries.length > 0);
}

export interface StructuralDiffRowContext {
  /** Optional heading label the change sits under (e.g. "in Getting started"). */
  context?: string | null;
  /** Optional click handler when the row has a navigable anchor. */
  onNavigate?: () => void;
}

interface StructuralDiffProps {
  entries: DiffEntry[];
  /** Resolve per-row context / navigation. Defaults to plain labels. */
  rowProps?: (entry: DiffEntry) => StructuralDiffRowContext;
  emptyMessage?: string;
}

export default function StructuralDiff({
  entries,
  rowProps,
  emptyMessage = "No structural changes between these versions.",
}: StructuralDiffProps) {
  const groups = groupDiffEntries(entries);

  if (entries.length === 0) {
    return <p className="review-empty">{emptyMessage}</p>;
  }

  // Brand-new artifact: a single synthetic doc-added row — skip the grouped chrome.
  const documentAdded =
    entries.length === 1 && entries[0].kind === "doc" && entries[0].change === "added";

  if (documentAdded) {
    const entry = entries[0];
    return (
      <div className="version-diff-document-added" role="status">
        <span className="version-diff-node-icon change-added">
          <FilePlus2 aria-hidden="true" />
        </span>
        <span className="version-diff-copy">
          <span className="version-diff-label">{nodeDescription(entry)}</span>
          <span className="version-diff-context">First registered version</span>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="version-diff-summary">
        <strong>{entries.length}</strong>
        <span>{entries.length === 1 ? "meaningful change" : "meaningful changes"}</span>
        <div className="version-diff-counts" aria-label="Change counts">
          {groups.map(({ change, entries: groupEntries }) => (
            <span key={change} className={`change-count change-${CHANGE_CLASS[change]}`}>
              {groupEntries.length} {CHANGE_LABEL[change]}
            </span>
          ))}
        </div>
      </div>
      <div className="version-diff-groups">
        {groups.map(({ change, entries: groupEntries }) => {
          const Icon = CHANGE_ICON[change];
          return (
            <section key={change} className={`version-diff-group change-${CHANGE_CLASS[change]}`}>
              <h4 className="version-diff-group-title">
                <span className="version-diff-group-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{CHANGE_LABEL[change]}</span>
                <span className="version-diff-group-count">{groupEntries.length}</span>
              </h4>
              <ul className="version-diff-list">
                {groupEntries.map((entry) => {
                  const extras = rowProps?.(entry) ?? {};
                  const label = entry.kind === "heading" ? entry.label : nodeDescription(entry);
                  const context = extras.context ?? (entry.kind === "snippet" ? entry.label : null);
                  return (
                    <li key={entry.key} className="version-diff-row">
                      <span
                        className={`version-diff-node-icon change-${CHANGE_CLASS[entry.change]}`}
                      >
                        <NodeIcon kind={entry.kind} change={entry.change} />
                      </span>
                      <span className="version-diff-copy">
                        {entry.anchorSlug && entry.change !== "removed" && extras.onNavigate ? (
                          <a
                            className="version-diff-label"
                            href={`#${entry.anchorSlug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              extras.onNavigate?.();
                            }}
                          >
                            {label}
                          </a>
                        ) : (
                          <span className="version-diff-label">{label}</span>
                        )}
                        {context && <span className="version-diff-context">{context}</span>}
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
  );
}
