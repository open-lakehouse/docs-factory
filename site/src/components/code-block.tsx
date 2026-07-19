// code-block.tsx — sleek chrome around build-time Shiki <pre> output.
// remark-fence-meta + @shikijs/rehype highlight fences at compile time;
// MdxProvider maps `pre` here. Clean surface with a floating copy button in the
// top-right; a slim header bar is rendered ONLY when the fence carries a
// filename (title="…"), so headerless blocks keep their clean lines.
//
// Review integration: Shiki runs at build time, so there's no runtime prop to
// pass highlighted lines. Instead this component reads the page review context
// and tags its OWN line spans (<span class="line">) for any commented source
// lines — reusing the native code surface rather than an overlay. The source
// line ↔ rendered line mapping uses data-src-start (the first inlined line).
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import CodeCopyButton from "./CodeCopyButton";
import LanguageIcon from "./LanguageIcon";
import { useReview } from "./review/review-context";

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  "data-filename"?: string;
  "data-lang"?: string;
  "data-src-path"?: string;
  "data-src-region"?: string;
  "data-src-start"?: string;
  children?: ReactNode;
}

/** Extract plain text from highlighted <pre><code> children for the clipboard. */
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

type LineProps = { className?: string; children?: ReactNode; onClick?: (e: React.MouseEvent) => void };

function hasLineClass(node: ReactElement<LineProps>): boolean {
  const cls = node.props.className;
  return typeof cls === "string" && cls.split(/\s+/).includes("line");
}

/**
 * Clone the compiled <code> subtree, adding review classes (+ a select handler)
 * to the line spans in `byIndex`. Line spans are the direct element children of
 * <code>, interleaved with "\n" text nodes, so their order gives the 0-based
 * rendered line index.
 */
function decorateCode(
  code: ReactElement<{ children?: ReactNode }>,
  byIndex: Map<number, { threadId: string; focused: boolean }>,
  onSelect: (id: string) => void,
): ReactElement {
  let idx = 0;
  const children = Children.map(code.props.children, (node) => {
    if (!isValidElement(node)) return node;
    const line = node as ReactElement<LineProps>;
    if (!hasLineClass(line)) return node;
    const i = idx++;
    const info = byIndex.get(i);
    if (!info) return node;
    const className =
      `${line.props.className ?? ""} cb-line-commented${info.focused ? " cb-line-commented-focus" : ""}`.trim();
    return cloneElement(line, {
      className,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(info.threadId);
      },
    });
  });
  return cloneElement(code, {}, children);
}

export function Pre({
  children,
  "data-filename": filename = "",
  "data-lang": lang = "text",
  "data-src-path": srcPath,
  "data-src-region": srcRegion = "",
  "data-src-start": srcStartAttr,
  className,
  ...props
}: PreProps) {
  const code = extractCode(children);
  const hasFilename = Boolean(filename);

  const review = useReview();
  const commented = srcPath ? review.codeLinesFor(srcPath, srcRegion) : [];

  // Map commented source lines → 0-based rendered line indices in this block.
  const byIndex = new Map<number, { threadId: string; focused: boolean }>();
  if (commented.length > 0) {
    const srcStart = Number(srcStartAttr ?? "1");
    for (const c of commented) {
      for (let l = c.line; l <= c.endLine; l++) {
        const i = l - srcStart;
        if (i < 0) continue;
        const prev = byIndex.get(i);
        byIndex.set(i, { threadId: c.threadId, focused: c.focused || Boolean(prev?.focused) });
      }
    }
  }

  const renderedChildren =
    byIndex.size > 0
      ? Children.map(children, (child) =>
          isValidElement(child) && child.type === "code"
            ? decorateCode(child as ReactElement<{ children?: ReactNode }>, byIndex, review.selectThread)
            : child,
        )
      : children;

  return (
    <div className="cb" data-lang={lang} data-has-filename={hasFilename ? "true" : undefined}>
      {hasFilename && (
        <div className="cb-head">
          <LanguageIcon lang={lang} />
          <span className="cb-file">{filename}</span>
        </div>
      )}
      <pre
        {...props}
        data-src-path={srcPath}
        data-src-region={srcRegion || undefined}
        data-src-start={srcStartAttr}
        className={className ? `cb-pre ${className}` : "cb-pre"}
      >
        {renderedChildren}
      </pre>
      <CodeCopyButton code={code} />
    </div>
  );
}
