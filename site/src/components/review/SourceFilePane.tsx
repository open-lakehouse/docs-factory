// SourceFilePane — the "open full source" code-review surface. Given a snippet
// path, fetches the full registered source via GetSourceFile and renders it line
// by line so a reviewer can comment on ANY line, including code outside the
// `start=`/`end=` window inlined in the doc. The lines that the in-doc snippet
// covers are marked so reviewers see what the reader sees. Picking a line opens
// the shared composer (via the selection context) with a code selector, so the
// resulting thread lands in the same sidebar as in-doc code comments.
import { useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { getSourceFile } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { hashLine } from "../../lib/content-ref";
import { useSelectionState } from "./selection-context";

export default function SourceFilePane({
  contentRef,
  path,
  anchorSlug,
  headingText,
  onClose,
}: {
  contentRef: ContentRef;
  path: string;
  anchorSlug: string;
  headingText: string;
  onClose: () => void;
}) {
  const { setPending } = useSelectionState();
  const [selecting, setSelecting] = useState(false);
  const { data, isLoading, error } = useQuery(getSourceFile, { ref: contentRef, path });

  const lines = data?.text.replace(/\n$/, "").split("\n") ?? [];
  // Lines covered by any in-doc snippet region (1-based, inclusive).
  const covered = new Set<number>();
  for (const s of data?.snippets ?? []) {
    for (let l = s.startLine; l <= s.endLine; l++) covered.add(l);
  }

  async function commentOnLine(lineNo: number, lineText: string) {
    setSelecting(true);
    setPending({
      kind: "code",
      path,
      region: "", // a full-source comment is not tied to a named region
      line: lineNo,
      endLine: lineNo,
      lineHash: await hashLine(lineText),
      fileHash: data?.fileHash ?? "",
      anchorSlug,
      headingText,
      quote: lineText.trim(),
    });
    setSelecting(false);
    onClose();
  }

  return (
    <div className="source-pane-backdrop" onClick={onClose}>
      <div className="source-pane" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Source: ${path}`}>
        <div className="source-pane-head">
          <span className="source-pane-path">{path}</span>
          <button className="source-pane-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {isLoading && <p className="source-pane-status">Loading source…</p>}
        {error && <p className="source-pane-status">Could not load source.</p>}
        {!isLoading && !error && (
          <ol className="source-lines">
            {lines.map((text, i) => {
              const lineNo = i + 1;
              return (
                <li key={lineNo} className={covered.has(lineNo) ? "covered" : undefined}>
                  <button
                    className="source-line-comment"
                    title="Comment on this line"
                    disabled={selecting}
                    onClick={() => void commentOnLine(lineNo, text)}
                  >
                    💬
                  </button>
                  <span className="source-line-no">{lineNo}</span>
                  <code className="source-line-text">{text || " "}</code>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
