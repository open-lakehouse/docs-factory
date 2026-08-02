// SourceFilePane — the "open full source" code-review surface. Given a snippet
// path, fetches the full registered source via GetSourceFile and renders it line
// by line so a reviewer can comment on ANY line, including code outside the
// `start=`/`end=` window inlined in the doc. The lines that the in-doc snippet
// covers are marked so reviewers see what the reader sees. Picking a line opens
// the shared composer (via the selection context) with a code selector, so the
// resulting thread lands in the same sidebar as in-doc code comments.

import { useQuery } from "@connectrpc/connect-query";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { getSourceFile } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="source-pane-head shrink-0 border-b px-4 py-3">
          <DialogTitle className="source-pane-path font-mono text-sm">{path}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="source-pane-status px-4 py-3">Loading source…</p>}
        {error && <p className="source-pane-status px-4 py-3">Could not load source.</p>}
        {!isLoading && !error && (
          <ol className="source-lines overflow-y-auto">
            {lines.map((text, i) => {
              const lineNo = i + 1;
              return (
                <li key={lineNo} className={cn(covered.has(lineNo) && "covered")}>
                  <button
                    className="source-line-comment"
                    title="Comment on this line"
                    disabled={selecting}
                    onClick={() => void commentOnLine(lineNo, text)}
                  >
                    <MessageSquarePlus className="size-3.5" aria-hidden />
                  </button>
                  <span className="source-line-no">{lineNo}</span>
                  <code className="source-line-text">{text || " "}</code>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
