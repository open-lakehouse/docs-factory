// The runnable-script view: a PEP-723 Python script served alongside a tutorial
// (agentic-docs Phase 3). Reviewers can comment on any line, reusing the exact
// code-selection path SourceFilePane uses — a `code` pending selection under the
// page's ReviewProvider, so a script thread lands in the same right-pane sidebar
// as in-doc code comments, grouped by the script's repo path.
//
// Line commenting needs the file registered as a content_source (so the
// GetSourceFile RPC resolves it with a real fileHash for re-anchoring). Every
// current tutorial script is inlined via a `file=` fence and thus registered; if
// a script ever isn't, GetSourceFile returns NotFound and we degrade to a
// read-only highlighted listing rather than offering comments that can't anchor.
//
// Syntax highlighting uses Shiki at RUNTIME (the site otherwise highlights at
// build time via @shikijs/rehype). codeToHtml is dynamically imported so its
// bundle only loads when a script tab is actually opened.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useQuery as useConnectQuery } from "@connectrpc/connect-query";
import { MessageSquarePlus } from "lucide-react";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { getSourceFile } from "../../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { hashLine } from "../../../lib/content-ref";
import type { ScriptEntry } from "../../../lib/scripts-index";
import { SelectionProvider, useSelectionState } from "../selection-context";
import { ReviewProvider } from "../review-context";
import CommentSidebar from "../CommentSidebar";
import { useRightPaneSlot } from "./right-pane-slot";
import { tabDomId, tabPanelDomId } from "./tab-ids";
import { useAuth } from "../../../lib/auth-context";
import { cn } from "@/lib/utils";

/** Fetch the raw served script text (used for display + read-only fallback). */
async function fetchScript(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`script ${res.status}`);
  return res.text();
}

export default function ScriptView({
  token,
  contentRef,
  entry,
  isActive,
}: {
  token: string;
  contentRef: ContentRef;
  entry: ScriptEntry;
  isActive: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  return (
    <SelectionProvider>
      <ReviewProvider contentRef={contentRef} isActive={isActive}>
        <ScriptViewBody
          token={token}
          contentRef={contentRef}
          entry={entry}
          isActive={isActive}
          articleRef={articleRef}
        />
      </ReviewProvider>
    </SelectionProvider>
  );
}

function ScriptViewBody({
  token,
  contentRef,
  entry,
  isActive,
  articleRef,
}: {
  token: string;
  contentRef: ContentRef;
  entry: ScriptEntry;
  isActive: boolean;
  articleRef: React.RefObject<HTMLElement | null>;
}) {
  const { reviewActive } = useAuth();
  const { setPending } = useSelectionState();
  const slot = useRightPaneSlot();

  // Raw served text — always available, drives display + highlighting.
  const { data: raw, isLoading, error } = useQuery({
    queryKey: ["script-raw", entry.fetchUrl],
    queryFn: () => fetchScript(entry.fetchUrl),
    staleTime: Infinity,
    retry: false,
  });

  // Registered source (for commenting): resolves path → text + fileHash. A
  // NotFound just means the file isn't a content_source; commenting stays off.
  const { data: source } = useConnectQuery(
    getSourceFile,
    { ref: contentRef, path: entry.gitPath },
    { retry: false },
  );
  const canComment = reviewActive && Boolean(source?.fileHash);

  // One normalized source string drives BOTH the line list and highlighting, so
  // line numbers, comment affordances, and highlighted tokens stay aligned.
  const code = (raw ?? "").replace(/\n$/, "");
  const lines = code.split("\n");
  const shikiLines = useShikiLines(code);
  // Only trust the highlight when it splits into exactly the same line count;
  // otherwise fall back to plain text rather than misalign rows.
  const highlighted = shikiLines && shikiLines.length === lines.length ? shikiLines : null;
  const [selecting, setSelecting] = useState(false);

  async function commentOnLine(lineNo: number, lineText: string) {
    if (!canComment) return;
    setSelecting(true);
    setPending({
      kind: "code",
      path: entry.gitPath,
      region: "", // a full-file comment isn't tied to a named snippet region
      line: lineNo,
      endLine: lineNo,
      lineHash: await hashLine(lineText),
      fileHash: source?.fileHash ?? "",
      anchorSlug: "",
      headingText: "",
      quote: lineText.trim(),
    });
    setSelecting(false);
  }

  return (
    <>
      <div
        id={tabPanelDomId(token)}
        role="tabpanel"
        aria-labelledby={tabDomId(token)}
        tabIndex={isActive ? 0 : -1}
        className={cn("flex min-h-0 flex-1 flex-col focus-visible:outline-none", !isActive && "hidden")}
        hidden={!isActive}
      >
        <ContractHeader entry={entry} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-6 text-muted-foreground">Loading script…</p>}
          {error && <p className="p-6 text-muted-foreground">Could not load script.</p>}
          {!isLoading && !error && (
            <ol className="script-lines" ref={articleRef as React.RefObject<HTMLOListElement>}>
              {lines.map((text, i) => {
                const lineNo = i + 1;
                return (
                  <li key={lineNo} className="script-line">
                    {canComment && (
                      <button
                        type="button"
                        className="script-line-comment"
                        title="Comment on this line"
                        disabled={selecting}
                        onClick={() => void commentOnLine(lineNo, text)}
                      >
                        <MessageSquarePlus className="size-3.5" aria-hidden />
                      </button>
                    )}
                    <span className="script-line-no">{lineNo}</span>
                    {highlighted ? (
                      <code
                        className="script-line-text"
                        // Per-line HTML from Shiki (token <span>s only).
                        dangerouslySetInnerHTML={{ __html: highlighted[i] ?? "" }}
                      />
                    ) : (
                      <code className="script-line-text">{text || " "}</code>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      {isActive &&
        slot &&
        createPortal(
          <div className="review-rail-body p-3">
            <CommentSidebar articleRef={articleRef} />
          </div>,
          slot,
        )}
    </>
  );
}

/** The PEP-723 / [tool.docs-factory] contract, straight from scripts.json. */
function ContractHeader({ entry }: { entry: ScriptEntry }) {
  const bits: { label: string; value: string }[] = [];
  if (entry.requiresPython) bits.push({ label: "python", value: entry.requiresPython });
  if (entry.dependencies?.length) bits.push({ label: "deps", value: entry.dependencies.join(", ") });
  if (entry.services?.length) bits.push({ label: "services", value: entry.services.join(", ") });
  if (entry.baseUrlEnv) bits.push({ label: "base url env", value: entry.baseUrlEnv });
  return (
    <div className="shrink-0 border-b px-4 py-2">
      <p className="font-mono text-xs text-muted-foreground">{entry.gitPath}</p>
      {bits.length > 0 && (
        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {bits.map((b) => (
            <div key={b.label} className="flex gap-1">
              <dt className="text-muted-foreground">{b.label}:</dt>
              <dd className="font-mono">{b.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Lazily highlight the whole script with Shiki, then split into per-line inner
 * HTML so each <code> row carries only its own tokens (keeps the commentable
 * <li>-per-line structure). Returns null until highlighting resolves, so callers
 * fall back to plain text meanwhile.
 */
function useShikiLines(code: string): string[] | null {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!code.trim()) {
      setLines(null);
      return;
    }
    void (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(code, { lang: "python", theme: "github-dark-dimmed" });
        if (!alive) return;
        // Shiki wraps each source line in <span class="line">…</span>; pull the
        // inner HTML of each so we can place one line per commentable row.
        const doc = new DOMParser().parseFromString(html, "text/html");
        const lineEls = Array.from(doc.querySelectorAll("span.line"));
        setLines(lineEls.map((el) => el.innerHTML));
      } catch {
        if (alive) setLines(null); // fall back to plain text on any failure
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);
  return lines;
}
