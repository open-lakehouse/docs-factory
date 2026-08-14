// Chrome around build-time Shiki <pre> output; MdxProvider maps `pre` here.
//
// Review integration: Shiki runs at build time, so there's no runtime prop to
// pass highlighted lines. Instead this component reads the page review context
// and tags its OWN line spans (<span class="line">) for any commented source
// lines — reusing the native code surface rather than an overlay. In inline
// review mode it also inserts a conversation row into the code grid after the
// anchored line(s).

import { ChevronRight } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import CodeCopyButton from "./CodeCopyButton";
import LanguageIcon from "./LanguageIcon";
import PendingComposer from "./review/PendingComposer";
import { useReview } from "./review/review-context";
import { useSelectionState } from "./review/selection-context";
import ThreadConversation from "./review/ThreadConversation";

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  "data-filename"?: string;
  "data-lang"?: string;
  "data-src-path"?: string;
  "data-src-region"?: string;
  "data-src-start"?: string;
  "data-collapse"?: string;
  children?: ReactNode;
}

function extractCode(children: ReactNode): string {
  const parts: string[] = [];
  const walk = (node: ReactNode) => {
    if (typeof node === "string") parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement<{ children?: ReactNode }>(node)) {
      Children.forEach(node.props.children, walk);
    }
  };
  walk(children);
  return parts.join("");
}

type LineProps = {
  className?: string;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
};

function hasLineClass(node: ReactElement<LineProps>): boolean {
  const cls = node.props.className;
  return typeof cls === "string" && cls.split(/\s+/).includes("line");
}

function codeMatches(
  path: string,
  region: string,
  blockPath?: string,
  blockRegion?: string,
): boolean {
  if (!blockPath || blockPath !== path) return false;
  if (region && blockRegion && region !== blockRegion) return false;
  return true;
}

function decorateCode(
  code: ReactElement<{ children?: ReactNode }>,
  byIndex: Map<number, { threadId: string; focused: boolean }>,
  onSelect: (id: string) => void,
  inlineAfterIndex: number | null,
  inlinePanel: ReactNode | null,
): ReactElement {
  let idx = 0;
  const out: ReactNode[] = [];

  for (const node of Children.toArray(code.props.children)) {
    if (!isValidElement(node)) {
      out.push(node);
      continue;
    }
    const line = node as ReactElement<LineProps>;
    if (!hasLineClass(line)) {
      out.push(node);
      continue;
    }
    const i = idx++;
    const info = byIndex.get(i);
    const rendered = info
      ? cloneElement(line, {
          className:
            `${line.props.className ?? ""} cb-line-commented${info.focused ? " cb-line-commented-focus" : ""}`.trim(),
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect(info.threadId);
          },
        })
      : node;
    out.push(rendered);
    if (inlineAfterIndex === i && inlinePanel) {
      out.push(
        <div key="cb-inline-review" className="cb-inline-review">
          {inlinePanel}
        </div>,
      );
    }
  }

  return cloneElement(code, {}, out);
}

export function Pre({
  children,
  "data-filename": filename = "",
  "data-lang": lang = "text",
  "data-src-path": srcPath,
  "data-src-region": srcRegion = "",
  "data-src-start": srcStartAttr,
  "data-collapse": collapseAttr,
  className,
  ...props
}: PreProps) {
  const code = extractCode(children);
  const hasFilename = Boolean(filename);
  const collapsible = collapseAttr === "true";
  // Collapsible blocks start closed; clicking the header toggles them open.
  const [open, setOpen] = useState(false);

  const review = useReview();
  const { pending, setPending } = useSelectionState();
  const commented = srcPath ? review.codeLinesFor(srcPath, srcRegion) : [];
  const srcStart = Number(srcStartAttr ?? "1");

  const byIndex = new Map<number, { threadId: string; focused: boolean }>();
  for (const c of commented) {
    for (let l = c.line; l <= c.endLine; l++) {
      const i = l - srcStart;
      if (i < 0) continue;
      const prev = byIndex.get(i);
      byIndex.set(i, { threadId: c.threadId, focused: c.focused || Boolean(prev?.focused) });
    }
  }

  let inlineAfterIndex: number | null = null;
  let inlinePanel: ReactNode | null = null;

  if (review.displayMode === "inline" && srcPath && review.contentRef) {
    if (pending?.kind === "code" && codeMatches(pending.path, pending.region, srcPath, srcRegion)) {
      inlineAfterIndex = pending.endLine - srcStart;
      inlinePanel = (
        <PendingComposer
          contentRef={review.contentRef}
          pending={pending}
          onDone={() => {
            setPending(null);
            review.refetch();
          }}
          onCancel={() => setPending(null)}
          compact
        />
      );
    } else if (review.selectedThreadId) {
      const thread = review.threadById(review.selectedThreadId);
      const sel = thread?.root?.codeSelector;
      if (thread && sel && codeMatches(sel.path, sel.region, srcPath, srcRegion)) {
        inlineAfterIndex = sel.endLine - srcStart;
        const sectionEl = thread.root?.anchorSlug
          ? document.getElementById(thread.root.anchorSlug)
          : null;
        inlinePanel = (
          <ThreadConversation
            thread={thread}
            sectionLabel={sectionEl?.textContent ?? ""}
            onChange={review.refetch}
            onClose={() => review.selectThread(null)}
            compact
          />
        );
      }
    }
  }

  const renderedChildren =
    byIndex.size > 0 || inlinePanel
      ? Children.map(children, (child) =>
          isValidElement(child) && child.type === "code"
            ? decorateCode(
                child as ReactElement<{ children?: ReactNode }>,
                byIndex,
                review.selectThread,
                inlineAfterIndex,
                inlinePanel,
              )
            : child,
        )
      : children;

  // Review activity inside the block (a commented line or an inline panel) must
  // never be hidden behind a collapsed box — force it open in that case.
  const forcedOpen = byIndex.size > 0 || Boolean(inlinePanel);
  const expanded = !collapsible || open || forcedOpen;
  // A collapsible block always gets a clickable header so there's something to
  // toggle, even when the fence carries no title="…".
  const showHeader = hasFilename || collapsible;

  return (
    <div
      className="cb"
      data-lang={lang}
      data-has-filename={hasFilename ? "true" : undefined}
      data-collapsible={collapsible ? "true" : undefined}
      data-collapsed={collapsible && !expanded ? "true" : undefined}
    >
      {showHeader &&
        (collapsible ? (
          <button
            type="button"
            className="cb-head cb-head-toggle"
            aria-expanded={expanded}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronRight className="cb-chevron" aria-hidden="true" />
            <LanguageIcon lang={lang} />
            <span className="cb-file">{filename || (expanded ? "Hide code" : "Show code")}</span>
          </button>
        ) : (
          <div className="cb-head">
            <LanguageIcon lang={lang} />
            <span className="cb-file">{filename}</span>
          </div>
        ))}
      {expanded && (
        <pre
          {...props}
          data-src-path={srcPath}
          data-src-region={srcRegion || undefined}
          data-src-start={srcStartAttr}
          className={className ? `cb-pre ${className}` : "cb-pre"}
        >
          {renderedChildren}
        </pre>
      )}
      {/* `code` holds the full contents regardless of expand state. */}
      <CodeCopyButton code={code} />
    </div>
  );
}
